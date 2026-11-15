import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLiveTables } from '../src/liveTables.js';
import { restoreEngineTable } from '../src/engineRestore.js';
import { fakeTablesRepository } from './fakes.js';

const ana = '00000000-0000-4000-8000-000000000001';
const ben = '00000000-0000-4000-8000-000000000002';
const cleo = '00000000-0000-4000-8000-000000000003';
const PAUSE = 5000;
const RETRY = 3000;

let tables;
let live;
let changes;
let handIds;

async function newTable(settings = {}) {
  return tables.createTable({
    settings: { smallBlind: 5, bigBlind: 10, startingStack: 1000, maxSeats: 6, ...settings },
    createdBy: ana,
    creatorName: 'Ana',
    generateId: () => 'K7QX2M',
  });
}

const inHand = (game) => game.hand !== null && game.hand.phase !== 'complete';
const after = (ms) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
  tables = fakeTablesRepository();
  changes = 0;
  handIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  live = createLiveTables({
    tables,
    handPauseMs: PAUSE,
    saveRetryMs: RETRY,
    generateHandId: () => handIds.shift(),
    onChange: () => { changes += 1; },
    logger: () => {},
  });
});

afterEach(() => {
  live.close();
  vi.useRealTimers();
});

describe('starting hands', () => {
  it('starts a hand on its own once two players are seated, after a short pause', async () => {
    await newTable();
    await live.join('K7QX2M', { playerId: ben, playerName: 'Ben' });
    expect(inHand(await live.get('K7QX2M'))).toBe(false);
    await after(PAUSE);
    const game = await live.get('K7QX2M');
    expect(inHand(game)).toBe(true);
    expect(game.handNumber).toBe(1);
    expect(changes).toBeGreaterThan(0);
  });

  it('does not start with a single player', async () => {
    await newTable();
    await live.get('K7QX2M');
    await after(PAUSE * 3);
    expect(inHand(await live.get('K7QX2M'))).toBe(false);
  });

  it('deals a player who joins mid-hand into the next hand only', async () => {
    await newTable();
    await live.join('K7QX2M', { playerId: ben, playerName: 'Ben' });
    await after(PAUSE);
    await live.join('K7QX2M', { playerId: cleo, playerName: 'Cleo' });
    const game = await live.get('K7QX2M');
    expect(game.seats[2]).toMatchObject({ id: cleo, stack: 1000 });
    expect(game.hand.players.map((p) => p.id)).not.toContain(cleo);
  });

  it('skips players with no chips', async () => {
    await newTable();
    await live.join('K7QX2M', { playerId: ben, playerName: 'Ben' });
    tables.rows.get('K7QX2M').seats[1].stack = 0; // Ben lost everything before a restart.
    live.close();
    await live.get('K7QX2M');
    await after(PAUSE * 2);
    expect(inHand(await live.get('K7QX2M'))).toBe(false);
  });
});

describe('when a hand ends', () => {
  async function playUntilBenLeaves() {
    await newTable();
    await live.join('K7QX2M', { playerId: ben, playerName: 'Ben' });
    await after(PAUSE);
    return live.leave('K7QX2M', ben); // Ben folds, so Ana wins the hand.
  }

  it('saves the hand, each result and the new stacks, and frees the seat of a player who left', async () => {
    const { status } = await playUntilBenLeaves();
    expect(status).toBe('left');
    expect(tables.hands).toHaveLength(1);
    const [hand] = tables.hands;
    expect(hand).toMatchObject({ tableId: 'K7QX2M', handId: '11111111-1111-4111-8111-111111111111', handNumber: 1 });
    expect(hand.deltas.reduce((sum, d) => sum + d.delta, 0)).toBe(0);
    expect(hand.deltas.map((d) => d.playerId).sort()).toEqual([ana, ben]);
    expect(hand.result.winners[0].playerId).toBe(ana);
    const seats = tables.rows.get('K7QX2M').seats;
    expect(seats).toHaveLength(1);
    expect(seats[0].stack).toBeGreaterThan(1000);
  });

  it('waits and retries when the database fails, and starts no new hand meanwhile', async () => {
    await newTable();
    await live.join('K7QX2M', { playerId: ben, playerName: 'Ben' });
    await live.join('K7QX2M', { playerId: cleo, playerName: 'Cleo' });
    await after(PAUSE);
    tables.failSaves = 2;
    const game = await live.get('K7QX2M');
    const toAct = game.hand.players[game.hand.toAct].id;
    const others = [ana, ben, cleo].filter((id) => id !== toAct);
    await live.leave('K7QX2M', toAct);
    await live.leave('K7QX2M', others[0]); // Only one player left in the hand: it ends.
    expect(tables.hands).toHaveLength(0);
    await after(RETRY);
    expect(tables.hands).toHaveLength(0); // Second failure.
    await after(PAUSE * 2);
    expect(tables.hands).toHaveLength(1);
    expect(tables.hands[0].handId).toBe('11111111-1111-4111-8111-111111111111'); // Same id on retry.
  });

  it('cannot delete a table while a hand is being played, but can between hands', async () => {
    await newTable();
    await live.join('K7QX2M', { playerId: ben, playerName: 'Ben' });
    await after(PAUSE);
    expect((await live.remove('K7QX2M')).status).toBe('hand_in_progress');
    await live.leave('K7QX2M', ben);
    expect((await live.remove('K7QX2M')).status).toBe('deleted');
    expect(tables.rows.has('K7QX2M')).toBe(false);
    expect((await live.remove('K7QX2M')).status).toBe('not_found');
  });
});

describe('pausing', () => {
  it('lets the current hand finish but starts no new one until resumed', async () => {
    await newTable();
    await live.join('K7QX2M', { playerId: ben, playerName: 'Ben' });
    await live.join('K7QX2M', { playerId: cleo, playerName: 'Cleo' });
    await after(PAUSE);
    expect(await live.setPaused('K7QX2M', true)).toBe(true);
    expect(tables.rows.get('K7QX2M').paused).toBe(true);
    expect(inHand(await live.get('K7QX2M'))).toBe(true); // The hand goes on.

    const game = await live.get('K7QX2M');
    const toAct = game.hand.players[game.hand.toAct].id;
    await live.leave('K7QX2M', toAct);
    const next = (await live.get('K7QX2M')).hand;
    await live.leave('K7QX2M', next.players[next.toAct].id); // Hand over.
    await live.join('K7QX2M', { playerId: ben, playerName: 'Ben' });
    await live.join('K7QX2M', { playerId: cleo, playerName: 'Cleo' });
    await after(PAUSE * 3);
    expect(inHand(await live.get('K7QX2M'))).toBe(false);

    await live.setPaused('K7QX2M', false);
    await after(PAUSE);
    expect(inHand(await live.get('K7QX2M'))).toBe(true);
  });

  it('reports an unknown table', async () => {
    expect(await live.setPaused('ZZZZZZ', true)).toBe(false);
  });
});

describe('leaving', () => {
  it('frees the seat at once between hands', async () => {
    await newTable();
    await live.join('K7QX2M', { playerId: ben, playerName: 'Ben' });
    expect((await live.leave('K7QX2M', ben)).status).toBe('left');
    expect(tables.rows.get('K7QX2M').seats).toHaveLength(1);
    expect((await live.get('K7QX2M')).seats[1]).toBeNull();
  });

  it('keeps the seat until the hand ends when other players are still in it', async () => {
    await newTable();
    await live.join('K7QX2M', { playerId: ben, playerName: 'Ben' });
    await live.join('K7QX2M', { playerId: cleo, playerName: 'Cleo' });
    await after(PAUSE);
    expect((await live.leave('K7QX2M', cleo)).status).toBe('leaving');
    expect(tables.rows.get('K7QX2M').seats).toHaveLength(3);
  });

  it('reports a player who is not seated and an unknown table', async () => {
    await newTable();
    expect((await live.leave('K7QX2M', ben)).status).toBe('not_seated');
    expect((await live.leave('ZZZZZZ', ben)).status).toBe('not_found');
  });
});

describe('restoring after a restart', () => {
  it('keeps the saved stacks and continues the hand numbers', async () => {
    await newTable();
    await live.join('K7QX2M', { playerId: ben, playerName: 'Ben' });
    const stored = tables.rows.get('K7QX2M');
    stored.seats[0].stack = 1300;
    stored.seats[1].stack = 700;
    tables.hands.push({ tableId: 'K7QX2M', handId: 'x', handNumber: 7 });
    live.close(); // Forget everything in memory, as after a scale-to-zero.

    const game = await live.get('K7QX2M');
    expect(game.seats[0].stack).toBe(1300);
    expect(game.seats[1].stack).toBe(700);
    await after(PAUSE);
    expect((await live.get('K7QX2M')).handNumber).toBe(8);
  });

  it('rebuilds an engine table that the engine accepts', () => {
    const game = restoreEngineTable(
      {
        smallBlind: 5, bigBlind: 10, startingStack: 1000, maxSeats: 3,
        seats: [{ seatIndex: 2, playerId: ben, name: 'Ben', stack: 40 }],
      },
      3,
    );
    expect(game.seats).toEqual([null, null, { id: ben, name: 'Ben', stack: 40, leaving: false }]);
    expect(game.handNumber).toBe(3);
  });

  it('returns null for a table that does not exist', async () => {
    expect(await live.get('ZZZZZZ')).toBeNull();
  });
});

describe('joining', () => {
  it('passes on what the database decided', async () => {
    await newTable({ maxSeats: 2 });
    expect((await live.join('K7QX2M', { playerId: ben, playerName: 'Ben' })).status).toBe('joined');
    expect((await live.join('K7QX2M', { playerId: cleo, playerName: 'Cleo' })).status).toBe('full');
    expect((await live.join('ZZZZZZ', { playerId: cleo, playerName: 'Cleo' })).status).toBe('not_found');
  });

  it('runs operations on one table in order, even when they arrive together', async () => {
    await newTable({ maxSeats: 3 });
    const results = await Promise.all([
      live.join('K7QX2M', { playerId: ben, playerName: 'Ben' }),
      live.join('K7QX2M', { playerId: cleo, playerName: 'Cleo' }),
      live.leave('K7QX2M', ben),
    ]);
    expect(results.map((r) => r.status)).toEqual(['joined', 'joined', 'left']);
    expect((await live.get('K7QX2M')).seats.map((s) => s?.id ?? null)).toEqual([ana, null, cleo]);
  });
});