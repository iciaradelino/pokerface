import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLiveTables } from '../src/liveTables.js';
import { createPlayersClient } from '../src/playersClient.js';
import { createResultsSender } from '../src/resultsSender.js';
import { MAX_CHIPS_PER_TABLE, validateCreateTableInput } from '../src/validation.js';
// The players service's own rule for a hand result, so these tests fail if the two drift apart.
import { validateResultInput } from '../../players/src/validation.js';
import { fakePlayersClient, fakeTablesRepository } from './fakes.js';

// Limits shared with the players service, and results it refuses for good.
const ana = '00000000-0000-4000-8000-000000000001';
const ben = '00000000-0000-4000-8000-000000000002';
const cleo = '00000000-0000-4000-8000-000000000003';

describe('chip limits agree with the players service', () => {
  it('lets no table produce a result the players service would refuse', () => {
    for (let maxSeats = 2; maxSeats <= 6; maxSeats++) {
      const startingStack = Math.floor(MAX_CHIPS_PER_TABLE / maxSeats);
      expect(
        validateCreateTableInput({ playerId: ana, startingStack, maxSeats }).error,
      ).toBeUndefined();
      // The biggest possible win: one player takes everyone else's chips.
      const biggestWin = startingStack * (maxSeats - 1);
      expect(
        validateResultInput({ handId: '11111111-1111-4111-8111-111111111111', delta: biggestWin })
          .error,
      ).toBeUndefined();
      expect(
        validateResultInput({ handId: '11111111-1111-4111-8111-111111111111', delta: -biggestWin })
          .error,
      ).toBeUndefined();
    }
  });

  it('refuses the settings from the review: three seats of 600,000,000 chips', () => {
    const { error } = validateCreateTableInput({
      playerId: ana,
      startingStack: 600_000_000,
      maxSeats: 3,
    });
    expect(error).toContain('limit per table');
  });

  it('refuses a player whose chips would take the table over the limit', async () => {
    const tables = fakeTablesRepository();
    const live = createLiveTables({ tables, logger: () => {} });
    const app = createApp({
      checkDatabase: async () => {},
      tables,
      live,
      players: fakePlayersClient({ [ana]: 'Ana', [ben]: 'Ben', [cleo]: 'Cleo' }),
      generateId: () => 'K7QX2M',
      uiOrigin: 'http://localhost:5173',
      logger: () => {},
    });
    const big = MAX_CHIPS_PER_TABLE / 2;
    await request(app).post('/tables').send({ playerId: ana, startingStack: big, maxSeats: 2 });
    // Ana has won chips since: the table now holds more than one starting stack.
    tables.rows.get('K7QX2M').seats[0].stack = big + 1;
    const response = await request(app).post('/tables/K7QX2M/join').send({ playerId: ben });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('TABLE_CHIP_LIMIT');
    live.close();
  });
});

describe('a result the players service refuses for good', () => {
  let server;
  let received;

  // A players service on a random port that answers with its real validation rule.
  beforeEach(async () => {
    received = [];
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const { error, value } = validateResultInput(JSON.parse(body));
        res.writeHead(error ? 400 : 200, { 'Content-Type': 'application/json' });
        if (!error) received.push({ playerId: req.url.split('/')[2], ...value });
        res.end(
          JSON.stringify(error ? { message: error, code: 'INVALID_INPUT' } : { chips: 1000 }),
        );
      });
    });
    server.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
  });

  afterEach(() => new Promise((resolve) => server.close(resolve)));

  it('is kept as rejected and does not block the results behind it', async () => {
    const tables = fakeTablesRepository();
    const logs = [];
    const players = createPlayersClient({ baseUrl: `http://localhost:${server.address().port}` });
    const sender = createResultsSender({
      tables,
      players,
      logger: (l) => logs.push(JSON.parse(l)),
    });
    const bad = '11111111-1111-4111-8111-111111111111';
    const good = '22222222-2222-4222-8222-222222222222';
    // An old hand saved before the limits matched, then a normal one.
    tables.hands.push({
      tableId: 'K7QX2M',
      handId: bad,
      handNumber: 1,
      stacks: [],
      deltas: [
        { playerId: ana, delta: 1_200_000_000 },
        { playerId: ben, delta: -1_200_000_000 },
      ],
    });
    tables.hands.push({
      tableId: 'K7QX2M',
      handId: good,
      handNumber: 2,
      stacks: [],
      deltas: [
        { playerId: ana, delta: -20 },
        { playerId: ben, delta: 20 },
      ],
    });

    await sender.sendPending();

    expect(received).toEqual([
      { playerId: ana, handId: good, delta: -20 },
      { playerId: ben, handId: good, delta: 20 },
    ]);
    expect([...tables.rejected].sort()).toEqual([`${bad}:${ana}`, `${bad}:${ben}`]);
    expect(await tables.getUnsentResults(10)).toEqual([]);
    expect(await tables.hasUnsentResults('K7QX2M')).toBe(false); // So the table can be deleted.
    expect(logs.filter((l) => l.event === 'result_rejected')).toHaveLength(2);
  });

  it('is retried later when the players service is down instead (5xx)', async () => {
    server.removeAllListeners('request');
    server.on('request', (_req, res) => {
      res.writeHead(503);
      res.end();
    });
    const tables = fakeTablesRepository();
    const players = createPlayersClient({ baseUrl: `http://localhost:${server.address().port}` });
    const sender = createResultsSender({ tables, players, logger: () => {} });
    tables.hands.push({
      tableId: 'K7QX2M',
      handId: '33333333-3333-4333-8333-333333333333',
      handNumber: 1,
      stacks: [],
      deltas: [{ playerId: ana, delta: 5 }],
    });
    await sender.sendPending();
    expect(tables.rejected.size).toBe(0);
    expect(await tables.getUnsentResults(10)).toHaveLength(1);
  });
});
