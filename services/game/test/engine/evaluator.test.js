import { describe, expect, it } from 'vitest';
import {
  Category,
  compareScores,
  evaluateBest,
} from '../../src/engine/evaluator.js';

const best = (cards) => evaluateBest(cards.split(' '));
const beats = (a, b) => compareScores(best(a).score, best(b).score) > 0;
const ties = (a, b) => compareScores(best(a).score, best(b).score) === 0;

describe('hand categories', () => {
  it.each([
    ['Ah Kh Qh Jh Th', Category.STRAIGHT_FLUSH],
    ['9c 9d 9h 9s 2c', Category.FOUR_OF_A_KIND],
    ['Kc Kd Ks 7h 7c', Category.FULL_HOUSE],
    ['2d 7d 9d Jd Kd', Category.FLUSH],
    ['5c 6d 7h 8s 9c', Category.STRAIGHT],
    ['Ac 2d 3h 4s 5c', Category.STRAIGHT],
    ['Qc Qd Qh 4s 2c', Category.THREE_OF_A_KIND],
    ['Jc Jd 4h 4s 2c', Category.TWO_PAIR],
    ['Tc Td 8h 4s 2c', Category.PAIR],
    ['Ac Jd 8h 4s 2c', Category.HIGH_CARD],
  ])('%s', (cards, category) => {
    expect(best(cards).category).toBe(category);
  });

  it('names the hand', () => {
    expect(best('Kc Kd Ks 7h 7c').name).toBe('Full House');
  });
});

describe('comparisons', () => {
  it('ranks categories', () => {
    expect(beats('2c 2d 3h 4s 5c', 'Ac Kd Qh Js 9c')).toBe(true);
    expect(beats('2d 7d 9d Jd Kd', 'Tc Jd Qh Ks Ac')).toBe(true);
  });

  it('treats the wheel as the lowest straight', () => {
    expect(beats('2c 3d 4h 5s 6c', 'Ac 2d 3h 4s 5c')).toBe(true);
    expect(best('Ac 2c 3c 4c 5c').score).toEqual([Category.STRAIGHT_FLUSH, 5]);
  });

  it('does not wrap straights around the ace', () => {
    expect(best('Qc Kd Ah 2s 3c').category).toBe(Category.HIGH_CARD);
  });

  it('uses kickers', () => {
    expect(beats('Ac Ad Kh 4s 2c', 'As Ah Qh 4d 3c')).toBe(true);
    expect(beats('Jc Jd 4h 4s Ac', 'Js Jh 4c 4d Kc')).toBe(true);
    expect(beats('Ad Jd 9d 4d 3d', 'Ac Jc 9c 4c 2c')).toBe(true);
  });

  it('compares full houses by trips first', () => {
    expect(beats('3c 3d 3h 2s 2c', '2d 2h 2s Ac Ad')).toBe(true);
  });

  it('detects exact ties', () => {
    expect(ties('Ac Kd Qh Js 9c', 'Ad Kh Qs Jc 9d')).toBe(true);
  });
});

describe('best of seven', () => {
  it('finds a flush over a straight', () => {
    const result = best('9h Th Jc Qh Kd 2h 3h');
    expect(result.category).toBe(Category.FLUSH);
    expect(result.cards).toHaveLength(5);
  });

  it('picks the best two pair from three pairs', () => {
    expect(best('Ac Ad Kc Kd 2c 2d 7h').score).toEqual([Category.TWO_PAIR, 14, 13, 7]);
  });

  it('rejects invalid input', () => {
    expect(() => evaluateBest(['As', 'Kd'])).toThrow(TypeError);
    expect(() => evaluateBest('As Ks Qs Js Ts 9s 8s 7s'.split(' '))).toThrow(TypeError);
    expect(() => evaluateBest('As As Qs Js Ts'.split(' '))).toThrow(TypeError);
    expect(() => evaluateBest('As Xs Qs Js Ts'.split(' '))).toThrow(TypeError);
  });
});
