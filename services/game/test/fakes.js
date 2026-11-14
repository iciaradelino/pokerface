import { PlayersUnavailableError } from '../src/playersClient.js';

// In-memory stand-in for tablesRepository.js, with the behaviour the routes and live tables
// rely on. `failSaves = n` makes the next n saveHand calls fail, like a paused database.
export function fakeTablesRepository() {
  const rows = new Map();
  const hands = []; // every saved hand, in order
  const copy = (value) => structuredClone(value);
  const repo = {
    rows,
    hands,
    failSaves: 0,
    async getTable(id) {
      return rows.has(id) ? copy(rows.get(id)) : null;
    },
    async createTable({ settings, createdBy, creatorName, generateId }) {
      let id = generateId();
      while (rows.has(id)) id = generateId(); // Same as the real one: draw again if taken.
      const table = {
        id,
        ...settings,
        paused: false,
        createdBy,
        createdAt: '2026-11-11T18:00:00.000Z',
        seats: [{ seatIndex: 0, playerId: createdBy, name: creatorName, stack: settings.startingStack }],
      };
      rows.set(id, table);
      return copy(table);
    },
    async joinTable(id, { playerId, playerName }) {
      const table = rows.get(id);
      if (!table) return { status: 'not_found' };
      const mine = table.seats.find((seat) => seat.playerId === playerId);
      if (mine) return { status: 'already_seated', seatIndex: mine.seatIndex };
      const taken = new Set(table.seats.map((seat) => seat.seatIndex));
      let seatIndex = 0;
      while (seatIndex < table.maxSeats && taken.has(seatIndex)) seatIndex++;
      if (seatIndex === table.maxSeats) return { status: 'full' };
      table.seats.push({ seatIndex, playerId, name: playerName, stack: table.startingStack });
      table.seats.sort((a, b) => a.seatIndex - b.seatIndex);
      return { status: 'joined', seatIndex };
    },
    async getLastHandNumber(id) {
      return Math.max(0, ...hands.filter((h) => h.tableId === id).map((h) => h.handNumber));
    },
    async saveHand(id, hand) {
      if (repo.failSaves > 0) {
        repo.failSaves -= 1;
        throw new Error('database paused');
      }
      if (!hands.some((h) => h.handId === hand.handId)) hands.push({ tableId: id, ...copy(hand) });
      const table = rows.get(id);
      const stacks = new Map(hand.stacks.map((s) => [s.playerId, s.stack]));
      table.seats = table.seats
        .filter((seat) => stacks.has(seat.playerId))
        .map((seat) => ({ ...seat, stack: stacks.get(seat.playerId) }));
    },
    async removeSeat(id, playerId) {
      const table = rows.get(id);
      const before = table.seats.length;
      table.seats = table.seats.filter((seat) => seat.playerId !== playerId);
      return table.seats.length < before;
    },
    async setPaused(id, paused) {
      if (!rows.has(id)) return false;
      rows.get(id).paused = paused;
      return true;
    },
    async deleteTable(id) {
      return rows.delete(id);
    },
  };
  return repo;
}

// In-memory stand-in for playersClient.js. Set `down = true` to simulate an outage.
export function fakePlayersClient(knownPlayers = {}) {
  const client = {
    down: false,
    calls: 0,
    async getPlayer(id) {
      client.calls += 1;
      if (client.down) throw new PlayersUnavailableError('timeout');
      return knownPlayers[id] ? { id, name: knownPlayers[id] } : null;
    },
  };
  return client;
}