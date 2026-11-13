import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request } from '../src/api/http.js';
import { playersApi } from '../src/api/playersApi.js';
import { gameApi } from '../src/api/gameApi.js';

function mockFetch(impl) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('request', () => {
  it('sends JSON and returns the parsed body', async () => {
    const fetch = mockFetch(async () => jsonResponse(201, { id: 'p1', name: 'Ana' }));
    const player = await playersApi.create({ name: 'Ana' });

    expect(player).toEqual({ id: 'p1', name: 'Ana' });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('http://localhost:3001/players');
    expect(options.method).toBe('POST');
    expect(options.body).toBe('{"name":"Ana"}');
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('returns null for 204', async () => {
    mockFetch(async () => new Response(null, { status: 204 }));
    await expect(playersApi.remove('p1')).resolves.toBeNull();
  });

  it('uses the service error message and code', async () => {
    mockFetch(async () =>
      jsonResponse(409, { code: 'NOT_YOUR_TURN', message: 'Wait for your turn' }),
    );
    const error = await gameApi.act('t1', 'p1', 'call').catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'NOT_YOUR_TURN',
      message: 'Wait for your turn',
    });
    expect(error.isUnavailable).toBe(false);
  });

  it('reports an unreachable service as unavailable', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const error = await playersApi.leaderboard().catch((e) => e);

    expect(error.message).toBe('Player service unavailable');
    expect(error.code).toBe('UNAVAILABLE');
    expect(error.isUnavailable).toBe(true);
  });

  it('reports a timeout', async () => {
    mockFetch(async () => {
      throw new DOMException('timed out', 'TimeoutError');
    });
    const error = await gameApi.getTable('t1').catch((e) => e);
    expect(error).toMatchObject({
      code: 'TIMEOUT',
      message: 'Tables unavailable',
      service: 'game',
    });
  });

  it('treats 5xx without a body as unavailable', async () => {
    mockFetch(async () => new Response('Bad gateway', { status: 502 }));
    const error = await request('game', 'http://x', '/tables').catch((e) => e);
    expect(error).toMatchObject({
      status: 502,
      code: 'UNAVAILABLE',
      message: 'Tables unavailable',
    });
    expect(error.isUnavailable).toBe(true);
  });

  it('describes other failures without a body', async () => {
    mockFetch(async () => new Response('', { status: 404 }));
    const error = await request('other', 'http://x', '/y').catch((e) => e);
    expect(error).toMatchObject({ status: 404, code: 'UNKNOWN', message: 'Request failed (404)' });
  });
});

describe('API paths', () => {
  it('encodes ids and builds the WebSocket URL', async () => {
    const fetch = mockFetch(async () => jsonResponse(200, {}));
    await gameApi.join('a/b', 'p1');
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:3002/tables/a%2Fb/join');
    expect(gameApi.socketUrl('t1', 'p 1')).toBe('ws://localhost:3002/tables/t1/ws?playerId=p%201');
  });
});
