import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import WebSocket from 'ws';
import { createApp } from '../src/app.js';
import { createLiveTables } from '../src/liveTables.js';
import { attachTableSockets, CLOSE } from '../src/tableSockets.js';
import { fakePlayersClient, fakeTablesRepository } from './fakes.js';

// The table WebSocket against a real HTTP server on a random port, with the real live tables
// and engine and a fake database. Hands start 50 ms after two players are seated.
const ana = '00000000-0000-4000-8000-000000000001';
const ben = '00000000-0000-4000-8000-000000000002';
const cleo = '00000000-0000-4000-8000-000000000003';
const UI = 'http://localhost:5173';

let server;
let live;
let sockets;
let tables;
let logs;
let port;
const open = [];

beforeEach(async () => {
  tables = fakeTablesRepository();
  logs = [];
  live = createLiveTables({
    tables,
    handPauseMs: 50,
    onChange: (id, game, extra) => sockets.broadcast(id, game, extra),
    onRemove: (id) => sockets.closeTable(id),
    logger: () => {},
  });
  const app = createApp({
    checkDatabase: async () => {},
    tables,
    live,
    players: fakePlayersClient({ [ana]: 'Ana', [ben]: 'Ben', [cleo]: 'Cleo' }),
    generateId: () => 'K7QX2M',
    uiOrigin: UI,
    logger: () => {},
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  port = server.address().port;
  sockets = attachTableSockets({ server, live, uiOrigin: UI, logger: (l) => logs.push(JSON.parse(l)) });
  await request(server).post('/tables').send({ playerId: ana });
});

afterEach(async () => {
  for (const ws of open) ws.terminate();
  open.length = 0;
  sockets.close();
  live.close();
  await new Promise((resolve) => server.close(resolve));
});

// Opens a socket and records everything it receives.
function connect(playerId, { code = 'K7QX2M', origin = UI } = {}) {
  const ws = new WebSocket(`ws://localhost:${port}/tables/${code}/ws?playerId=${playerId}`, {
    headers: origin ? { Origin: origin } : {},
  });
  ws.messages = [];
  ws.on('message', (data) => ws.messages.push(JSON.parse(data.toString())));
  ws.closed = new Promise((resolve) => ws.on('close', (closeCode, reason) => resolve({ code: closeCode, reason: reason.toString() })));
  ws.on('error', () => {});
  open.push(ws);
  return ws;
}

async function until(check, what) {
  for (let i = 0; i < 200; i++) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const last = (ws, type) => ws.messages.filter((m) => m.type === type).at(-1);
const join = (playerId) => request(server).post('/tables/K7QX2M/join').send({ playerId });

describe('connecting', () => {
  it('sends the state and the private view on connect, and logs a 101', async () => {
    const ws = connect(ana);
    await until(() => last(ws, 'private'), 'the private message');
    expect(last(ws, 'state')).toMatchObject({ type: 'state', stage: 'waiting' });
    expect(last(ws, 'private')).toMatchObject({ type: 'private', playerId: ana, holeCards: [] });
    const line = logs.find((l) => l.status === 101);
    expect(line).toMatchObject({ method: 'GET', path: '/tables/K7QX2M/ws' });
    expect(JSON.stringify(line)).not.toContain(ana); // No playerId in the logs.
  });

  it('refuses another origin before opening the connection', async () => {
    const ws = connect(ana, { origin: 'https://evil.example' });
    const status = await new Promise((resolve) => ws.on('unexpected-response', (_req, res) => resolve(res.statusCode)));
    expect(status).toBe(403);
    expect(logs.at(-1).status).toBe(403);
  });

  it('refuses a request without an origin', async () => {
    const ws = connect(ana, { origin: null });
    const status = await new Promise((resolve) => ws.on('unexpected-response', (_req, res) => resolve(res.statusCode)));
    expect(status).toBe(403);
  });

  it('answers 404 for a path that is not a table socket', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/nothing`, { headers: { Origin: UI } });
    ws.on('error', () => {});
    open.push(ws);
    const status = await new Promise((resolve) => ws.on('unexpected-response', (_req, res) => resolve(res.statusCode)));
    expect(status).toBe(404);
  });

  it.each([
    ['a player who is not seated', () => connect(cleo), CLOSE.NOT_SEATED],
    ['an unknown table', () => connect(ana, { code: 'ZZZZZZ' }), CLOSE.NOT_FOUND],
    ['a malformed table code', () => connect(ana, { code: 'abc' }), CLOSE.BAD_REQUEST],
    ['a malformed playerId', () => connect('nope'), CLOSE.BAD_REQUEST],
  ])('closes the socket of %s with a code the UI can read', async (_label, open, code) => {
    const ws = open();
    expect((await ws.closed).code).toBe(code);
    expect(ws.messages).toEqual([]);
  });

  it('closes the socket when the database is down, with a code the UI keeps retrying on', async () => {
    live.close();
    tables.getTable = async () => { throw new Error('down'); };
    const ws = connect(ana);
    const { code } = await ws.closed;
    // The server closes with 1011. On a busy machine the client can see the connection drop
    // before that close frame arrives (1006). Either way it is not 4400/4403/4404, so the UI
    // reconnects, which is what matters while the database is down.
    expect([1011, 1006]).toContain(code);
    expect(ws.messages).toEqual([]);
    expect(logs).toContainEqual(expect.objectContaining({ path: '/tables/K7QX2M/ws', status: 1011 }));
  });
});

describe('live updates', () => {
  it('tells everyone when a player joins and when a hand starts, with each player\'s own cards', async () => {
    const anaWs = connect(ana);
    await until(() => last(anaWs, 'private'), 'Ana connected');
    await join(ben);
    const benWs = connect(ben);
    await until(() => last(anaWs, 'state')?.stage === 'preflop', 'the hand to start for Ana');
    await until(() => last(benWs, 'state')?.stage === 'preflop', 'the hand to start for Ben');

    const anaCards = last(anaWs, 'private').holeCards;
    const benCards = last(benWs, 'private').holeCards;
    expect(anaCards).toHaveLength(2);
    expect(benCards).toHaveLength(2);
    expect(anaCards).not.toEqual(benCards);
    // Nobody ever receives another player's private message or cards.
    expect(anaWs.messages.every((m) => m.type !== 'private' || m.playerId === ana)).toBe(true);
    expect(JSON.stringify(anaWs.messages.filter((m) => m.type === 'state'))).not.toContain(benCards[0]);
    expect(last(anaWs, 'state').timerEndsAt).toEqual(expect.any(String));
  });

  it('sends the new state to both tabs of the same player after an action', async () => {
    await join(ben);
    const tab1 = connect(ana);
    const tab2 = connect(ana);
    await until(() => last(tab1, 'state')?.stage === 'preflop' && last(tab2, 'state')?.stage === 'preflop', 'the hand');
    const game = await live.get('K7QX2M');
    const player = game.hand.players[game.hand.toAct].id;
    const before = tab2.messages.length;
    await request(server).post('/tables/K7QX2M/actions').send({ playerId: player, action: 'call' });
    await until(() => tab2.messages.length > before, 'the update in the second tab');
    expect(sockets.count('K7QX2M')).toBe(2);
  });

  it('closes the socket of a player who leaves, with 4403', async () => {
    await join(ben);
    const benWs = connect(ben);
    await until(() => last(benWs, 'private'), 'Ben connected');
    await request(server).post('/tables/K7QX2M/leave').send({ playerId: ben });
    expect((await benWs.closed).code).toBe(CLOSE.NOT_SEATED);
  });

  it('closes every socket when the table is deleted, with 4404', async () => {
    const ws = connect(ana);
    await until(() => last(ws, 'private'), 'Ana connected');
    await request(server).delete('/tables/K7QX2M').query({ playerId: ana });
    expect((await ws.closed).code).toBe(CLOSE.NOT_FOUND);
    expect(sockets.count('K7QX2M')).toBe(0);
  });

  it('loads the table on connect, so hands resume after a restart', async () => {
    await join(ben);
    live.close(); // As after a scale-to-zero: nothing in memory.
    const ws = connect(ana);
    await until(() => last(ws, 'state')?.stage === 'preflop', 'the hand to start after reconnecting');
  });
});

describe('video signalling', () => {
  async function seatedPair() {
    await join(ben);
    const anaWs = connect(ana);
    const benWs = connect(ben);
    await until(() => last(anaWs, 'private') && last(benWs, 'private'), 'both connected');
    return { anaWs, benWs };
  }

  it('relays a signal to the other player with `from` set by the server', async () => {
    const { anaWs, benWs } = await seatedPair();
    anaWs.send(JSON.stringify({ type: 'signal', from: cleo, to: ben, data: { candidate: 'x' } }));
    const signal = await until(() => last(benWs, 'signal'), 'the signal');
    expect(signal).toEqual({ type: 'signal', from: ana, to: ben, data: { candidate: 'x' } });
    expect(last(anaWs, 'signal')).toBeUndefined();
  });

  it('drops signals for players who are not at the table, and anything that is not a signal', async () => {
    const { anaWs, benWs } = await seatedPair();
    anaWs.send(JSON.stringify({ type: 'signal', to: cleo, data: {} }));
    anaWs.send(JSON.stringify({ type: 'action', action: 'fold' }));
    anaWs.send('not json');
    anaWs.send(JSON.stringify({ type: 'signal', to: ben })); // no data
    anaWs.send(JSON.stringify({ type: 'signal', to: ben, data: { candidate: 'y' } }));
    const signal = await until(() => last(benWs, 'signal'), 'the valid signal');
    expect(signal.data).toEqual({ candidate: 'y' });
    expect(benWs.messages.filter((m) => m.type === 'signal')).toHaveLength(1);
  });
});

describe('heartbeat', () => {
  it('terminates a connection that stops answering pings', async () => {
    sockets.close();
    sockets = attachTableSockets({ server, live, uiOrigin: UI, heartbeatMs: 30, logger: () => {} });
    const ws = connect(ana);
    await until(() => last(ws, 'private'), 'Ana connected');
    ws._socket.pause(); // The client stops reading, so it never answers the pings.
    await until(() => sockets.count('K7QX2M') === 0, 'the dead connection to be removed');
  });
});