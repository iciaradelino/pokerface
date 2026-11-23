import { STARTING_CHIPS } from '../src/playersRepository.js';

// In-memory stand-in for the SQL repository, with the behaviour the routes rely on.
export function fakeRepository() {
  const rows = new Map();
  const saved = new Set(); // "handId:playerId"
  const deltas = new Map(); // playerId -> every saved delta
  const results = new Map(); // playerId -> [{ handId, delta, playedAt }], oldest first
  const since = new Map(); // playerId -> creation time
  let next = 1;
  let clock = Date.parse('2026-11-01T10:00:00Z');
  const tick = () => new Date((clock += 60_000)).toISOString();
  return {
    async create({ name, avatar, gestureSettings }) {
      const id = `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
      const player = { id, name, avatar, chips: STARTING_CHIPS, gestureSettings };
      rows.set(id, player);
      since.set(id, tick());
      return { ...player };
    },
    async get(id) {
      return rows.has(id) ? { ...rows.get(id) } : null;
    },
    async update(id, { name, avatar, gestureSettings }) {
      const current = rows.get(id);
      if (!current) return null;
      const updated = {
        ...current,
        name,
        avatar: avatar ?? current.avatar,
        gestureSettings: gestureSettings ?? current.gestureSettings,
      };
      rows.set(id, updated);
      return { ...updated };
    },
    async remove(id) {
      results.delete(id);
      return rows.delete(id);
    },
    async saveResult(id, { handId, delta }) {
      const current = rows.get(id);
      if (!current) return null;
      const key = `${handId}:${id}`;
      if (!saved.has(key)) {
        saved.add(key);
        deltas.set(id, [...(deltas.get(id) ?? []), delta]);
        results.set(id, [...(results.get(id) ?? []), { handId, delta, playedAt: tick() }]);
        // Same rule as the SQL: starting stack plus all deltas, never below 0.
        const total = deltas.get(id).reduce((sum, value) => sum + value, STARTING_CHIPS);
        current.chips = Math.max(0, total);
      }
      return { ...current };
    },
    async history(id, { limit = 5 } = {}) {
      if (!rows.has(id)) return null;
      const mine = results.get(id) ?? [];
      return {
        since: since.get(id),
        handsPlayed: mine.length,
        recent: [...mine].reverse().slice(0, limit),
      };
    },
    async leaderboard() {
      return [...rows.values()]
        .sort((a, b) => b.chips - a.chips || a.name.localeCompare(b.name))
        .slice(0, 10)
        .map(({ id, name, chips }) => ({ id, name, chips }));
    },
  };
}
