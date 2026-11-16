// HTTP calls from the game service to the players service. Every call has a timeout, so a
// players service that is down or slow never leaves a request hanging.

export const PLAYERS_TIMEOUT_MS = 2000;

/** The players service did not answer in time, could not be reached or failed (5xx). */
export class PlayersUnavailableError extends Error {
  constructor(reason) {
    super('Player service unavailable');
    this.name = 'PlayersUnavailableError';
    this.reason = reason;
  }
}

export function createPlayersClient({ baseUrl, timeoutMs = PLAYERS_TIMEOUT_MS, fetchImpl = fetch }) {
  if (!baseUrl) throw new Error('PLAYERS_URL is required');
  const base = baseUrl.replace(/\/+$/, '');

  async function call(path, options = {}) {
    try {
      return await fetchImpl(`${base}${path}`, { ...options, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw new PlayersUnavailableError(error?.name === 'TimeoutError' ? 'timeout' : 'unreachable');
    }
  }

  return {
    /** Returns the player { id, name, ... }, or null if the players service does not know them. */
    async getPlayer(id) {
      const response = await call(`/players/${encodeURIComponent(id)}`);
      if (response.status === 404) return null;
      if (!response.ok) throw new PlayersUnavailableError(`status ${response.status}`);
      const player = await response.json().catch(() => null);
      if (typeof player?.name !== 'string') throw new PlayersUnavailableError('invalid response');
      return player;
    },

    /**
     * Sends one hand result: POST /players/:id/results { handId, delta }. The players service
     * ignores a handId it already saved for that player, so a retry never counts twice.
     * Returns 'saved', or 'not_found' when the player deleted their profile.
     */
    async saveResult(id, { handId, delta }) {
      const response = await call(`/players/${encodeURIComponent(id)}/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handId, delta }),
      });
      if (response.status === 404) return 'not_found';
      if (!response.ok) throw new PlayersUnavailableError(`status ${response.status}`);
      return 'saved';
    },
  };
}