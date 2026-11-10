import { STARTING_CHIPS } from '../src/playersRepository.js';

// In-memory stand-in for the SQL repository, with the behaviour the routes rely on.
export function fakeRepository() {
  const rows = new Map();
  const saved = new Set(); // "handId:playerId"
  const deltas = new Map(); // playerId -> every saved delta
  let next = 1;
  return {
    async create({ name, avatar, gestureSettings }) {
      const id = `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
      const player = { id, name, avatar, chips: STARTING_CHIPS, gestureSettings };
      rows.set(id, player);
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
      return rows.delete(id);
    },
    async saveResult(id, { handId, delta }) {
      const current = rows.get(id);
      if (!current) return null;
      const key = `${handId}:${id}`;
      if (!saved.has(key)) {
        saved.add(key);
        deltas.set(id, [...(deltas.get(id) ?? []), delta]);
        // Same rule as the SQL: starting stack plus all deltas, never below 0.
        const total = deltas.get(id).reduce((sum, value) => sum + value, STARTING_CHIPS);
        current.chips = Math.max(0, total);
      }
      return { ...current };
    },
    async leaderboard() {
      return [...rows.values()]
        .sort((a, b) => b.chips - a.chips || a.name.localeCompare(b.name))
        .slice(0, 10)
        .map(({ id, name, chips }) => ({ id, name, chips }));
    },
  };
}
