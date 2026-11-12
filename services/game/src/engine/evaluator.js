import { isValidCard, rankValue, suitOf } from './cards.js';

export const Category = Object.freeze({
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
});

const CATEGORY_NAMES = [
  'High Card',
  'Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
];

/** Highest card of a straight in these values, or 0. The wheel (A-2-3-4-5) counts as 5-high. */
function straightHigh(values) {
  const present = new Set(values);
  if (present.has(14)) present.add(1);
  for (let high = 14; high >= 5; high--) {
    let complete = true;
    for (let v = high; v > high - 5; v--) {
      if (!present.has(v)) {
        complete = false;
        break;
      }
    }
    if (complete) return high;
  }
  return 0;
}

/**
 * Evaluates exactly five cards.
 * `score` is [category, ...tiebreakers]; a higher score (compared left to right) is a better hand.
 */
export function evaluateFive(cards) {
  const values = cards.map(rankValue).sort((a, b) => b - a);
  const isFlush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const high = straightHigh(values);

  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  // Groups ordered by size, then by rank: e.g. full house KKK77 -> [13, 7].
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const grouped = groups.map(([value]) => value);
  const [first, second] = groups.map(([, count]) => count);

  let category;
  let tiebreak;
  if (isFlush && high) {
    category = Category.STRAIGHT_FLUSH;
    tiebreak = [high];
  } else if (first === 4) {
    category = Category.FOUR_OF_A_KIND;
    tiebreak = grouped;
  } else if (first === 3 && second === 2) {
    category = Category.FULL_HOUSE;
    tiebreak = grouped;
  } else if (isFlush) {
    category = Category.FLUSH;
    tiebreak = values;
  } else if (high) {
    category = Category.STRAIGHT;
    tiebreak = [high];
  } else if (first === 3) {
    category = Category.THREE_OF_A_KIND;
    tiebreak = grouped;
  } else if (first === 2 && second === 2) {
    category = Category.TWO_PAIR;
    tiebreak = grouped;
  } else if (first === 2) {
    category = Category.PAIR;
    tiebreak = grouped;
  } else {
    category = Category.HIGH_CARD;
    tiebreak = values;
  }

  return {
    category,
    name: CATEGORY_NAMES[category],
    score: [category, ...tiebreak],
    cards: [...cards],
  };
}

/** Negative if a < b, 0 if equal, positive if a > b. */
export function compareScores(a, b) {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function* combinations(items, size, start = 0, picked = []) {
  if (picked.length === size) {
    yield [...picked];
    return;
  }
  for (let i = start; i <= items.length - (size - picked.length); i++) {
    picked.push(items[i]);
    yield* combinations(items, size, i + 1, picked);
    picked.pop();
  }
}

/** Best five-card hand from 5 to 7 cards (hole cards + board). */
export function evaluateBest(cards) {
  if (!Array.isArray(cards) || cards.length < 5 || cards.length > 7) {
    throw new TypeError('evaluateBest needs between 5 and 7 cards');
  }
  if (!cards.every(isValidCard) || new Set(cards).size !== cards.length) {
    throw new TypeError('evaluateBest needs valid, distinct cards');
  }
  let best = null;
  for (const five of combinations(cards, 5)) {
    const result = evaluateFive(five);
    if (best === null || compareScores(result.score, best.score) > 0) best = result;
  }
  return best;
}
