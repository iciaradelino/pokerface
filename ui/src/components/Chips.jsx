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

/** Pink chip with an amount, e.g. a bet in front of a seat or the pot. */
export function ChipAmount({ amount, label }) {
  return (
    <span className="chip-amount">
      <span className="chip-amount__chip" aria-hidden="true" />
      <span className="tabular">
        {label ? `${label} ` : ''}
        {formatChips(amount)}
      </span>
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
