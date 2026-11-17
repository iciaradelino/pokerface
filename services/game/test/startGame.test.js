import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLiveTables } from '../src/liveTables.js';
import { fakePlayersClient, fakeTablesRepository } from './fakes.js';

// "Start game": new tables wait for their creator before the first hand, as the real repository
// creates them paused.
const ana = '00000000-0000-4000-8000-000000000001';
const ben = '00000000-0000-4000-8000-000000000002';
const PAUSE = 5000;

let app;
let live;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const tables = fakeTablesRepository({ newTablesPaused: true });
  live = createLiveTables({ tables, handPauseMs: PAUSE, logger: () => {} });
  app = createApp({
    checkDatabase: async () => {},
    tables,
    live,
    players: fakePlayersClient({ [ana]: 'Ana', [ben]: 'Ben' }),
    generateId: () => 'K7QX2M',
    uiOrigin: 'http://localhost:5173',
    logger: () => {},
  });
  await request(app).post('/tables').send({ playerId: ana });
  await request(app).post('/tables/K7QX2M/join').send({ playerId: ben });
});

afterEach(() => {
  live.close();
  vi.useRealTimers();
});

const start = (playerId) => request(app).post('/tables/K7QX2M/start').send({ playerId });
const inHand = async () => {
  const game = await live.get('K7QX2M');
  return game.hand !== null && game.hand.phase !== 'complete';
};

describe('POST /tables/:id/start', () => {
  it('keeps a new table waiting until the creator starts it', async () => {
    expect((await request(app).get('/tables/K7QX2M')).body.paused).toBe(true);
    await vi.advanceTimersByTimeAsync(PAUSE * 3);
    expect(await inHand()).toBe(false);
  });

  it('starts the first hand after the creator presses Start game, and tells the waiting room', async () => {
    const response = await start(ana);
    expect(response.status).toBe(200);
    expect(response.body.paused).toBe(false);
    expect((await request(app).get('/tables/K7QX2M')).body.paused).toBe(false);
    await vi.advanceTimersByTimeAsync(PAUSE);
    expect(await inHand()).toBe(true);
  });

  it('only lets the creator start the table', async () => {
    const response = await start(ben);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
    await vi.advanceTimersByTimeAsync(PAUSE);
    expect(await inHand()).toBe(false);
  });
});