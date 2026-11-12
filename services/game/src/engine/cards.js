/**
 * Cards are two-character strings: rank then suit, e.g. "As", "Td", "9h".
 * Ranks: 2-9, T, J, Q, K, A. Suits: c (clubs), d (diamonds), h (hearts), s (spades).
 */
export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push(rank + suit);
  }
  return deck;
}

export function isValidCard(card) {
  return (
    typeof card === 'string' &&
    card.length === 2 &&
    RANKS.includes(card[0]) &&
    SUITS.includes(card[1])
  );
}

/** Numeric rank: 2..14 (ace high). */
export function rankValue(card) {
  return RANKS.indexOf(card[0]) + 2;
}

export function suitOf(card) {
  return card[1];
}

/** Fisher-Yates shuffle. Returns a new array; the input is not modified. */
export function shuffle(cards, randomInt) {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
