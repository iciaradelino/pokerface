import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLiveTables } from '../src/liveTables.js';
import { EngineError } from '../src/engine/index.js';
import { fakeTablesRepository } from './fakes.js';

// Playing hands through the live tables: actions, the end of a hand and the turn timer.
const ana = '00000000-0000-4000-8000-000000000001';
const ben = '00000000-0000-4000-8000-000000000002';
const cleo = '00000000-0000-4000-8000-000000000003';
const PAUSE = 5000;
const TURN = 120_000;

let tables;
let live;
let changes;

const after = (ms) => vi.advanceTimersByTimeAsync(ms);
const toAct = (game) => game.hand.players[game.hand.toAct].id;

beforeEach(async () => {
  vi.useFakeTimers();
  tables = fakeTablesRepository();
  changes = [];
  live = createLiveTables({
    tables,
    handPauseMs: PAUSE,
    turnMs: TURN,
    onChange: (id, game, extra) => changes.push({ id, handNumber: game.handNumber, ...extra }),
    logger: () => {},
  });
  await tables.createTable({
    settings: { smallBlind: 5, bigBlind: 10, startingStack: 1000, maxSeats: 6 },
    createdBy: ana,
    creatorName: 'Ana',
    generateId: () => 'K7QX2M',
  });
  await live.join('K7QX2M', { playerId: ben, playerName: 'Ben' });
  await after(PAUSE); // The first hand starts.
});

afterEach(() => {
  live.close();
  vi.useRealTimers();
});

// Plays the current hand to the end: whoever is to act calls if they can, otherwise checks.
async function playToShowdown() {
  for (let moves = 0; moves < 20; moves++) {
    const game = await live.get('K7QX2M');
    if (game.hand.phase === 'complete') return game;
    const player = toAct(game);
    const { private: mine } = await live.view('K7QX2M', player);
    const action = mine.legalActions.includes('call') ? 'call' : 'check';
    await live.act('K7QX2M', player, { action });
  }
  throw new Error('The hand did not end');
}

describe('acting', () => {
  it('plays a hand to showdown and saves it', async () => {
    const game = await playToShowdown();
    expect(game.lastResult.showdown).toBe(true);
    expect(tables.hands).toHaveLength(1);
    expect(tables.hands[0].deltas.reduce((sum, d) => sum + d.delta, 0)).toBe(0);
  });

  it('returns the public state and the acting player\'s private view', async () => {
    const game = await live.get('K7QX2M');
    const player = toAct(game);
    const result = await live.act('K7QX2M', player, { action: 'call' });
    expect(result.status).toBe('ok');
    expect(result.state).toMatchObject({ type: 'state', stage: 'preflop' });
    expect(result.state.timerEndsAt).toEqual(expect.any(String));
    expect(JSON.stringify(result.state)).not.toContain('holeCards');
    expect(result.private).toMatchObject({ type: 'private', playerId: player });
    expect(result.private.holeCards).toHaveLength(2);
  });

  it('rejects an action out of turn with the engine error', async () => {
    const game = await live.get('K7QX2M');
    const waiting = [ana, ben].find((id) => id !== toAct(game));
    const error = await live.act('K7QX2M', waiting, { action: 'fold' }).catch((e) => e);
    expect(error).toBeInstanceOf(EngineError);
    expect(error.code).toBe('NOT_YOUR_TURN');
  });

  it('reports a table that does not exist', async () => {
    expect((await live.act('ZZZZZZ', ana, { action: 'fold' })).status).toBe('not_found');
    expect(await live.view('ZZZZZZ', ana)).toBeNull();
  });
});

describe('the turn timer', () => {
  it('checks or folds for a player who does not act in time', async () => {
    const before = await live.get('K7QX2M');
    const slow = toAct(before);
    await after(TURN);
    const game = await live.get('K7QX2M');
    // Preflop the small blind cannot check, so they fold and the hand ends.
    expect(game.hand.phase).toBe('complete');
    expect(game.lastResult.players.find((p) => p.id === slow).net).toBeLessThan(0);
    expect(tables.hands).toHaveLength(1);
  });

  it('gives the next player a fresh two minutes', async () => {
    const game = await live.get('K7QX2M');
    await after(TURN - 1000);
    await live.act('K7QX2M', toAct(game), { action: 'call' });
    const { state } = await live.view('K7QX2M', ana);
    expect(Date.parse(state.timerEndsAt) - Date.now()).toBe(TURN);
    await after(TURN - 1000);
    expect((await live.get('K7QX2M')).hand.phase).toBe('preflop'); // Not timed out yet.
  });

  it('keeps the timer running when someone joins mid-hand', async () => {
    const endsAt = changes.at(-1).timerEndsAt;
    await after(60_000);
    await live.join('K7QX2M', { playerId: cleo, playerName: 'Cleo' });
    expect(changes.at(-1).timerEndsAt).toBe(endsAt);
  });

  it('stops when the hand ends and sends no timer between hands', async () => {
    await playToShowdown();
    expect(changes.at(-1).timerEndsAt).toBeNull();
    const { state } = await live.view('K7QX2M', ana);
    expect(state.timerEndsAt).toBeNull();
  });
});