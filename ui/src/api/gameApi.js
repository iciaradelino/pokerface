// Game service (owner: Lara). Endpoints from plan.md §1 and §6 and services/game/src/app.js.
// Live table state arrives over the WebSocket; actions go over HTTP.
import { config } from '../config.js';
import { request, waitForStartup } from './http.js';

const game = (path, options) => request('game', config.gameUrl, path, options);
const table = (id) => `/tables/${encodeURIComponent(id)}`;

async function enterTable(path, body) {
  await Promise.all([
    waitForStartup('game', config.gameUrl),
    waitForStartup('players', config.playersUrl),
  ]);
  return game(path, { method: 'POST', body });
}

export const gameApi = {
  /**
   * settings (all optional): { smallBlind, bigBlind, startingStack, maxSeats }. Defaults are
   * 5/10 blinds, 1000 chips, 6 seats. Returns the table; its `id` is the 6-character join code.
   */
  createTable: (playerId, settings = {}) => enterTable('/tables', { playerId, ...settings }),
  getTable: (id) => game(table(id)),
  /**
   * Starts the game. Tables are created paused, so no hand is dealt until the creator calls
   * this. Returns the table with paused: false. 403 for anyone but the creator.
   */
  startTable: (id, playerId) => game(`${table(id)}/start`, { method: 'POST', body: { playerId } }),
  pauseTable: (id, playerId) => game(`${table(id)}/pause`, { method: 'POST', body: { playerId } }),
  /**
   * Only the creator: autoDeal false keeps the next hand waiting until a player asks for it with
   * nextHand; true deals it by itself again. 403 for anyone else.
   */
  setAutoDeal: (id, playerId, autoDeal) =>
    game(`${table(id)}/auto-deal`, { method: 'POST', body: { playerId, autoDeal } }),
  /** Any seated player: deal the next hand now. 409 while a hand is being played. */
  nextHand: (id, playerId) =>
    game(`${table(id)}/next-hand`, { method: 'POST', body: { playerId } }),
  /** Only the player who created the table may delete it. */
  deleteTable: (id, playerId) =>
    game(`${table(id)}?playerId=${encodeURIComponent(playerId)}`, { method: 'DELETE' }),
  /** Joining again returns the same seat with alreadySeated: true. 409 TABLE_FULL when full. */
  join: (id, playerId) => enterTable(`${table(id)}/join`, { playerId }),
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
