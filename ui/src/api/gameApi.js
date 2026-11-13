// Game service (owner: Lara). Endpoints from plan.md §1 and §6 and services/game/src/app.js.
// Live table state arrives over the WebSocket; actions go over HTTP.
import { config } from '../config.js';
import { request } from './http.js';

const game = (path, options) => request('game', config.gameUrl, path, options);
const table = (id) => `/tables/${encodeURIComponent(id)}`;

export const gameApi = {
  /**
   * settings (all optional): { smallBlind, bigBlind, startingStack, maxSeats }. Defaults are
   * 5/10 blinds, 1000 chips, 6 seats. Returns the table; its `id` is the 6-character join code.
   */
  createTable: (playerId, settings = {}) =>
    game('/tables', { method: 'POST', body: { playerId, ...settings } }),
  getTable: (id) => game(table(id)),
  /** Only the player who created the table may delete it. */
  deleteTable: (id, playerId) =>
    game(`${table(id)}?playerId=${encodeURIComponent(playerId)}`, { method: 'DELETE' }),
  /** Joining again returns the same seat with alreadySeated: true. 409 TABLE_FULL when full. */
  join: (id, playerId) => game(`${table(id)}/join`, { method: 'POST', body: { playerId } }),
  /**
   * action: check | call | fold | raise | allin. For raise, amount is the total bet on this
   * street ("raise to"). 400 for a malformed action, 409 if illegal or not your turn.
   */
  act: (id, playerId, action, amount) =>
    game(`${table(id)}/actions`, { method: 'POST', body: { playerId, action, amount } }),
  health: () => game('/health'),
  /**
   * WebSocket URL for live state: http(s) → ws(s). playerId says whose private messages
   * (hole cards, legal actions) to send; to be confirmed with Lara.
   */
  socketUrl: (id, playerId) =>
    `${config.gameUrl.replace(/^http/, 'ws')}${table(id)}/ws?playerId=${encodeURIComponent(playerId)}`,
};
