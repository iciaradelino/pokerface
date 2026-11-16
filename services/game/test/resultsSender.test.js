import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResultsSender } from '../src/resultsSender.js';
import { createLiveTables } from '../src/liveTables.js';
import { fakePlayersClient, fakeTablesRepository } from './fakes.js';

// Sending hand_players rows to the players service: success, deleted players, outages,
// retries every minute and only one round at a time.
const ana = '00000000-0000-4000-8000-000000000001';
const ben = '00000000-0000-4000-8000-000000000002';
const gone = '00000000-0000-4000-8000-000000000099';
const hand1 = '11111111-1111-4111-8111-111111111111';
const hand2 = '22222222-2222-4222-8222-222222222222';

let tables;
let players;
let sender;
let logs;

// A finished hand as live tables would have saved it.
function saveHand(handId, deltas) {
  tables.hands.push({ tableId: 'K7QX2M', handId, handNumber: tables.hands.length + 1, deltas, stacks: [] });
}

beforeEach(() => {
  vi.useFakeTimers();
  tables = fakeTablesRepository();
  players = fakePlayersClient({ [ana]: 'Ana', [ben]: 'Ben' });
  logs = [];
  sender = createResultsSender({
    tables,
    players,
    intervalMs: 60_000,
    batchSize: 3,
    logger: (line) => logs.push(JSON.parse(line)),
  });
});

afterEach(() => {
  sender.stop();
  vi.useRealTimers();
});

describe('sending results', () => {
  it('sends every pending result with its handId and marks it as sent', async () => {
    saveHand(hand1, [{ playerId: ana, delta: 10 }, { playerId: ben, delta: -10 }]);
    await sender.sendPending();
    expect(players.results).toEqual([
      { playerId: ana, handId: hand1, delta: 10 },
      { playerId: ben, handId: hand1, delta: -10 },
    ]);
    expect(await tables.getUnsentResults(10)).toEqual([]);
    expect(logs).toContainEqual(expect.objectContaining({ event: 'results_sent', count: 2 }));
  });

  it('goes through several batches', async () => {
    saveHand(hand1, [{ playerId: ana, delta: 10 }, { playerId: ben, delta: -10 }]);
    saveHand(hand2, [{ playerId: ana, delta: -5 }, { playerId: ben, delta: 5 }]);
    await sender.sendPending();
    expect(players.results).toHaveLength(4);
  });

  it('marks a deleted player\'s result as sent and never retries it', async () => {
    saveHand(hand1, [{ playerId: ana, delta: 10 }, { playerId: gone, delta: -10 }]);
    await sender.sendPending();
    expect(await tables.getUnsentResults(10)).toEqual([]);
    expect(logs).toContainEqual(expect.objectContaining({ event: 'result_player_gone' }));
    const calls = players.calls;
    await sender.sendPending();
    expect(players.calls).toBe(calls); // Nothing left to send.
  });

  it('logs nothing when there is nothing to send', async () => {
    await sender.sendPending();
    expect(logs).toEqual([]);
  });
});

describe('when the players service is down', () => {
  it('keeps the results and stops the round after the first failure', async () => {
    saveHand(hand1, [{ playerId: ana, delta: 10 }, { playerId: ben, delta: -10 }]);
    players.down = true;
    await sender.sendPending();
    expect(players.calls).toBe(1); // Did not try Ben after Ana failed.
    expect(await tables.getUnsentResults(10)).toHaveLength(2);
    expect(logs).toContainEqual({ level: 'info', event: 'results_send_failed', reason: 'players_unavailable' });
  });

  it('sends them on its own within a minute once players is back, even if no hand is played', async () => {
    saveHand(hand1, [{ playerId: ana, delta: 10 }, { playerId: ben, delta: -10 }]);
    players.down = true;
    sender.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(players.results).toHaveLength(0);
    players.down = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(players.results).toHaveLength(2);
  });

  it('also stops when the database fails, without throwing', async () => {
    tables.getUnsentResults = async () => { throw new Error('database down'); };
    await expect(sender.sendPending()).resolves.toBeUndefined();
    expect(logs).toContainEqual({ level: 'info', event: 'results_send_failed', reason: 'database' });
  });
});

describe('rounds', () => {
  it('runs one round at a time and goes once more if asked meanwhile', async () => {
    saveHand(hand1, [{ playerId: ana, delta: 10 }]);
    let release;
    const slow = new Promise((resolve) => { release = resolve; });
    const original = players.saveResult;
    players.saveResult = async (...args) => { await slow; return original(...args); };

    const first = sender.sendPending();
    saveHand(hand2, [{ playerId: ben, delta: 5 }]); // Saved while the first round runs.
    const second = sender.sendPending();
    expect(second).toBe(first); // Same round, not a parallel one.
    release();
    await first;
    expect(players.results.map((r) => r.handId)).toEqual([hand1, hand2]);
  });

  it('is started by live tables after every saved hand', async () => {
    let saved = 0;
    const live = createLiveTables({ tables, handPauseMs: 10, logger: () => {}, onHandSaved: () => { saved += 1; } });
    await tables.createTable({
      settings: { smallBlind: 5, bigBlind: 10, startingStack: 1000, maxSeats: 6 },
      createdBy: ana,
      creatorName: 'Ana',
      generateId: () => 'K7QX2M',
    });
    await live.join('K7QX2M', { playerId: ben, playerName: 'Ben' });
    await vi.advanceTimersByTimeAsync(10);
    await live.leave('K7QX2M', ben); // Ben folds: the hand ends and is saved.
    expect(saved).toBe(1);
    live.close();
  });
});