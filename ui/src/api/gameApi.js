// Game service (owner: Lara). Endpoints from plan.md §1 and §6.
// Live table state arrives over the WebSocket; actions go over HTTP.
import { config } from '../config.js';
import { request } from './http.js';

const game = (path, options) => request('game', config.gameUrl, path, options);
const table = (id) => `/tables/${encodeURIComponent(id)}`;

export const gameApi = {
  createTable: (settings) => game('/tables', { method: 'POST', body: settings }),
  getTable: (id) => game(table(id)),
  deleteTable: (id) => game(table(id), { method: 'DELETE' }),
  join: (id, playerId) => game(`${table(id)}/join`, { method: 'POST', body: { playerId } }),
  /** action: check | call | fold | raise | allin. A 409 means illegal or not your turn. */
  act: (id, playerId, action, amount) =>
    game(`${table(id)}/actions`, { method: 'POST', body: { playerId, action, amount } }),
  health: () => game('/health'),
  /** WebSocket URL for live state: http(s) → ws(s). */
  socketUrl: (id) => `${config.gameUrl.replace(/^http/, 'ws')}${table(id)}/ws`,
};
