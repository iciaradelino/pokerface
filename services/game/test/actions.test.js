import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLiveTables } from '../src/liveTables.js';
import { fakePlayersClient, fakeTablesRepository } from './fakes.js';

// POST /tables/:id/actions through HTTP, with the real engine and a fake database.
const ana = '00000000-0000-4000-8000-000000000001';
const ben = '00000000-0000-4000-8000-000000000002';
const cleo = '00000000-0000-4000-8000-000000000003';
const PAUSE = 5000;

let app;
let live;
let tables;
let logs;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  tables = fakeTablesRepository();
  live = createLiveTables({ tables, handPauseMs: PAUSE, logger: () => {} });
  logs = [];
  app = createApp({
    checkDatabase: async () => {},
    tables,
    live,
    players: fakePlayersClient({ [ana]: 'Ana', [ben]: 'Ben', [cleo]: 'Cleo' }),
    generateId: () => 'K7QX2M',
    uiOrigin: 'http://localhost:5173',
    logger: (line) => logs.push(JSON.parse(line)),
  });
  await request(app).post('/tables').send({ playerId: ana });
  await request(app).post('/tables/K7QX2M/join').send({ playerId: ben });
});

afterEach(() => {
  live.close();
  vi.useRealTimers();
});

const act = (body, id = 'K7QX2M') => request(app).post(`/tables/${id}/actions`).send(body);
const startHand = () => vi.advanceTimersByTimeAsync(PAUSE);

async function whoActs() {
  const game = await live.get('K7QX2M');
  return game.hand.players[game.hand.toAct].id;
}

describe('POST /tables/:id/actions', () => {
  it('plays a whole hand over HTTP until it is saved', async () => {
    await startHand();
    let response;
    for (let moves = 0; moves < 20; moves++) {
      const player = await whoActs();
      const legal = (await live.view('K7QX2M', player)).private.legalActions;
      response = await act({ playerId: player, action: legal.includes('call') ? 'call' : 'check' });
      expect(response.status).toBe(200);
      if (response.body.state.stage === 'complete') break;
    }
    expect(response.body.state.stage).toBe('complete');
    expect(response.body.state.result.winners.length).toBeGreaterThan(0);
    expect(tables.hands).toHaveLength(1);
  });

  it('answers with the public state and only the acting player\'s cards', async () => {
    await startHand();
    const player = await whoActs();
    const response = await act({ playerId: player, action: 'call' });
    expect(response.body.state.type).toBe('state');
    expect(response.body.private).toMatchObject({ type: 'private', playerId: player });
    expect(response.body.state.seats.every((seat) => !('holeCards' in seat))).toBe(true);
  });

  it('accepts a raise to a valid amount and rejects an invalid one with 400', async () => {
    await startHand();
    const player = await whoActs();
    const { minRaise } = (await live.view('K7QX2M', player)).private;
    const bad = await act({ playerId: player, action: 'raise', amount: 3 });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_AMOUNT');
    const good = await act({ playerId: player, action: 'raise', amount: minRaise });
    expect(good.status).toBe(200);
  });

  it('returns 409 when it is not your turn, with the engine message', async () => {
    await startHand();
    const waiting = (await whoActs()) === ana ? ben : ana;
    const response = await act({ playerId: waiting, action: 'fold' });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ message: 'It is not your turn', code: 'NOT_YOUR_TURN' });
  });

  it('returns 409 when no hand is being played', async () => {
    const response = await act({ playerId: ana, action: 'check' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('NO_HAND');
  });

  it('returns 400 for an unknown action or a missing playerId', async () => {
    await startHand();
    const unknown = await act({ playerId: await whoActs(), action: 'bluff' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe('INVALID_ACTION');
    expect((await act({ action: 'fold' })).status).toBe(400);
  });

  it('returns 404 for a player who is not in the hand and for an unknown table', async () => {
    await startHand();
    expect((await act({ playerId: cleo, action: 'fold' })).status).toBe(404);
    expect((await act({ playerId: ana, action: 'fold' }, 'ZZZZZZ')).status).toBe(404);
  });

  it('returns 503 without details when something unexpected fails', async () => {
    live.act = async () => { throw new Error('private details'); };
    const response = await act({ playerId: ana, action: 'fold' });
    expect(response.status).toBe(503);
    expect(response.text).not.toContain('private');
  });

  it('logs one line per action with the route, status and duration, without the body', async () => {
    await startHand();
    await act({ playerId: await whoActs(), action: 'call' });
    const line = logs.find((l) => l.path === '/tables/K7QX2M/actions');
    expect(line).toMatchObject({ event: 'request', method: 'POST', status: 200 });
    expect(line.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(line)).not.toContain('call');
  });
});