import { describe, expect, it } from 'vitest';
import { awardPots, buildPots } from '../../../../src/modules/game/domain/pots.js';

const c = (id, amount, folded = false) => ({ id, amount, folded });

describe('buildPots', () => {
  it('makes a single pot when everyone put in the same', () => {
    expect(buildPots([c('A', 100), c('B', 100), c('C', 100)])).toEqual([
      { amount: 300, eligible: ['A', 'B', 'C'], contributors: ['A', 'B', 'C'] },
    ]);
  });

  it('makes side pots for short all-ins', () => {
    const pots = buildPots([c('A', 100), c('B', 300), c('C', 300)]);
    expect(pots.map((p) => [p.amount, p.eligible])).toEqual([
      [300, ['A', 'B', 'C']],
      [400, ['B', 'C']],
    ]);
  });

  it('keeps folded chips in the pot but folded players cannot win', () => {
    const pots = buildPots([c('A', 50, true), c('B', 200), c('C', 200)]);
    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(450);
    expect(pots[0].eligible).toEqual(['B', 'C']);
  });

  it('returns an uncalled excess as a pot only its owner can win', () => {
    const pots = buildPots([c('A', 500), c('B', 200)]);
    expect(pots.at(-1)).toEqual({ amount: 300, eligible: ['A'], contributors: ['A'] });
  });

  it('adds chips nobody can win (top contributor folded) to the pot below', () => {
    const pots = buildPots([c('A', 300, true), c('B', 100), c('C', 50)]);
    expect(pots.reduce((s, p) => s + p.amount, 0)).toBe(450);
    expect(pots.at(-1).eligible).toEqual(['B']);
  });

  it('fails if nobody can win any chips', () => {
    expect(() => buildPots([c('A', 10, true), c('B', 10, true)])).toThrow();
  });
});

describe('awardPots', () => {
  const order = ['A', 'B', 'C'];

  it('gives each pot to the best eligible hand', () => {
    const pots = buildPots([c('A', 100), c('B', 300), c('C', 300)]);
    const awarded = awardPots(pots, { A: [9], B: [5], C: [1] }, order);
    expect(awarded.map((p) => p.winners)).toEqual([
      [{ id: 'A', amount: 300 }],
      [{ id: 'B', amount: 400 }],
    ]);
  });

  it('gives the odd chip to the first winner left of the button', () => {
    const pots = [{ amount: 25, eligible: ['A', 'C'], contributors: ['A', 'B', 'C'] }];
    const awarded = awardPots(pots, { A: [4, 14], C: [4, 14] }, ['B', 'C', 'A']);
    expect(awarded[0].winners).toEqual([
      { id: 'C', amount: 13 },
      { id: 'A', amount: 12 },
    ]);
  });

  it('fails without a score for a contested pot', () => {
    expect(() => awardPots([{ amount: 10, eligible: ['A', 'B'] }], { A: [1] }, order)).toThrow();
  });
});
