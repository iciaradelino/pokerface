// Players service (owner: Laura). Endpoints from plan.md §1 and §6.
// Keep this in step with the service: if a path or body changes, change it here only.
import { config } from '../config.js';
import { request } from './http.js';

const players = (path, options) => request('players', config.playersUrl, path, options);

export const playersApi = {
  /**
   * body: { name, avatar, gesturesEnabled }. avatar is the chosen colour
   * ("lime" | "pink" | "blue" | "amber" | "teal" | "violet"). Returns the player with its `id`.
   */
  create: (player) => players('/players', { method: 'POST', body: player }),
  get: (id) => players(`/players/${encodeURIComponent(id)}`),
  update: (id, changes) =>
    players(`/players/${encodeURIComponent(id)}`, { method: 'PUT', body: changes }),
  remove: (id) => players(`/players/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  leaderboard: () => players('/leaderboard'),
  health: () => players('/health'),
};
