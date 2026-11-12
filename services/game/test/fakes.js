import { PlayersUnavailableError } from '../src/playersClient.js';

// In-memory stand-in for tablesRepository.js, with the behaviour the routes rely on.
export function fakeTablesRepository() {
  const rows = new Map();
  const copy = (table) => structuredClone(table);
  return {
    rows,
    async getTable(id) {
      return rows.has(id) ? copy(rows.get(id)) : null;
    },
    async createTable({ settings, createdBy, creatorName, generateId }) {
      let id = generateId();
      while (rows.has(id)) id = generateId(); // Same as the real one: draw again if taken.
      const table = {
        id,
        ...settings,
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
    async deleteTable(id) {
      return rows.delete(id);
    },
  };
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