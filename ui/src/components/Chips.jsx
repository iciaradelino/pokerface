import './Chips.css';

const formatter = new Intl.NumberFormat('en-US');

/** 8450 → "8,450". Negative numbers use a real minus sign: −1,200 */
export function formatChips(amount) {
  const n = Math.round(Number(amount) || 0);
  return n < 0 ? `−${formatter.format(-n)}` : formatter.format(n);
}

/** +450 / −1,200, for leaderboard and results */
export function formatDelta(amount) {
  const n = Math.round(Number(amount) || 0);
  return n > 0 ? `+${formatChips(n)}` : formatChips(n);
}

// Chip values, biggest first. Each has its own colour (--chip-<value> in tokens.css).
const DENOMINATIONS = [5000, 1000, 500, 100, 25, 5, 1];
const MAX_COLUMNS = 3;
const MAX_PER_COLUMN = 8;

/**
 * Splits an amount into chips, biggest first: 1,260 → [{ value: 1000, count: 1 },
 * { value: 100, count: 2 }, { value: 25, count: 2 }, { value: 5, count: 2 }].
 */
export function chipBreakdown(amount) {
  let left = Math.max(0, Math.round(Number(amount) || 0));
  const piles = [];
  for (const value of DENOMINATIONS) {
    const count = Math.floor(left / value);
    if (count > 0) piles.push({ value, count });
    left -= count * value;
  }
  return piles;
}

/**
 * The piles to draw: the biggest few values, each a column of at most MAX_PER_COLUMN chips.
 * It is a picture of the amount, not an exact count; the number beside it is exact.
 */
function columnsFor(amount) {
  return chipBreakdown(amount)
    .slice(0, MAX_COLUMNS)
    .map(({ value, count }) => ({ value, count: Math.min(count, MAX_PER_COLUMN) }));
}

/** One chip seen from above, e.g. in the top bar. */
export function Chip({ value = 5, size = 24 }) {
  return (
    <span
      className={`chip chip--flat chip--v${value}`}
      style={{ '--chip-w': `${size}px` }}
      aria-hidden="true"
    />
  );
}

/** Columns of stacked chips for an amount. Decorative: pair it with the number. */
export function ChipStack({ amount, size = 22 }) {
  const columns = columnsFor(amount);
  if (!columns.length) return null;
  return (
    <span className="chip-stack" style={{ '--chip-w': `${size}px` }} aria-hidden="true">
      {columns.map(({ value, count }) => (
        <span key={value} className="chip-stack__column" style={{ '--count': count }}>
          {Array.from({ length: count }, (_, i) => (
            // Keyed by place, so when a bet grows only the new chips drop in
            <span key={i} className={`chip chip--v${value}`} style={{ '--i': i }} />
          ))}
        </span>
      ))}
    </span>
  );
}

/** Stacked chips with the amount beside them, e.g. a bet in front of a seat or the pot. */
export function ChipAmount({ amount, label, size }) {
  return (
    <span className="chip-amount">
      <ChipStack amount={amount} size={size} />
      <span className="chip-amount__text tabular">
        {label ? `${label} ` : ''}
        {formatChips(amount)}
      </span>
    </span>
  );
}

const BLINDS = {
  small: { letter: 'S', label: 'Small blind' },
  big: { letter: 'B', label: 'Big blind' },
};

/** "S" or "B" coin, like the dealer button, for the small and big blind. kind: "small" | "big" */
export function BlindButton({ kind }) {
  const { letter, label } = BLINDS[kind];
  return (
    <span
      className={`dealer-button blind-button blind-button--${kind}`}
      role="img"
      aria-label={label}
    >
      {letter}
    </span>
  );
}

/** Yellow "D" dealer button. */
export function DealerButton() {
  return (
    <span className="dealer-button" role="img" aria-label="Dealer">
      D
    </span>
  );
}
