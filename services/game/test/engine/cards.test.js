import { describe, expect, it } from 'vitest';
import {
  createDeck,
  isValidCard,
  rankValue,
  shuffle,
} from '../../src/engine/cards.js';
import { secureRandomInt, seededRandomInt } from '../../src/engine/random.js';

describe('cards', () => {
  it('creates 52 distinct valid cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
    expect(deck.every(isValidCard)).toBe(true);
  });

  it('rejects malformed cards', () => {
    for (const bad of ['', 'A', 'Ax', '1s', 'AsK', 10, null]) expect(isValidCard(bad)).toBe(false);
  });

  it('ranks aces high and twos low', () => {
    expect(rankValue('As')).toBe(14);
    expect(rankValue('Td')).toBe(10);
    expect(rankValue('2c')).toBe(2);
  });

  it('shuffles into a permutation without touching the input', () => {
    const deck = createDeck();
    const shuffled = shuffle(deck, seededRandomInt(1));
    expect(shuffled).not.toEqual(deck);
    expect([...shuffled].sort()).toEqual([...deck].sort());
    expect(deck).toEqual(createDeck());
  });

  it('is reproducible with the same seed and differs with another', () => {
    const a = shuffle(createDeck(), seededRandomInt(42));
    const b = shuffle(createDeck(), seededRandomInt(42));
    const c = shuffle(createDeck(), seededRandomInt(43));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('random generators stay within range', () => {
    const seeded = seededRandomInt(7);
    for (let i = 0; i < 1000; i++) {
      const s = seeded(10);
      const r = secureRandomInt(10);
      expect(s >= 0 && s < 10 && Number.isInteger(s)).toBe(true);
      expect(r >= 0 && r < 10 && Number.isInteger(r)).toBe(true);
    }
  });
});
