import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLiveTables } from '../src/liveTables.js';
import { fakePlayersClient, fakeTablesRepository } from './fakes.js';

const ana = '00000000-0000-4000-8000-000000000001';
const ben = '00000000-0000-4000-8000-000000000002';
const cleo = '00000000-0000-4000-8000-000000000003';
const ghost = '00000000-0000-4000-8000-000000000099';

let app;
let tables;
let live;
let players;
let codes;

beforeEach(() => {
  tables = fakeTablesRepository();
  live = createLiveTables({ tables, logger: () => {} });
  players = fakePlayersClient({ [ana]: 'Ana', [ben]: 'Ben', [cleo]: 'Cleo' });
  codes = ['K7QX2M', 'P4WN9R'];
  app = createApp({
    checkDatabase: async () => {},
    tables,
    live,
    players,
    generateId: () => codes.shift(),
    uiOrigin: 'http://localhost:5173',
    logger: () => {},
  });
});

afterEach(() => live.close());

const createTable = (body = { playerId: ana }) => request(app).post('/tables').send(body);

describe('POST /tables', () => {
  it('creates a table with default settings and seats the creator', async () => {
    const response = await createTable();
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: 'K7QX2M',
      smallBlind: 5,
      bigBlind: 10,
      startingStack: 1000,
      maxSeats: 6,
      createdBy: ana,
      seats: [{ seatIndex: 0, playerId: ana, name: 'Ana', stack: 1000 }],
    });
  });

  it('keeps valid custom settings', async () => {
    const response = await createTable({
      playerId: ana, smallBlind: 10, bigBlind: 20, startingStack: 500, maxSeats: 4,
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ smallBlind: 10, bigBlind: 20, startingStack: 500, maxSeats: 4 });
    expect(response.body.seats[0].stack).toBe(500);
  });

  it.each([
    [{}, 'playerId'],
    [{ playerId: 'not-a-uuid' }, 'playerId'],
    [{ playerId: ana, smallBlind: 20, bigBlind: 10 }, 'Blinds'],
    [{ playerId: ana, smallBlind: 0 }, 'Blinds'],
    [{ playerId: ana, bigBlind: 2.5 }, 'Blinds'],
    [{ playerId: ana, startingStack: 5 }, 'startingStack'],
    [{ playerId: ana, maxSeats: 7 }, 'maxSeats'],
    [{ playerId: ana, maxSeats: 1 }, 'maxSeats'],
  ])('rejects %j with 400', async (body, field) => {
    const response = await createTable(body);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_INPUT');
    expect(response.body.message).toContain(field);
    expect(tables.rows.size).toBe(0);
  });

  it('rejects a body that is not an object', async () => {
    const response = await request(app).post('/tables').send([ana]);
    expect(response.status).toBe(400);
  });

  it('rejects malformed JSON with 400, not 503', async () => {
    const response = await request(app)
      .post('/tables')
      .set('Content-Type', 'application/json')
      .send('{"playerId":');
    expect(response.status).toBe(400);
  });

  it('returns 404 when the players service does not know the player', async () => {
    const response = await createTable({ playerId: ghost });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Player not found', code: 'NOT_FOUND' });
    expect(tables.rows.size).toBe(0);
  });

  it('returns a clear 503 when the players service is down, and creates nothing', async () => {
    players.down = true;
    const response = await createTable();
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ message: 'Player service unavailable', code: 'PLAYERS_UNAVAILABLE' });
    expect(tables.rows.size).toBe(0);
  });

  it('returns 503 without details when the database fails', async () => {
    tables.createTable = async () => { throw new Error('private connection details'); };
    const response = await createTable();
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ message: 'Tables unavailable', code: 'UNAVAILABLE' });
    expect(response.text).not.toContain('private');
  });
});

describe('GET /tables/:id', () => {
  it('returns the table and its seats', async () => {
    await createTable();
    const response = await request(app).get('/tables/K7QX2M');
    expect(response.status).toBe(200);
    expect(response.body.seats).toHaveLength(1);
  });

  it('accepts the code in lowercase', async () => {
    await createTable();
    const response = await request(app).get('/tables/k7qx2m');
    expect(response.status).toBe(200);
    expect(response.body.id).toBe('K7QX2M');
  });

  it('returns 404 for an unknown code and 400 for a malformed one', async () => {
    expect((await request(app).get('/tables/ZZZZZZ')).status).toBe(404);
    const malformed = await request(app).get('/tables/abc');
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe('INVALID_INPUT');
  });
});

describe('POST /tables/:id/join', () => {
  const join = (playerId, id = 'K7QX2M') => request(app).post(`/tables/${id}/join`).send({ playerId });

  it('seats the player at the first free seat with the starting stack', async () => {
    await createTable();
    const response = await join(ben);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ seatIndex: 1, alreadySeated: false });
    expect(response.body.table.seats).toEqual([
      { seatIndex: 0, playerId: ana, name: 'Ana', stack: 1000 },
      { seatIndex: 1, playerId: ben, name: 'Ben', stack: 1000 },
    ]);
  });

  it('gives a seated player their seat back with a message, without calling players', async () => {
    await createTable();
    await join(ben);
    players.down = true; // Reloading the page still works when players is down.
    const response = await join(ben);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      seatIndex: 1,
      alreadySeated: true,
      message: 'You are already at this table',
    });
    expect(response.body.table.seats).toHaveLength(2);
  });

  it('returns 409 when the table is full, without calling players', async () => {
    await createTable({ playerId: ana, maxSeats: 2 });
    await join(ben);
    const callsBefore = players.calls;
    const response = await join(cleo);
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ message: 'This table is full', code: 'TABLE_FULL' });
    expect(players.calls).toBe(callsBefore);
  });

  it('returns 404 for an unknown table or an unknown player', async () => {
    expect((await join(ben, 'ZZZZZZ')).body.message).toBe('Table not found');
    await createTable();
    const response = await join(ghost);
    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Player not found');
  });

  it('returns a clear 503 when the players service is down', async () => {
    await createTable();
    players.down = true;
    const response = await join(ben);
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('PLAYERS_UNAVAILABLE');
    expect((await request(app).get('/tables/K7QX2M')).body.seats).toHaveLength(1);
  });

  it('rejects a missing or malformed playerId', async () => {
    await createTable();
    expect((await join(undefined)).status).toBe(400);
    expect((await join('nope')).status).toBe(400);
  });

  it('reports what the repository decided when another join got there first', async () => {
    await createTable();
    tables.joinTable = async () => ({ status: 'full' });
    expect((await join(ben)).status).toBe(409);
    tables.joinTable = async () => ({ status: 'not_found' });
    expect((await join(ben)).status).toBe(404);
    tables.joinTable = async () => ({ status: 'already_seated', seatIndex: 3 });
    const response = await join(ben);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ seatIndex: 3, alreadySeated: true });
  });
});

describe('DELETE /tables/:id', () => {
  const remove = (playerId, id = 'K7QX2M') =>
    request(app).delete(`/tables/${id}`).query(playerId === undefined ? {} : { playerId });

  it('lets the creator delete the table', async () => {
    await createTable();
    const response = await remove(ana);
    expect(response.status).toBe(204);
    expect((await request(app).get('/tables/K7QX2M')).status).toBe(404);
  });

  it('forbids anyone else', async () => {
    await createTable();
    const response = await remove(ben);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
    expect(tables.rows.has('K7QX2M')).toBe(true);
  });

  it('requires a valid playerId and an existing table', async () => {
    await createTable();
    expect((await remove(undefined)).status).toBe(400);
    expect((await remove(ana, 'ZZZZZZ')).status).toBe(404);
  });

  it('returns 404 if the table disappeared in the meantime', async () => {
    await createTable();
    tables.deleteTable = async () => false;
    expect((await remove(ana)).status).toBe(404);
  });
});

describe('unknown routes', () => {
  it('return 404 in the team error format', async () => {
    const response = await request(app).get('/nothing-here');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Not found', code: 'NOT_FOUND' });
  });
});