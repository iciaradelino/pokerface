import { describe, expect, it } from 'vitest';
import {
  handResults,
  httpStatusFor,
  privateState,
  publicState,
  toEngineAction,
} from '../../src/engine/messages.js';
import { act, createTable, sitDown, standUp, startNextHand } from '../../src/engine/table.js';
import { EngineError, ErrorCode } from '../../src/engine/errors.js';
import { riggedDeck } from './helpers.js';
import { seededRandomInt } from '../../src/engine/random.js';

const table3 = () =>
  ['Ana', 'Ben', 'Cy'].reduce(
    (t, name) => sitDown(t, { id: name.toLowerCase(), name }),
    createTable(),
  );

// Ana is the button, Ben small blind, Cy big blind; Ana acts first.
const deck = riggedDeck({
  hands: [
    ['As', 'Ad'],
    ['Kc', 'Kd'],
    ['7c', '2d'],
  ],
  board: ['3s', '8h', '9s', 'Jd', '4c'],
});
const started = () => startNextHand(table3(), { deck });

const play = (table, ...moves) =>
  moves.reduce((t, [id, body]) => act(t, id, toEngineAction(body)), table);

describe('toEngineAction', () => {
  it.each([
    [{ action: 'fold' }, { type: 'fold' }],
    [{ action: 'check' }, { type: 'check' }],
    [{ action: 'call' }, { type: 'call' }],
    [{ action: 'allin' }, { type: 'allIn' }],
    [
      { action: 'raise', amount: 60 },
      { type: 'raise', amount: 60 },
    ],
    [{ action: 'call', amount: 999 }, { type: 'call' }],
  ])('%o', (body, expected) => {
    expect(toEngineAction(body)).toEqual(expected);
  });

  it.each([[{ action: 'allIn' }], [{ action: 'bet' }], [{}], [null]])('rejects %o', (body) => {
    expect(() => toEngineAction(body)).toThrow(EngineError);
  });
});

describe('httpStatusFor', () => {
  it.each([
    [ErrorCode.INVALID_ACTION, 400],
    [ErrorCode.INVALID_AMOUNT, 400],
    [ErrorCode.INVALID_CONFIG, 400],
    [ErrorCode.UNKNOWN_PLAYER, 404],
    [ErrorCode.NOT_YOUR_TURN, 409],
    [ErrorCode.ILLEGAL_ACTION, 409],
    [ErrorCode.HAND_OVER, 409],
  ])('%s -> %i', (code, status) => {
    expect(httpStatusFor(new EngineError(code, 'x'))).toBe(status);
  });

  it('treats anything that is not an engine error as a server error', () => {
    expect(httpStatusFor(new Error('boom'))).toBe(500);
  });
});

describe('publicState', () => {
  it('describes a table before the first hand', () => {
    expect(publicState(table3())).toEqual({
      type: 'state',
      handNumber: 0,
      stage: 'waiting',
      board: [],
      pots: [],
      dealer: null,
      currentPlayer: null,
      timerEndsAt: null,
      seats: [
        { seat: 0, playerId: 'ana', name: 'Ana', stack: 1000, bet: 0, status: 'waiting' },
        { seat: 1, playerId: 'ben', name: 'Ben', stack: 1000, bet: 0, status: 'waiting' },
        { seat: 2, playerId: 'cy', name: 'Cy', stack: 1000, bet: 0, status: 'waiting' },
      ],
      result: null,
    });
  });

  it('shows blinds, the dealer, whose turn it is and the timer during a hand', () => {
    const state = publicState(started(), { timerEndsAt: '2026-11-20T18:00:30.000Z' });
    expect(state).toMatchObject({
      stage: 'preflop',
      dealer: 'ana',
      currentPlayer: 'ana',
      timerEndsAt: '2026-11-20T18:00:30.000Z',
      pots: [{ amount: 15, eligible: ['ana', 'ben', 'cy'] }],
    });
    expect(state.seats.map((s) => [s.playerId, s.stack, s.bet, s.status])).toEqual([
      ['ana', 1000, 0, 'active'],
      ['ben', 995, 5, 'active'],
      ['cy', 990, 10, 'active'],
    ]);
  });

  it('never contains hole cards during a hand', () => {
    const json = JSON.stringify(publicState(started()));
    for (const card of ['As', 'Ad', 'Kc', 'Kd', '7c', '2d'])
      expect(json).not.toContain(`"${card}"`);
  });

  it('shows folded and all-in players and the side pots', () => {
    let table = table3();
    table.seats[2].stack = 100; // Cy is short-stacked
    table = startNextHand(table, { deck });
    table = play(table, ['ana', { action: 'raise', amount: 300 }], ['ben', { action: 'fold' }]);
    table = play(table, ['cy', { action: 'allin' }]);
    // Cy all-in for 100 against Ana's 300: run out to showdown at once.
    const state = publicState(table);
    expect(state.stage).toBe('complete');
    expect(state.result.winners).toEqual([
      { playerId: 'ana', amount: 205, handName: 'Pair' },
      { playerId: 'ana', amount: 200, handName: 'Pair' },
    ]);
  });

  it('reports live side pots while betting continues', () => {
    let table = table3();
    table.seats[2].stack = 100;
    table = startNextHand(table, { deck });
    table = play(table, ['ana', { action: 'raise', amount: 300 }], ['ben', { action: 'call' }]);
    table = play(table, ['cy', { action: 'allin' }]);
    const state = publicState(table);
    expect(state.stage).toBe('flop');
    expect(state.pots).toEqual([
      { amount: 300, eligible: ['ana', 'ben', 'cy'] },
      { amount: 400, eligible: ['ana', 'ben'] },
    ]);
    expect(state.seats.find((s) => s.playerId === 'cy').status).toBe('allin');
  });

  it('reveals only the cards shown at showdown, and the winners', () => {
    let table = started();
    table = play(table, ['ana', { action: 'call' }], ['ben', { action: 'call' }]);
    table = play(table, ['cy', { action: 'fold' }]);
    for (let street = 0; street < 3; street++) {
      table = play(table, ['ben', { action: 'check' }], ['ana', { action: 'check' }]);
    }
    const state = publicState(table);
    expect(state).toMatchObject({ stage: 'complete', currentPlayer: null, timerEndsAt: null });
    expect(state.result).toEqual({
      handNumber: 1,
      showdown: true,
      winners: [{ playerId: 'ana', amount: 30, handName: 'Pair' }],
      revealed: { ana: ['As', 'Ad'], ben: ['Kc', 'Kd'] },
    });
    expect(JSON.stringify(state)).not.toContain('"7c"');
    expect(state.pots).toEqual([{ amount: 30, eligible: ['ana', 'ben'] }]);
  });

  it('marks players without chips as out and new players as waiting', () => {
    let table = table3();
    table.seats[2].stack = 0;
    table = startNextHand(table, { deck: riggedDeck({ hands: [[], []] }) });
    table = sitDown(table, { id: 'dee', name: 'Dee' });
    const statuses = Object.fromEntries(
      publicState(table).seats.map((s) => [s.playerId, s.status]),
    );
    expect(statuses).toEqual({ ana: 'active', ben: 'active', cy: 'out', dee: 'waiting' });
  });

  it('shows a player who left mid-hand as folded until the hand ends', () => {
    const table = standUp(started(), 'cy');
    expect(publicState(table).seats.find((s) => s.playerId === 'cy').status).toBe('folded');
  });
});

describe('privateState', () => {
  it('gives the player to act their cards, legal actions and raise limits', () => {
    expect(privateState(started(), 'ana')).toEqual({
      type: 'private',
      playerId: 'ana',
      holeCards: ['As', 'Ad'],
      legalActions: ['fold', 'call', 'raise', 'allin'],
      toCall: 10,
      minRaise: 20,
      maxRaise: 1000,
    });
  });

  it('gives other players only their own cards', () => {
    expect(privateState(started(), 'ben')).toEqual({
      type: 'private',
      playerId: 'ben',
      holeCards: ['Kc', 'Kd'],
      legalActions: [],
      toCall: 0,
      minRaise: null,
      maxRaise: null,
    });
  });

  it('has no cards for someone not dealt in, and no actions after the hand', () => {
    expect(privateState(table3(), 'ana').holeCards).toEqual([]);
    const finished = play(started(), ['ana', { action: 'fold' }], ['ben', { action: 'fold' }]);
    expect(privateState(finished, 'cy')).toMatchObject({ legalActions: [], minRaise: null });
    expect(privateState(finished, 'cy').holeCards).toEqual(['7c', '2d']);
  });
});

describe('handResults', () => {
  it('is empty before any hand has finished', () => {
    expect(handResults(started(), 'T1')).toEqual([]);
  });

  it('gives one result per player, with a hand id unique to the table and hand', () => {
    const finished = play(started(), ['ana', { action: 'fold' }], ['ben', { action: 'fold' }]);
    const results = handResults(finished, 'T1');
    expect(results).toEqual([
      { playerId: 'ana', body: { handId: 'T1-1', delta: 0 } },
      { playerId: 'ben', body: { handId: 'T1-1', delta: -5 } },
      { playerId: 'cy', body: { handId: 'T1-1', delta: 5 } },
    ]);
    expect(results.reduce((sum, r) => sum + r.body.delta, 0)).toBe(0);
  });
});

describe('random play', () => {
  it.each([1, 2, 3])('keeps the messages consistent (seed %i)', (seed) => {
    const random = seededRandomInt(seed);
    let table = createTable({ startingStack: 200 });
    for (let i = 0; i < 2 + seed; i++) table = sitDown(table, { id: `p${i}`, name: `P${i}` });

    for (let hand = 0; hand < 100; hand++) {
      if (table.seats.filter((s) => s && s.stack > 0).length < 2) break;
      table = startNextHand(table, { randomInt: random });
      while (table.hand.phase !== 'complete') {
        const state = publicState(table);
        const bet = table.hand.players.reduce((sum, p) => sum + p.totalBet, 0);
        expect(state.pots.reduce((sum, p) => sum + p.amount, 0)).toBe(bet);
        for (const p of table.hand.players) {
          for (const card of p.holeCards) expect(JSON.stringify(state)).not.toContain(`"${card}"`);
        }
        const actor = state.currentPlayer;
        const mine = privateState(table, actor);
        expect(mine.legalActions.length).toBeGreaterThan(0);
        const action = mine.legalActions[random(mine.legalActions.length)];
        const body =
          action === 'raise'
            ? { action, amount: mine.minRaise + random(mine.maxRaise - mine.minRaise + 1) }
            : { action };
        table = act(table, actor, toEngineAction(body));
      }
      expect(handResults(table, 'T').reduce((sum, r) => sum + r.body.delta, 0)).toBe(0);
    }
  });
});
