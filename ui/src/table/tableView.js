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
 *
 * The other players fill the spots from your left, in the order they sit after you; empty seats
 * go last. So everyone sees the others in the same clockwise order, and the spot next to you on
 * the right (the last one) stays an empty seat to invite someone, until the table is full.
 */
export function arrangeSeats(seats, maxSeats, myPlayerId) {
  const byIndex = new Map(seats.map((seat) => [seat.seat, seat]));
  const mine = seats.find((seat) => seat.playerId === myPlayerId);
  if (!mine) {
    return Array.from({ length: maxSeats }, (_, spot) => ({
      spot,
      seat: byIndex.get(spot) ?? null,
    }));
  }
  const others = [];
  for (let step = 1; step < maxSeats; step += 1) {
    const seat = byIndex.get((mine.seat + step) % maxSeats);
    if (seat) others.push(seat);
  }
  return Array.from({ length: maxSeats }, (_, spot) => ({
    spot,
    seat: spot === 0 ? mine : (others[spot - 1] ?? null),
  }));
}

const IN_HAND = ['active', 'folded', 'allin'];

/**
 * Who posted the small and big blind this hand, worked out the way the engine does
 * (services/game/src/engine/hand.js): the players in the hand go in seat order; heads-up the
 * dealer posts the small blind, otherwise the next two players after the dealer post them.
 * Returns { smallBlind, bigBlind } as player ids, both null outside a hand.
 */
export function blindPlayers(seats = [], dealer) {
  const inHand = seats
    .filter((seat) => IN_HAND.includes(seat.status))
    .sort((a, b) => a.seat - b.seat);
  const button = inHand.findIndex((seat) => seat.playerId === dealer);
  if (button === -1 || inHand.length < 2) return { smallBlind: null, bigBlind: null };
  const small = inHand.length === 2 ? button : (button + 1) % inHand.length;
  const big = (small + 1) % inHand.length;
  return { smallBlind: inHand[small].playerId, bigBlind: inHand[big].playerId };
}

/**
 * The bets a betting round just swept into the pot: when the same hand moves to its next stage
 * (a new street, or the end of the hand), every bet on the table goes in. Returns
 * [{ playerId, amount }] from the previous "state" message, or [] when nothing moved.
 */
export function sweptBets(previous, next) {
  if (!previous || !next) return [];
  if (previous.handNumber !== next.handNumber || previous.stage === next.stage) return [];
  return previous.seats
    .filter((seat) => seat.bet > 0)
    .map((seat) => ({ playerId: seat.playerId, amount: seat.bet }));
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
