import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  act,
  actOnTimeout,
  createTable,
  isHandInProgress,
  legalActionsFor,
  playerToAct,
  sitDown,
  standUp,
  startNextHand,
  viewTable,
} from '../../../../src/modules/game/domain/table.js';
import { ErrorCode } from '../../../../src/modules/game/domain/errors.js';
import { seededRandomInt } from '../../../../src/modules/game/domain/random.js';

const opts = () => ({ randomInt: seededRandomInt(3) });

const tableWith = (...names) =>
  names.reduce((t, name) => sitDown(t, { id: name.toLowerCase(), name }), createTable());

const expectError = (fn, code) => {
  try {
    fn();
  } catch (error) {
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected an error with code ${code}`);
};

const totalChips = (t) => t.seats.reduce((sum, s) => sum + (s?.stack ?? 0), 0);

describe('table setup', () => {
  it('uses the default settings', () => {
    const t = createTable();
    expect(t.config).toEqual(DEFAULT_CONFIG);
    expect(t.seats).toEqual(Array(6).fill(null));
  });

  it.each([
    { smallBlind: 0 },
    { bigBlind: 2, smallBlind: 5 },
    { startingStack: 5 },
    { maxSeats: 1 },
    { maxSeats: 7 },
    { bigBlind: 'ten' },
  ])('rejects invalid settings %o', (config) => {
    expectError(() => createTable(config), ErrorCode.INVALID_CONFIG);
  });

  it('seats players with the starting stack', () => {
    const t = sitDown(createTable({ startingStack: 500 }), { id: 'p1', name: 'Ana' }, 3);
    expect(t.seats[3]).toEqual({ id: 'p1', name: 'Ana', stack: 500, leaving: false });
    expect(sitDown(t, { id: 'p2' }).seats[0]).toMatchObject({ id: 'p2', name: 'p2' });
  });

  it('rejects bad seating', () => {
    const t = sitDown(createTable({ maxSeats: 2 }), { id: 'a' }, 0);
    expectError(() => sitDown(t, { id: 'a' }), ErrorCode.ALREADY_SEATED);
    expectError(() => sitDown(t, { id: 'b' }, 0), ErrorCode.SEAT_TAKEN);
    expectError(() => sitDown(t, { id: 'b' }, 5), ErrorCode.INVALID_CONFIG);
    expectError(() => sitDown(t, { id: '' }), ErrorCode.INVALID_CONFIG);
    const full = sitDown(t, { id: 'b' });
    expectError(() => sitDown(full, { id: 'c' }), ErrorCode.TABLE_FULL);
  });
});

describe('playing hands', () => {
  it('needs two players with chips', () => {
    expectError(() => startNextHand(tableWith('Ana')), ErrorCode.NOT_ENOUGH_PLAYERS);
  });

  it('starts a hand and refuses to start another until it ends', () => {
    const t = startNextHand(tableWith('Ana', 'Ben', 'Cy'), opts());
    expect(isHandInProgress(t)).toBe(true);
    expect(t.handNumber).toBe(1);
    expect(t.buttonSeat).toBe(0);
    expect(playerToAct(t)).toBe('ana');
    expectError(() => startNextHand(t), ErrorCode.HAND_IN_PROGRESS);
  });

  it('copies final stacks to the seats and keeps the result', () => {
    let t = startNextHand(tableWith('Ana', 'Ben', 'Cy'), opts());
    t = act(t, 'ana', { type: 'fold' });
    t = act(t, 'ben', { type: 'fold' });
    expect(isHandInProgress(t)).toBe(false);
    expect(playerToAct(t)).toBeNull();
    expect(t.seats.slice(0, 3).map((s) => s.stack)).toEqual([1000, 995, 1005]);
    expect(t.lastResult).toMatchObject({ handNumber: 1, showdown: false });
    expect(totalChips(t)).toBe(3000);
  });

  it('moves the button clockwise and skips busted players', () => {
    let t = tableWith('Ana', 'Ben', 'Cy');
    t.seats[1].stack = 0;
    t = startNextHand(t, opts());
    expect(t.buttonSeat).toBe(0);
    t = actOnTimeout(t); // heads-up: the button (Ana) folds
    t = startNextHand(t, opts());
    expect(t.buttonSeat).toBe(2);
    expect(t.hand.players.map((p) => p.id)).toEqual(['ana', 'cy']);
  });

  it('applies timeouts and reports legal actions', () => {
    let t = startNextHand(tableWith('Ana', 'Ben'), opts());
    expect(legalActionsFor(t, 'ana').actions).toContain('call');
    expect(legalActionsFor(t, 'ben')).toBeNull();
    t = act(t, 'ana', { type: 'call' });
    t = actOnTimeout(t);
    expect(t.hand.phase).toBe('flop');
  });

  it('rejects actions when no hand is running', () => {
    const t = tableWith('Ana', 'Ben');
    expectError(() => act(t, 'ana', { type: 'call' }), ErrorCode.NO_HAND);
    expectError(() => actOnTimeout(t), ErrorCode.NO_HAND);
    expect(legalActionsFor(t, 'ana')).toBeNull();
    expect(playerToAct(t)).toBeNull();
  });

  it('settles a hand that ends as soon as it starts', () => {
    let t = tableWith('Ana', 'Ben');
    t.seats[0].stack = 5;
    t.seats[1].stack = 8;
    t = startNextHand(t, opts());
    expect(isHandInProgress(t)).toBe(false);
    expect(totalChips(t)).toBe(13);
    expect(t.lastResult.handNumber).toBe(1);
  });
});

describe('leaving', () => {
  it('removes a player at once between hands', () => {
    const t = standUp(tableWith('Ana', 'Ben'), 'ben');
    expect(t.seats[1]).toBeNull();
    expectError(() => standUp(t, 'ben'), ErrorCode.UNKNOWN_PLAYER);
  });

  it('folds a player who leaves mid-hand and frees the seat when the hand ends', () => {
    let t = startNextHand(tableWith('Ana', 'Ben', 'Cy'), opts());
    t = standUp(t, 'cy');
    expect(t.seats[2].leaving).toBe(true);
    expect(isHandInProgress(t)).toBe(true);
    t = act(t, 'ana', { type: 'fold' });
    expect(isHandInProgress(t)).toBe(false);
    expect(t.seats[2]).toBeNull();
    expect(t.seats[1].stack).toBe(1010);
  });

  it('removes at once a player who sat down after the hand started', () => {
    let t = startNextHand(tableWith('Ana', 'Ben'), opts());
    t = sitDown(t, { id: 'cy', name: 'Cy' });
    t = standUp(t, 'cy');
    expect(t.seats[2]).toBeNull();
    expect(isHandInProgress(t)).toBe(true);
  });
});

describe('viewTable', () => {
  it('shows live stacks during a hand and only the viewer’s own cards', () => {
    const t = startNextHand(tableWith('Ana', 'Ben', 'Cy'), opts());
    const view = viewTable(t, 'ben');
    expect(view.seats.map((s) => s?.stack ?? null)).toEqual([1000, 995, 990, null, null, null]);
    expect(view.hand.players.find((p) => p.id === 'ben').holeCards).toHaveLength(2);
    expect(view.hand.players.find((p) => p.id === 'ana').holeCards).toBeNull();
    expect(JSON.stringify(view)).not.toContain('deck');
    const ana = t.hand.players.find((p) => p.id === 'ana').holeCards;
    for (const card of ana) expect(JSON.stringify(view)).not.toContain(`"${card}"`);
  });

  it('works with no hand yet', () => {
    const view = viewTable(tableWith('Ana', 'Ben'));
    expect(view.hand).toBeNull();
    expect(view.lastResult).toBeNull();
  });
});
