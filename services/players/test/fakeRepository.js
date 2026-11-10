// In-memory stand-in for the SQL repository, with the behaviour the routes rely on.
export function fakeRepository() {
  const rows = new Map();
  const saved = new Set(); // "handId:playerId"
  let next = 1;
  return {
    async create({ name, avatar, gestureSettings }) {
      const id = `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
      const player = { id, name, avatar, chips: 1000, gestureSettings };
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
        current.chips = Math.max(0, current.chips + delta);
      }
      return { ...current };
    },
    async leaderboard() {
      return [...rows.values()]
        .sort((a, b) => b.chips - a.chips || a.name.localeCompare(b.name))
        .slice(0, 20)
        .map(({ id, name, chips }) => ({ id, name, chips }));
    },
  };
}
