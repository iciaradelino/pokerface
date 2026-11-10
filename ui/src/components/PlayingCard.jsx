import './PlayingCard.css';

// Cards are two-character strings from the game service: rank + suit, e.g. "As", "Td", "9h".
const RANK_LABELS = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };
// ︎ asks for the text form, so phones don't draw the suits as emoji.
const SUITS = {
  s: { symbol: '♠︎', name: 'spades', red: false },
  h: { symbol: '♥︎', name: 'hearts', red: true },
  d: { symbol: '♦︎', name: 'diamonds', red: true },
  c: { symbol: '♣︎', name: 'clubs', red: false },
};
const RANK_NAMES = { T: 'Ten', J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' };

export function parseCard(card) {
  if (typeof card !== 'string' || card.length !== 2) return null;
  const [rank, suitCode] = card;
  const suit = SUITS[suitCode];
  if (!suit || !'23456789TJQKA'.includes(rank)) return null;
  return {
    rank: RANK_LABELS[rank] ?? rank,
    suit,
    label: `${RANK_NAMES[rank] ?? rank} of ${suit.name}`,
  };
}

/**
 * A playing card. Without `card` (or with an unknown value) it shows the card back,
 * e.g. for other players' hidden hole cards.
 * size: "sm" | "md" | "lg"
 */
export function PlayingCard({ card, size = 'md', className = '' }) {
  const parsed = parseCard(card);
  const classes = ['playing-card', `playing-card--${size}`, className];

  if (!parsed) {
    return (
      <div
        className={[...classes, 'playing-card--back'].join(' ')}
        role="img"
        aria-label="Hidden card"
      />
    );
  }

  const { rank, suit, label } = parsed;
  return (
    <div
      className={[...classes, suit.red ? 'playing-card--red' : ''].join(' ')}
      role="img"
      aria-label={label}
    >
      <span className="playing-card__rank" aria-hidden="true">
        {rank}
      </span>
      <span className="playing-card__suit" aria-hidden="true">
        {suit.symbol}
      </span>
    </div>
  );
}

/** Empty dashed slot where a board card will appear. */
export function CardSlot({ size = 'md' }) {
  return (
    <div className={`playing-card playing-card--${size} playing-card--slot`} aria-hidden="true" />
  );
}
