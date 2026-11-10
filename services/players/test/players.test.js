import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { fakeRepository } from './fakeRepository.js';

const uiOrigin = 'http://localhost:5173';
const missingId = '11111111-1111-4111-8111-111111111111';

let app;
let players;

beforeEach(() => {
  players = fakeRepository();
  app = createApp({ checkDatabase: async () => {}, players, uiOrigin, logger: () => {} });
});

describe('POST /players', () => {
  it('creates a player with defaults and 1000 chips', async () => {
    const response = await request(app).post('/players').send({ name: 'Laura' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: 'Laura',
      avatar: '#B8F23A',
      chips: 1000,
      gestureSettings: {},
    });
    expect(response.body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps the given avatar and settings and trims the name', async () => {
    const response = await request(app)
      .post('/players')
      .send({ name: '  Ali  ', avatar: '#FF5FA2', gestureSettings: { holdMs: 800 } });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: 'Ali',
      avatar: '#FF5FA2',
      gestureSettings: { holdMs: 800 },
    });
  });

  it('ignores chips sent by the client', async () => {
    const response = await request(app).post('/players').send({ name: 'Laura', chips: 999999 });
    expect(response.body.chips).toBe(1000);
  });

  it.each([
    ['a missing name', {}],
    ['an empty name', { name: '   ' }],
    ['a name over 30 characters', { name: 'x'.repeat(31) }],
    ['a name that is not text', { name: 5 }],
    ['an avatar that is not a hex colour', { name: 'A', avatar: 'red' }],
    ['settings that are not an object', { name: 'A', gestureSettings: 'fast' }],
    ['settings that are an array', { name: 'A', gestureSettings: [1] }],
    ['settings that are too large', { name: 'A', gestureSettings: { x: 'y'.repeat(1001) } }],
  ])('rejects %s with 400 INVALID_INPUT', async (_label, body) => {
    const response = await request(app).post('/players').send(body);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_INPUT');
    expect(typeof response.body.message).toBe('string');
  });

  it('rejects a body that is not a JSON object', async () => {
    const response = await request(app).post('/players').send([1, 2]);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_INPUT');
  });

  it('rejects malformed JSON with 400', async () => {
    const response = await request(app)
      .post('/players')
      .set('Content-Type', 'application/json')
      .send('{"name": ');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_INPUT');
  });
});

describe('GET /players/:id', () => {
  it('returns an existing player', async () => {
    const created = (await request(app).post('/players').send({ name: 'Laura' })).body;
    const response = await request(app).get(`/players/${created.id}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(created);
  });

  it('returns 404 NOT_FOUND for an unknown player', async () => {
    const response = await request(app).get(`/players/${missingId}`);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Player not found', code: 'NOT_FOUND' });
  });

  it('returns 400 for an id that is not a UUID, without touching the database', async () => {
    const get = vi.spyOn(players, 'get');
    const response = await request(app).get('/players/not-a-uuid');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_INPUT');
    expect(get).not.toHaveBeenCalled();
  });
});

describe('PUT /players/:id', () => {
  it('updates the name and keeps the other fields when they are omitted', async () => {
    const created = (
      await request(app)
        .post('/players')
        .send({ name: 'Laura', avatar: '#5B8CFF', gestureSettings: { holdMs: 900 } })
    ).body;
    const response = await request(app).put(`/players/${created.id}`).send({ name: 'Laura G' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ...created, name: 'Laura G' });
  });

  it('updates the avatar and settings when given, and never the chips', async () => {
    const created = (await request(app).post('/players').send({ name: 'Laura' })).body;
    const response = await request(app)
      .put(`/players/${created.id}`)
      .send({ name: 'Laura', avatar: '#C084FC', gestureSettings: { holdMs: 500 }, chips: 5 });
    expect(response.body).toMatchObject({
      avatar: '#C084FC',
      gestureSettings: { holdMs: 500 },
      chips: 1000,
    });
  });

  it('returns 404 for an unknown player', async () => {
    const response = await request(app).put(`/players/${missingId}`).send({ name: 'Laura' });
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('returns 400 for invalid input and for an id that is not a UUID', async () => {
    const created = (await request(app).post('/players').send({ name: 'Laura' })).body;
    const invalid = await request(app).put(`/players/${created.id}`).send({ name: '' });
    expect(invalid.status).toBe(400);
    const badId = await request(app).put('/players/nope').send({ name: 'Laura' });
    expect(badId.status).toBe(400);
  });
});

describe('DELETE /players/:id', () => {
  it('deletes a player and returns 204 with no body', async () => {
    const created = (await request(app).post('/players').send({ name: 'Laura' })).body;
    const response = await request(app).delete(`/players/${created.id}`);
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect((await request(app).get(`/players/${created.id}`)).status).toBe(404);
  });

  it('returns 404 for an unknown player and 400 for an id that is not a UUID', async () => {
    expect((await request(app).delete(`/players/${missingId}`)).status).toBe(404);
    expect((await request(app).delete('/players/nope')).status).toBe(400);
  });
});

describe('database failures', () => {
  it('answer 503 UNAVAILABLE without exposing the error, then recover', async () => {
    vi.spyOn(players, 'get')
      .mockRejectedValueOnce(new Error('private connection details'))
      .mockResolvedValue(null);
    const failed = await request(app).get(`/players/${missingId}`);
    expect(failed.status).toBe(503);
    expect(failed.body).toEqual({ message: 'Player service unavailable', code: 'UNAVAILABLE' });
    expect(failed.text).not.toContain('private');
    expect((await request(app).get(`/players/${missingId}`)).status).toBe(404);
  });
});

describe('unknown routes', () => {
  it('return 404 in the standard error format', async () => {
    const response = await request(app).get('/nothing');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Not found', code: 'NOT_FOUND' });
  });
});
