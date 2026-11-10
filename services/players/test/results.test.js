import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { fakeRepository } from './fakeRepository.js';

const uiOrigin = 'http://localhost:5173';
const missingId = '11111111-1111-4111-8111-111111111111';
const hand1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const hand2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let app;
let players;

beforeEach(() => {
  players = fakeRepository();
  app = createApp({ checkDatabase: async () => {}, players, uiOrigin, logger: () => {} });
});

const createPlayer = async (name) =>
  (await request(app).post('/players').send({ name })).body;
const saveResult = (id, body) => request(app).post(`/players/${id}/results`).send(body);

describe('POST /players/:id/results', () => {
  it('adds a win and subtracts a loss', async () => {
    const player = await createPlayer('Laura');
    const won = await saveResult(player.id, { handId: hand1, delta: 250 });
    expect(won.status).toBe(200);
    expect(won.body.chips).toBe(1250);
    const lost = await saveResult(player.id, { handId: hand2, delta: -50 });
    expect(lost.body.chips).toBe(1200);
  });

  it('does not count the same handId twice, and still answers 200', async () => {
    const player = await createPlayer('Laura');
    await saveResult(player.id, { handId: hand1, delta: 100 });
    const retry = await saveResult(player.id, { handId: hand1, delta: 100 });
    expect(retry.status).toBe(200);
    expect(retry.body.chips).toBe(1100);
  });

  it('never lets the chips go below 0', async () => {
    const player = await createPlayer('Laura');
    const response = await saveResult(player.id, { handId: hand1, delta: -5000 });
    expect(response.body.chips).toBe(0);
  });

  it('returns 404 for an unknown player', async () => {
    const response = await saveResult(missingId, { handId: hand1, delta: 10 });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Player not found', code: 'NOT_FOUND' });
  });

  it.each([
    ['a missing handId', { delta: 10 }],
    ['a handId that is not a UUID', { handId: 'hand-1', delta: 10 }],
    ['a missing delta', { handId: hand1 }],
    ['a delta that is not an integer', { handId: hand1, delta: 1.5 }],
    ['a delta sent as text', { handId: hand1, delta: '10' }],
    ['a delta that is too large', { handId: hand1, delta: 2_000_000_000 }],
  ])('rejects %s with 400 INVALID_INPUT', async (_label, body) => {
    const player = await createPlayer('Laura');
    const response = await saveResult(player.id, body);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_INPUT');
  });

  it('rejects a body that is not an object and an id that is not a UUID', async () => {
    const player = await createPlayer('Laura');
    expect((await request(app).post(`/players/${player.id}/results`).send([1])).status).toBe(400);
    expect((await saveResult('nope', { handId: hand1, delta: 1 })).status).toBe(400);
  });

  it('answers 503 when the database is down', async () => {
    const player = await createPlayer('Laura');
    vi.spyOn(players, 'saveResult').mockRejectedValueOnce(new Error('private details'));
    const response = await saveResult(player.id, { handId: hand1, delta: 10 });
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('UNAVAILABLE');
    expect(response.text).not.toContain('private');
  });
});

describe('GET /leaderboard', () => {
  it('is empty when there are no players', async () => {
    const response = await request(app).get('/leaderboard');
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('orders by chips, highest first, and breaks ties by name', async () => {
    const zoe = await createPlayer('Zoe');
    const ana = await createPlayer('Ana');
    const bea = await createPlayer('Bea');
    await saveResult(zoe.id, { handId: hand1, delta: 500 });
    await saveResult(bea.id, { handId: hand1, delta: 100 });
    await saveResult(ana.id, { handId: hand1, delta: 100 });
    const response = await request(app).get('/leaderboard');
    expect(response.body.map((entry) => entry.name)).toEqual(['Zoe', 'Ana', 'Bea']);
    expect(response.body[0]).toEqual({ id: zoe.id, name: 'Zoe', chips: 1500 });
  });

  it('returns at most 20 players', async () => {
    for (let i = 0; i < 25; i++) await createPlayer(`Player ${i}`);
    const response = await request(app).get('/leaderboard');
    expect(response.body).toHaveLength(20);
  });

  it('answers 503 when the database is down', async () => {
    vi.spyOn(players, 'leaderboard').mockRejectedValueOnce(new Error('private details'));
    const response = await request(app).get('/leaderboard');
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('UNAVAILABLE');
  });
});
