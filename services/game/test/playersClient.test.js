import { describe, expect, it, vi } from 'vitest';
import { createPlayersClient, PlayersUnavailableError } from '../src/playersClient.js';

const id = '00000000-0000-4000-8000-000000000001';
const json = (status, body) => new Response(JSON.stringify(body), { status });

describe('playersClient.getPlayer', () => {
  it('returns the player and calls the configured URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { id, name: 'Ana', chips: 1000 }));
    const client = createPlayersClient({ baseUrl: 'http://players:3000/', fetchImpl });
    expect(await client.getPlayer(id)).toMatchObject({ name: 'Ana' });
    expect(fetchImpl.mock.calls[0][0]).toBe(`http://players:3000/players/${id}`);
    expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('returns null for an unknown player', async () => {
    const client = createPlayersClient({
      baseUrl: 'http://players:3000',
      fetchImpl: async () => json(404, { message: 'Player not found', code: 'NOT_FOUND' }),
    });
    expect(await client.getPlayer(id)).toBeNull();
  });

  it.each([
    ['a 5xx', async () => json(503, { code: 'UNAVAILABLE' })],
    ['a body without a name', async () => json(200, { id })],
    ['a body that is not JSON', async () => new Response('oops', { status: 200 })],
    ['a network failure', async () => { throw new TypeError('fetch failed'); }],
  ])('treats %s as unavailable', async (_label, fetchImpl) => {
    const client = createPlayersClient({ baseUrl: 'http://players:3000', fetchImpl });
    await expect(client.getPlayer(id)).rejects.toBeInstanceOf(PlayersUnavailableError);
  });

  it('gives up after the timeout instead of hanging', async () => {
    const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    });
    const client = createPlayersClient({ baseUrl: 'http://players:3000', timeoutMs: 50, fetchImpl });
    const started = Date.now();
    const error = await client.getPlayer(id).catch((e) => e);
    expect(error).toBeInstanceOf(PlayersUnavailableError);
    expect(error.reason).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('requires PLAYERS_URL', () => {
    expect(() => createPlayersClient({ baseUrl: undefined })).toThrow('PLAYERS_URL');
  });
});