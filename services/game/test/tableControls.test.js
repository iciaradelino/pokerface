import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLiveTables } from '../src/liveTables.js';
import { fakePlayersClient, fakeTablesRepository } from './fakes.js';

// Leaving, pausing and deleting through HTTP, with the real live tables and a fake database.
const ana = '00000000-0000-4000-8000-000000000001';
const ben = '00000000-0000-4000-8000-000000000002';
const cleo = '00000000-0000-4000-8000-000000000003';
const PAUSE = 5000;

let app;
let tables;
let live;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  tables = fakeTablesRepository();
  live = createLiveTables({ tables, handPauseMs: PAUSE, logger: () => {} });
  app = createApp({
    checkDatabase: async () => {},
    tables,
    live,
    players: fakePlayersClient({ [ana]: 'Ana', [ben]: 'Ben', [cleo]: 'Cleo' }),
    generateId: () => 'K7QX2M',
    uiOrigin: 'http://localhost:5173',
    logger: () => {},
  });
  await request(app).post('/tables').send({ playerId: ana });
});

afterEach(() => {
  live.close();
  vi.useRealTimers();
});

const join = (playerId) => request(app).post('/tables/K7QX2M/join').send({ playerId });
const leave = (playerId) => request(app).post('/tables/K7QX2M/leave').send({ playerId });
const pause = (playerId) => request(app).post('/tables/K7QX2M/pause').send({ playerId });
const resume = (playerId) => request(app).post('/tables/K7QX2M/resume').send({ playerId });
const remove = (playerId) => request(app).delete('/tables/K7QX2M').query({ playerId });
const startHand = () => vi.advanceTimersByTimeAsync(PAUSE);

describe('POST /tables/:id/leave', () => {
  it('frees the seat at once between hands', async () => {
    await join(ben);
    const response = await leave(ben);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ leftNow: true });
    expect((await request(app).get('/tables/K7QX2M')).body.seats).toHaveLength(1);
  });

  it('folds a player in a hand and frees the seat when it ends', async () => {
    await join(ben);
    await join(cleo);
    await startHand();
    const response = await leave(cleo);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ leftNow: false });
    expect(response.body.message).toContain('when this hand ends');
  });

  it('returns 404 NOT_SEATED for a player who is not at the table, and 400 without playerId', async () => {
    const response = await leave(ben);
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_SEATED');
    expect((await leave('nope')).status).toBe(400);
    expect((await request(app).post('/tables/ZZZZZZ/leave').send({ playerId: ben })).status).toBe(404);
  });
});

describe('POST /tables/:id/pause and /resume', () => {
  it('lets the creator pause and resume, and returns the table', async () => {
    const paused = await pause(ana);
    expect(paused.status).toBe(200);
    expect(paused.body.paused).toBe(true);
    const resumed = await resume(ana);
    expect(resumed.body.paused).toBe(false);
  });

  it('forbids anyone else and checks the playerId', async () => {
    await join(ben);
    expect((await pause(ben)).status).toBe(403);
    expect((await pause('nope')).status).toBe(400);
    expect((await request(app).post('/tables/K7QX2M/pause').send([])).status).toBe(400);
    expect((await request(app).post('/tables/ZZZZZZ/pause').send({ playerId: ana })).status).toBe(404);
  });

  it('returns 404 if the table disappeared in the meantime', async () => {
    live.setPaused = async () => false;
    expect((await pause(ana)).status).toBe(404);
  });
});

describe('DELETE /tables/:id during a hand', () => {
  it('returns 409 while a hand is being played, and deletes the table between hands', async () => {
    await join(ben);
    await startHand();
    const blocked = await remove(ana);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('HAND_IN_PROGRESS');
    await leave(ben); // Ben folds: the hand ends and is saved.
    expect((await remove(ana)).status).toBe(204);
  });
});