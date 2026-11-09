import { describe, expect, it } from 'vitest';
import {
  act,
  createTable,
  isHandInProgress,
  sitDown,
  startNextHand,
  viewTable,
} from '../../../../src/modules/game/domain/table.js';
import { seededRandomInt } from '../../../../src/modules/game/domain/random.js';

/**
 * Plays thousands of random but legal actions and checks invariants that must always hold.
 * This catches rule bugs no hand-written scenario thought of.
 */
function randomAction(legal, random) {
  const type = legal.actions[random(legal.actions.length)];
  if (type !== 'raise') return { type };
  const span = legal.maxRaiseTo - legal.minRaiseTo;
  return { type, amount: legal.minRaiseTo + random(span + 1) };
}

describe('random play', () => {
  it.each([1, 2, 3, 4, 5])('keeps every invariant (seed %i)', (seed) => {
    const random = seededRandomInt(seed);
    const seats = 2 + (seed % 5);
    let table = createTable({ smallBlind: 5, bigBlind: 10, startingStack: 300 });
    for (let i = 0; i < seats; i++) table = sitDown(table, { id: `p${i}` });
    const chips = 300 * seats;
    let hands = 0;

    while (hands < 200 && table.seats.filter((s) => s && s.stack > 0).length >= 2) {
      table = startNextHand(table, { randomInt: random });
      hands += 1;
      let steps = 0;
      while (isHandInProgress(table)) {
        const hand = table.hand;
        const actor = hand.players[hand.toAct];
        // Chips in stacks plus chips in the pot never change during a hand.
        expect(hand.players.reduce((s, p) => s + p.stack + p.totalBet, 0)).toBe(chips);
        expect(hand.players.every((p) => p.stack >= 0)).toBe(true);
        expect(actor.folded || actor.allIn).toBe(false);
        // No other player's hole cards are visible to the player to act.
        const view = viewTable(table, actor.id);
        const others = hand.players.filter((p) => p.id !== actor.id);
        expect(
          view.hand.players.filter((p) => p.id !== actor.id).every((p) => p.holeCards === null),
        ).toBe(true);
        expect(others.length).toBeGreaterThan(0);

        table = act(table, actor.id, randomAction(view.hand.legalActions, random));
        steps += 1;
        expect(steps).toBeLessThan(200);
      }
      const result = table.lastResult;
      expect(result.players.reduce((s, p) => s + p.net, 0)).toBe(0);
      expect(table.seats.reduce((s, seat) => s + (seat?.stack ?? 0), 0)).toBe(chips);
      expect(result.board.length === 5 || !result.showdown).toBe(true);
    }
    expect(hands).toBeGreaterThan(0);
  });
});
