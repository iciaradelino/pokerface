import { describe, expect, it } from 'vitest';
import {
  ActionType,
  Phase,
  applyAction,
  applyTimeout,
  legalActions,
  playerLeaves,
  startHand,
  timeoutAction,
  viewHand,
} from '../../../../src/modules/game/domain/hand.js';
import { ErrorCode } from '../../../../src/modules/game/domain/errors.js';
import { seededRandomInt } from '../../../../src/modules/game/domain/random.js';
import { byId, players, riggedDeck, toActId } from './helpers.js';

const fold = { type: ActionType.FOLD };
const check = { type: ActionType.CHECK };
const call = { type: ActionType.CALL };
const allIn = { type: ActionType.ALL_IN };
const raise = (amount) => ({ type: ActionType.RAISE, amount });

/** Applies [playerId, action] pairs in order. */
const play = (state, ...moves) => moves.reduce((s, [id, a]) => applyAction(s, id, a), state);

const start = (stacks, { buttonIndex = 0, deck, sb = 5, bb = 10 } = {}) =>
  startHand(
    { players: players(...stacks), buttonIndex, smallBlind: sb, bigBlind: bb },
    deck ? { deck } : { randomInt: seededRandomInt(1) },
  );

const expectError = (fn, code) => {
  try {
    fn();
  } catch (error) {
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected an error with code ${code}`);
};

describe('starting a hand', () => {
  it('posts blinds, deals two cards each and gives the first action to the left of the big blind', () => {
    const s = start([1000, 1000, 1000]);
    expect(byId(s, 'B')).toMatchObject({ stack: 995, streetBet: 5 });
    expect(byId(s, 'C')).toMatchObject({ stack: 990, streetBet: 10 });
    expect(s.players.every((p) => p.holeCards.length === 2)).toBe(true);
    expect(s.deck).toHaveLength(46);
    expect(s.currentBet).toBe(10);
    expect(toActId(s)).toBe('A');
    expect(s.phase).toBe(Phase.PREFLOP);
  });

  it('heads-up: the button posts the small blind and acts first preflop, last after the flop', () => {
    let s = start([1000, 1000]);
    expect(byId(s, 'A').streetBet).toBe(5);
    expect(byId(s, 'B').streetBet).toBe(10);
    expect(toActId(s)).toBe('A');
    s = play(s, ['A', call], ['B', check]);
    expect(s.phase).toBe(Phase.FLOP);
    expect(toActId(s)).toBe('B');
  });

  it('deals with a fixed deck in the real order', () => {
    const deck = riggedDeck({
      hands: [
        ['As', 'Ks'],
        ['2c', '7d'],
        ['Qh', 'Qd'],
      ],
      board: ['Ts', 'Js', 'Qs', '3c', '4d'],
    });
    const s = start([1000, 1000, 1000], { deck });
    expect(byId(s, 'A').holeCards).toEqual(['As', 'Ks']);
    expect(byId(s, 'C').holeCards).toEqual(['Qh', 'Qd']);
  });

  it('lets a short stack post part of a blind and be all-in', () => {
    const s = start([1000, 3, 1000]);
    expect(byId(s, 'B')).toMatchObject({ stack: 0, streetBet: 3, allIn: true });
    expect(s.currentBet).toBe(10);
  });

  it.each([
    [{ players: players(1000), buttonIndex: 0, smallBlind: 5, bigBlind: 10 }],
    [{ players: players(1000, 0), buttonIndex: 0, smallBlind: 5, bigBlind: 10 }],
    [{ players: players(1000, 1000), buttonIndex: 2, smallBlind: 5, bigBlind: 10 }],
    [{ players: players(1000, 1000), buttonIndex: 0, smallBlind: 10, bigBlind: 5 }],
    [{ players: players(1000, 1000), buttonIndex: 0, smallBlind: 2.5, bigBlind: 5 }],
    [
      {
        players: [
          { id: 'A', stack: 10 },
          { id: 'A', stack: 10 },
        ],
        buttonIndex: 0,
        smallBlind: 1,
        bigBlind: 2,
      },
    ],
  ])('rejects invalid settings %#', (params) => {
    expectError(() => startHand(params), ErrorCode.INVALID_CONFIG);
  });

  it('rejects a fixed deck that is not a full deck', () => {
    const params = { players: players(100, 100), buttonIndex: 0, smallBlind: 1, bigBlind: 2 };
    expectError(() => startHand(params, { deck: ['As'] }), ErrorCode.INVALID_CONFIG);
  });

  it('shuffles securely by default', () => {
    const params = { players: players(100, 100), buttonIndex: 0, smallBlind: 1, bigBlind: 2 };
    expect(startHand(params).deck).toHaveLength(48);
  });
});

describe('betting', () => {
  it('gives the big blind the option when everyone limps', () => {
    let s = start([1000, 1000, 1000]);
    s = play(s, ['A', call], ['B', call]);
    expect(toActId(s)).toBe('C');
    expect(legalActions(s, 'C').actions).toEqual(['fold', 'check', 'raise', 'allIn']);
    s = play(s, ['C', check]);
    expect(s.phase).toBe(Phase.FLOP);
    expect(s.board).toHaveLength(3);
    expect(toActId(s)).toBe('B');
    expect(s.players.every((p) => p.streetBet === 0)).toBe(true);
  });

  it('plays all four streets', () => {
    let s = start([1000, 1000, 1000]);
    s = play(s, ['A', call], ['B', call], ['C', check]);
    for (const phase of [Phase.TURN, Phase.RIVER, Phase.COMPLETE]) {
      s = play(s, ['B', check], ['C', check], ['A', check]);
      expect(s.phase).toBe(phase);
    }
    expect(s.board).toHaveLength(5);
    expect(s.result.showdown).toBe(true);
  });

  it('enforces the minimum raise and allows raising to any amount up to the stack', () => {
    let s = start([1000, 1000, 1000]);
    expect(legalActions(s, 'A')).toMatchObject({ toCall: 10, minRaiseTo: 20, maxRaiseTo: 1000 });
    expectError(() => applyAction(s, 'A', raise(15)), ErrorCode.INVALID_AMOUNT);
    expectError(() => applyAction(s, 'A', raise(1001)), ErrorCode.INVALID_AMOUNT);
    expectError(() => applyAction(s, 'A', raise(20.5)), ErrorCode.INVALID_AMOUNT);
    expectError(() => applyAction(s, 'A', { type: 'raise' }), ErrorCode.INVALID_AMOUNT);
    s = play(s, ['A', raise(50)]);
    // The raise was 40, so the next raise must be to at least 90.
    expect(legalActions(s, 'B')).toMatchObject({ toCall: 45, minRaiseTo: 90 });
  });

  it('uses the big blind as the minimum opening bet after the flop', () => {
    let s = start([1000, 1000]);
    s = play(s, ['A', call], ['B', check]);
    expect(legalActions(s, 'B')).toMatchObject({ toCall: 0, minRaiseTo: 10 });
    s = play(s, ['B', raise(10)], ['A', raise(20)]);
    expect(legalActions(s, 'B')).toMatchObject({ toCall: 10, minRaiseTo: 30 });
  });

  it('rejects actions that do not fit the situation', () => {
    const s = start([1000, 1000, 1000]);
    expectError(() => applyAction(s, 'B', call), ErrorCode.NOT_YOUR_TURN);
    expectError(() => applyAction(s, 'Z', call), ErrorCode.UNKNOWN_PLAYER);
    expectError(() => applyAction(s, 'A', check), ErrorCode.ILLEGAL_ACTION);
    expectError(() => applyAction(s, 'A', { type: 'dance' }), ErrorCode.INVALID_ACTION);
    expectError(() => applyAction(s, 'A', null), ErrorCode.INVALID_ACTION);
    const limped = play(s, ['A', call], ['B', call]);
    expectError(() => applyAction(limped, 'C', call), ErrorCode.ILLEGAL_ACTION);
  });

  it('never modifies the state it is given', () => {
    const s = start([1000, 1000, 1000]);
    const copy = structuredClone(s);
    applyAction(s, 'A', raise(30));
    expect(s).toEqual(copy);
  });

  it('only answers legalActions for the player whose turn it is', () => {
    const s = start([1000, 1000, 1000]);
    expect(legalActions(s, 'B')).toBeNull();
    expect(legalActions(s, 'Z')).toBeNull();
  });
});

describe('all-in rules', () => {
  it('an all-in smaller than a full raise does not reopen the betting', () => {
    // A raises to 20, B calls, C (big blind, 25 chips) goes all-in to 25: a 5-chip raise.
    let s = start([1000, 1000, 25]);
    s = play(s, ['A', raise(20)], ['B', call], ['C', allIn]);
    expect(byId(s, 'C').allIn).toBe(true);
    expect(toActId(s)).toBe('A');
    expect(legalActions(s, 'A')).toMatchObject({ actions: ['fold', 'call'], toCall: 5 });
    expectError(() => applyAction(s, 'A', raise(100)), ErrorCode.ILLEGAL_ACTION);
    expectError(() => applyAction(s, 'A', allIn), ErrorCode.ILLEGAL_ACTION);
    s = play(s, ['A', call], ['B', call]);
    expect(s.phase).toBe(Phase.FLOP);
  });

  it('a full-size all-in raise reopens the betting', () => {
    let s = start([1000, 1000, 40]);
    s = play(s, ['A', raise(20)], ['B', call], ['C', allIn]);
    expect(legalActions(s, 'A').actions).toContain('raise');
    expect(legalActions(s, 'A').minRaiseTo).toBe(60);
  });

  it('a player who has not acted yet may still raise over a short all-in', () => {
    let s = start([1000, 1000, 1000, 1000, 25]);
    // Button A; SB B; BB C; first to act D.
    s = play(s, ['D', raise(20)], ['E', allIn]);
    expect(legalActions(s, 'A').actions).toContain('raise');
    expect(legalActions(s, 'A').minRaiseTo).toBe(35);
  });

  it('cannot raise when every opponent is all-in', () => {
    const s = play(start([1000, 2000]), ['A', allIn]);
    expect(legalActions(s, 'B')).toMatchObject({ actions: ['fold', 'call'], toCall: 990 });
  });

  it('an all-in for less than the call is a call', () => {
    let s = start([1000, 30]);
    s = play(s, ['A', raise(100)]);
    expect(legalActions(s, 'B')).toMatchObject({ actions: ['fold', 'call', 'allIn'], toCall: 20 });
    s = play(s, ['B', allIn]);
    expect(s.phase).toBe(Phase.COMPLETE);
    expect(s.players.reduce((sum, p) => sum + p.stack, 0)).toBe(1030);
  });

  it('runs out the board when players are all-in', () => {
    let s = start([500, 500]);
    s = play(s, ['A', allIn], ['B', call]);
    expect(s.phase).toBe(Phase.COMPLETE);
    expect(s.board).toHaveLength(5);
    expect(s.result.showdown).toBe(true);
    expect(s.players.reduce((sum, p) => sum + p.stack, 0)).toBe(1000);
  });

  it('runs out the board after a call when only one player can still bet', () => {
    let s = start([1000, 1000, 200]);
    s = play(s, ['A', call], ['B', call], ['C', check]);
    s = play(s, ['B', check], ['C', allIn], ['A', call], ['B', fold]);
    expect(s.phase).toBe(Phase.COMPLETE);
    expect(s.board).toHaveLength(5);
  });

  it('ends at once when the blinds put everyone all-in', () => {
    const s = start([5, 8]);
    expect(s.phase).toBe(Phase.COMPLETE);
    expect(s.players.reduce((sum, p) => sum + p.stack, 0)).toBe(13);
  });

  it('does not ask a covered big blind to act when the only other player is all-in', () => {
    const s = start([3, 1000]);
    expect(s.phase).toBe(Phase.COMPLETE);
  });
});

describe('ending a hand', () => {
  it('gives the pot to the last player standing without a showdown', () => {
    let s = start([1000, 1000, 1000]);
    s = play(s, ['A', fold], ['B', fold]);
    expect(s.phase).toBe(Phase.COMPLETE);
    expect(s.result.showdown).toBe(false);
    expect(s.result.revealed).toEqual({});
    expect(byId(s, 'C').stack).toBe(1005);
    expect(s.result.players.find((p) => p.id === 'C')).toMatchObject({ net: 5, won: true });
    expect(s.result.players.find((p) => p.id === 'B')).toMatchObject({ net: -5, won: false });
    expectError(() => applyAction(s, 'C', check), ErrorCode.HAND_OVER);
  });

  it('pays the best hand at showdown', () => {
    const deck = riggedDeck({
      hands: [
        ['As', 'Ad'],
        ['Kc', 'Kd'],
      ],
      board: ['2c', '7h', '9s', 'Jd', '3c'],
    });
    let s = start([1000, 1000], { deck });
    s = play(s, ['A', raise(100)], ['B', call]);
    for (let street = 0; street < 3; street++) s = play(s, ['B', check], ['A', check]);
    expect(s.result.pots[0].winners).toEqual([{ id: 'A', amount: 200, handName: 'Pair' }]);
    expect(byId(s, 'A').stack).toBe(1100);
    expect(s.result.revealed).toEqual({ A: ['As', 'Ad'], B: ['Kc', 'Kd'] });
  });

  it('splits a pot and gives the odd chip left of the button', () => {
    // Both play the board straight. B folds the small blind, so the pot is 25.
    const deck = riggedDeck({
      hands: [
        ['2c', '3d'],
        ['4c', '5d'],
        ['2h', '3s'],
      ],
      board: ['Ts', 'Jh', 'Qd', 'Kc', 'Ah'],
    });
    let s = start([1000, 1000, 1000], { deck });
    s = play(s, ['A', call], ['B', fold], ['C', check]);
    for (let street = 0; street < 3; street++) s = play(s, ['C', check], ['A', check]);
    expect(s.result.pots[0].winners).toEqual([
      { id: 'C', amount: 13, handName: 'Straight' },
      { id: 'A', amount: 12, handName: 'Straight' },
    ]);
  });

  it('builds side pots for different all-in amounts', () => {
    const deck = riggedDeck({
      hands: [
        ['As', 'Ad'],
        ['Kc', 'Kd'],
        ['7c', '2d'],
      ],
      board: ['3s', '8h', '9s', 'Jd', '4c'],
    });
    let s = start([100, 300, 1000], { deck });
    s = play(s, ['A', allIn], ['B', allIn], ['C', call]);
    expect(s.phase).toBe(Phase.COMPLETE);
    expect(s.result.pots.map((p) => [p.amount, p.winners.map((w) => w.id)])).toEqual([
      [300, ['A']],
      [400, ['B']],
    ]);
    expect(s.players.map((p) => p.stack)).toEqual([300, 400, 700]);
  });

  it('returns an uncalled bet', () => {
    const deck = riggedDeck({
      hands: [
        ['7c', '2d'],
        ['As', 'Ad'],
      ],
      board: ['3s', '8h', '9s', 'Jd', '4c'],
    });
    let s = start([1000, 200], { deck });
    s = play(s, ['A', allIn], ['B', call]);
    expect(byId(s, 'A').stack).toBe(800);
    expect(byId(s, 'B').stack).toBe(400);
    expect(s.result.players.find((p) => p.id === 'A').won).toBe(false);
  });
});

describe('timeouts and leaving', () => {
  it('checks on timeout when possible, otherwise folds', () => {
    let s = start([1000, 1000]);
    expect(timeoutAction(s)).toEqual(fold);
    s = play(s, ['A', call]);
    expect(timeoutAction(s)).toEqual(check);
    s = applyTimeout(s);
    expect(s.phase).toBe(Phase.FLOP);
    s = applyTimeout(applyTimeout(s));
    expect(s.phase).toBe(Phase.TURN);
  });

  it('has no timeout action once the hand is over', () => {
    const s = play(start([1000, 1000]), ['A', fold]);
    expect(timeoutAction(s)).toBeNull();
    expectError(() => applyTimeout(s), ErrorCode.HAND_OVER);
  });

  it('folds a player who leaves out of turn and keeps the turn where it was', () => {
    let s = start([1000, 1000, 1000]);
    s = playerLeaves(s, 'C');
    expect(byId(s, 'C').folded).toBe(true);
    expect(toActId(s)).toBe('A');
    s = play(s, ['A', call]);
    expect(toActId(s)).toBe('B');
  });

  it('moves the turn on when the player to act leaves', () => {
    let s = start([1000, 1000, 1000]);
    s = playerLeaves(s, 'A');
    expect(toActId(s)).toBe('B');
  });

  it('ends the hand when only one player is left', () => {
    const s = playerLeaves(start([1000, 1000]), 'B');
    expect(s.phase).toBe(Phase.COMPLETE);
    expect(byId(s, 'A').stack).toBe(1010);
  });

  it('keeps an all-in player in the hand when they leave', () => {
    let s = play(start([1000, 1000, 1000]), ['A', allIn]);
    s = playerLeaves(s, 'A');
    expect(byId(s, 'A').folded).toBe(false);
    expect(playerLeaves(s, 'A')).toEqual(s);
  });

  it('ignores leaving after the hand is over and rejects unknown players', () => {
    const over = play(start([1000, 1000]), ['A', fold]);
    expect(playerLeaves(over, 'A')).toBe(over);
    expectError(() => playerLeaves(start([1000, 1000]), 'Z'), ErrorCode.UNKNOWN_PLAYER);
  });
});

describe('private views', () => {
  const deck = riggedDeck({
    hands: [
      ['As', 'Ad'],
      ['Kc', 'Kd'],
      ['7c', '2d'],
    ],
    board: ['3s', '8h', '9s', 'Jd', '4c'],
  });

  it('shows a player only their own hole cards and never the deck', () => {
    const s = start([1000, 1000, 1000], { deck });
    const view = viewHand(s, 'A');
    expect(view).not.toHaveProperty('deck');
    expect(view.players.map((p) => p.holeCards)).toEqual([['As', 'Ad'], null, null]);
    expect(view.legalActions.actions).toContain('call');
    expect(viewHand(s, 'B').legalActions).toBeNull();
    expect(JSON.stringify(viewHand(s, 'B'))).not.toContain('As');
  });

  it('shows spectators no hole cards', () => {
    const view = viewHand(start([1000, 1000, 1000], { deck }), null);
    expect(view.players.every((p) => p.holeCards === null)).toBe(true);
    expect(view.legalActions).toBeNull();
  });

  it('reveals hands at showdown but never the cards of folded players', () => {
    let s = start([1000, 1000, 1000], { deck });
    s = play(s, ['A', call], ['B', call], ['C', fold]);
    for (let street = 0; street < 3; street++) s = play(s, ['B', check], ['A', check]);
    const view = viewHand(s, null);
    expect(view.players.map((p) => p.holeCards)).toEqual([['As', 'Ad'], ['Kc', 'Kd'], null]);
    expect(JSON.stringify(view)).not.toContain('7c');
    expect(view.result.hands.A.name).toBe('Pair');
  });

  it('reports the pot and whose turn it is', () => {
    const view = viewHand(start([1000, 1000, 1000], { deck }), 'A');
    expect(view).toMatchObject({ pot: 15, toAct: 'A', buttonId: 'A', currentBet: 10 });
  });
});
