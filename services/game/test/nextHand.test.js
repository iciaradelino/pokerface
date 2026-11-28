import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLiveTables } from '../src/liveTables.js';
import { fakePlayersClient, fakeTablesRepository } from './fakes.js';

// Dealing the next hand by itself, or only when a player asks for it, through HTTP.
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
  await request(app).post('/tables/K7QX2M/join').send({ playerId: ben });
});

afterEach(() => {
  live.close();
  vi.useRealTimers();
});

const post = (path, body) => request(app).post(`/tables/K7QX2M/${path}`).send(body);
const autoDeal = (playerId, value) => post('auto-deal', { playerId, autoDeal: value });
const nextHand = (playerId) => post('next-hand', { playerId });
const wait = (ms = PAUSE) => vi.advanceTimersByTimeAsync(ms);
const handNumber = async () => (await live.view('K7QX2M', ana)).state.handNumber;
const stateOf = async () => (await live.view('K7QX2M', ana)).state;

/** Plays the hand out: whoever has to act folds. */
async function endHand() {
  for (const playerId of [ana, ben]) {
    const response = await post('actions', { playerId, action: 'fold' });
    if (response.status === 200) return;
  }
  throw new Error('nobody could fold');
}

describe('POST /tables/:id/auto-deal', () => {
  it('deals by itself unless the creator turns it off', async () => {
    expect((await stateOf()).autoNext).toBe(true);
    await wait();
    expect(await handNumber()).toBe(1);
    await endHand();
    await wait();
    expect(await handNumber()).toBe(2);
  });

  it('keeps the next hand waiting once it is off', async () => {
    await wait();
    expect((await autoDeal(ana, false)).body).toEqual({ autoDeal: false });
    expect((await stateOf()).autoNext).toBe(false);
    await endHand();
    await wait(PAUSE * 3);
    expect(await handNumber()).toBe(1);
    expect((await stateOf()).stage).toBe('complete');
  });

  it('cancels a hand that was about to be dealt, and deals it again when turned back on', async () => {
    await wait();
    await endHand(); // the next hand is scheduled
    await autoDeal(ana, false);
    await wait(PAUSE * 2);
    expect(await handNumber()).toBe(1);
    await autoDeal(ana, true);
    await wait();
    expect(await handNumber()).toBe(2);
  });

  it('is only for the creator, and needs true or false', async () => {
    const forbidden = await autoDeal(ben, false);
    expect(forbidden.status).toBe(403);
    expect((await stateOf()).autoNext).toBe(true);
    expect((await post('auto-deal', { playerId: ana, autoDeal: 'no' })).status).toBe(400);
    expect((await post('auto-deal', { playerId: ana })).status).toBe(400);
    expect((await post('auto-deal', { playerId: 'nope', autoDeal: false })).status).toBe(400);
    expect(
      (await request(app).post('/tables/ZZZZZZ/auto-deal').send({ playerId: ana, autoDeal: false }))
        .status,
    ).toBe(404);
  });

  it('returns 404 if the table disappeared in the meantime', async () => {
    live.setAutoNext = async () => false;
    expect((await autoDeal(ana, false)).status).toBe(404);
  });
});

describe('POST /tables/:id/next-hand', () => {
  it('deals the next hand at once for any seated player', async () => {
    await wait();
    await autoDeal(ana, false);
    await endHand();
    expect((await nextHand(ben)).status).toBe(200);
    expect(await handNumber()).toBe(2);
  });

  it('also works while the table still deals by itself', async () => {
    await wait();
    await endHand();
    expect((await nextHand(ana)).status).toBe(200);
    expect(await handNumber()).toBe(2);
    await wait(PAUSE * 2); // the hand that was scheduled does not start a third one
    expect(await handNumber()).toBe(2);
  });

  it('is refused while a hand is being played', async () => {
    await wait();
    const response = await nextHand(ana);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('HAND_IN_PROGRESS');
    expect(await handNumber()).toBe(1);
  });

  it('is refused to someone who is not seated, and checks the input', async () => {
    await wait();
    await endHand();
    const stranger = await nextHand(cleo);
    expect(stranger.status).toBe(403);
    expect(stranger.body.code).toBe('NOT_SEATED');
    expect((await nextHand('nope')).status).toBe(400);
    expect(
      (await request(app).post('/tables/ZZZZZZ/next-hand').send({ playerId: ana })).status,
    ).toBe(404);
  });

  it('is refused when the table is paused', async () => {
    await wait();
    await endHand();
    await post('pause', { playerId: ana });
    const response = await nextHand(ana);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('NOT_READY');
  });

  it('is refused when only one player is left', async () => {
    await wait();
    await endHand();
    await post('leave', { playerId: ben });
    expect((await nextHand(ana)).body.code).toBe('NOT_READY');
  });
});
