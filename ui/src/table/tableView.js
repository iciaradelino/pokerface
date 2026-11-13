// Pure helpers for the table screen. Message shapes come from
// services/game/src/engine/messages.js (publicState and privateState).

export const STAGE_LABELS = {
  waiting: 'Waiting for the next hand',
  preflop: 'Pre-flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  complete: 'Showdown',
};

/**
 * Puts every seat at a spot around the table, turned so that you sit at the bottom.
 * Returns maxSeats entries: { spot, seat } where spot 0 is the bottom centre and the others
 * go clockwise, and seat is the "state" seat (or null when it is empty).
 */
export function arrangeSeats(seats, maxSeats, myPlayerId) {
  const byIndex = new Map(seats.map((seat) => [seat.seat, seat]));
  const mine = seats.find((seat) => seat.playerId === myPlayerId);
  const offset = mine ? mine.seat : 0;
  return Array.from({ length: maxSeats }, (_, spot) => ({
    spot,
    seat: byIndex.get((spot + offset) % maxSeats) ?? null,
  }));
}

/** Total chips in all pots. */
export function potTotal(pots = []) {
  return pots.reduce((sum, pot) => sum + pot.amount, 0);
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * "Raise to" amount for the ½ Pot / Pot / 2× Pot buttons.
 * After calling, the pot is pot + toCall; a pot-sized raise adds that much on top of the call.
 * Always kept within the server's limits (minRaise and maxRaise are "raise to" amounts).
 */
export function potRaise(fraction, { pot, toCall, myBet, minRaise, maxRaise }) {
  const callTo = myBet + toCall;
  const target = Math.round(callTo + fraction * (pot + toCall));
  return clamp(target, minRaise, maxRaise);
}

/** Whole seconds left on the turn timer, never below 0. null when there is no timer. */
export function secondsLeft(timerEndsAt, now = Date.now()) {
  if (!timerEndsAt) return null;
  const ms = new Date(timerEndsAt).getTime() - now;
  return Number.isNaN(ms) ? null : Math.max(0, Math.ceil(ms / 1000));
}

/** 14 → "0:14", 75 → "1:15" */
export function formatClock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Short line under a seat: "Your turn", "Folded", "All-in", "Out". Empty when nothing to say. */
export function seatNote(seat, { currentPlayer, myPlayerId }) {
  if (seat.playerId === currentPlayer)
    return seat.playerId === myPlayerId ? 'Your turn' : 'Thinking…';
  if (seat.status === 'folded') return 'Folded';
  if (seat.status === 'allin') return 'All-in';
  if (seat.status === 'out') return 'Out of chips';
  return '';
}
