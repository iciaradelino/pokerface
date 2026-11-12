import { EngineError, ErrorCode } from './errors.js';
import {
  Phase,
  applyAction,
  applyTimeout,
  legalActions,
  playerLeaves,
  startHand,
  viewHand,
} from './hand.js';

/**
 * A table: seats, stacks and the dealer button across many hands.
 * The game service keeps one table object per game in memory and replaces it with the value
 * each function returns. All functions are pure.
 */

export const DEFAULT_CONFIG = Object.freeze({
  smallBlind: 5,
  bigBlind: 10,
  startingStack: 1000,
  maxSeats: 6,
});

const isPositiveInt = (x) => Number.isInteger(x) && x > 0;

export function createTable(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const valid =
    isPositiveInt(cfg.smallBlind) &&
    isPositiveInt(cfg.bigBlind) &&
    cfg.smallBlind <= cfg.bigBlind &&
    isPositiveInt(cfg.startingStack) &&
    cfg.startingStack >= cfg.bigBlind &&
    Number.isInteger(cfg.maxSeats) &&
    cfg.maxSeats >= 2 &&
    cfg.maxSeats <= 6;
  if (!valid) {
    throw new EngineError(
      ErrorCode.INVALID_CONFIG,
      'Invalid table settings: whole positive blinds (small <= big), a starting stack of at least one big blind, 2 to 6 seats',
    );
  }
  return {
    config: cfg,
    seats: Array(cfg.maxSeats).fill(null),
    buttonSeat: null,
    handNumber: 0,
    hand: null,
    lastResult: null,
  };
}

export function isHandInProgress(table) {
  return table.hand !== null && table.hand.phase !== Phase.COMPLETE;
}

function seatIndexOf(table, playerId) {
  return table.seats.findIndex((s) => s !== null && s.id === playerId);
}

function inCurrentHand(table, playerId) {
  return isHandInProgress(table) && table.hand.players.some((p) => p.id === playerId);
}

/** Seats a player with the starting stack. They are dealt in from the next hand. */
export function sitDown(previous, { id, name }, seatIndex) {
  if (typeof id !== 'string' || id === '') {
    throw new EngineError(ErrorCode.INVALID_CONFIG, 'A player needs a non-empty string id');
  }
  if (seatIndexOf(previous, id) >= 0) {
    throw new EngineError(ErrorCode.ALREADY_SEATED, 'This player is already at the table');
  }
  const table = structuredClone(previous);
  let seat = seatIndex;
  if (seat === undefined) {
    seat = table.seats.indexOf(null);
    if (seat < 0) throw new EngineError(ErrorCode.TABLE_FULL, 'The table is full');
  } else if (!Number.isInteger(seat) || seat < 0 || seat >= table.seats.length) {
    throw new EngineError(ErrorCode.INVALID_CONFIG, 'That seat does not exist');
  } else if (table.seats[seat] !== null) {
    throw new EngineError(ErrorCode.SEAT_TAKEN, 'That seat is taken');
  }
  table.seats[seat] = { id, name: name ?? id, stack: table.config.startingStack, leaving: false };
  return table;
}

/**
 * When a hand ends: copy the final stacks to the seats, free the seats of players who left
 * during the hand, and keep the result for the players service. Safe to call more than once.
 */
function settle(table) {
  const hand = table.hand;
  if (hand === null || hand.phase !== Phase.COMPLETE) return table;
  if (table.lastResult?.handNumber === hand.handNumber) return table;
  for (const p of hand.result.players) {
    const seat = seatIndexOf(table, p.id);
    if (seat >= 0) table.seats[seat].stack = p.endStack;
  }
  table.seats = table.seats.map((s) => (s !== null && s.leaving ? null : s));
  table.lastResult = structuredClone(hand.result);
  return table;
}

/** Removes a player. Mid-hand they fold now and their seat is freed when the hand ends. */
export function standUp(previous, playerId) {
  const seat = seatIndexOf(previous, playerId);
  if (seat < 0) throw new EngineError(ErrorCode.UNKNOWN_PLAYER, 'This player is not at the table');
  const table = structuredClone(previous);
  if (inCurrentHand(table, playerId)) {
    table.hand = playerLeaves(table.hand, playerId);
    table.seats[seat].leaving = true;
    return settle(table);
  }
  table.seats[seat] = null;
  return table;
}

function canPlay(seat) {
  return seat !== null && !seat.leaving && seat.stack > 0;
}

/** Next seat clockwise after `fromSeat` whose player can play (any such seat if null). */
function nextPlayableSeat(table, fromSeat) {
  const count = table.seats.length;
  const start = fromSeat === null ? count - 1 : fromSeat;
  for (let k = 1; k <= count; k++) {
    const seat = (start + k) % count;
    if (canPlay(table.seats[seat])) return seat;
  }
  return null;
}

/**
 * Moves the button and starts the next hand with every seated player who has chips.
 * Players with no chips are skipped (the service may remove them or let them rebuy).
 */
export function startNextHand(previous, options = {}) {
  if (isHandInProgress(previous)) {
    throw new EngineError(ErrorCode.HAND_IN_PROGRESS, 'Finish the current hand first');
  }
  const ready = previous.seats.map((s, i) => (canPlay(s) ? i : -1)).filter((i) => i >= 0);
  if (ready.length < 2) {
    throw new EngineError(
      ErrorCode.NOT_ENOUGH_PLAYERS,
      'At least two players with chips are needed',
    );
  }
  const table = structuredClone(previous);
  table.buttonSeat = nextPlayableSeat(table, table.buttonSeat);
  table.handNumber += 1;
  table.hand = startHand(
    {
      players: ready.map((i) => ({ id: table.seats[i].id, stack: table.seats[i].stack })),
      buttonIndex: ready.indexOf(table.buttonSeat),
      smallBlind: table.config.smallBlind,
      bigBlind: table.config.bigBlind,
      handNumber: table.handNumber,
    },
    options,
  );
  // A hand can end at once, e.g. when the blinds put every player all-in.
  return settle(table);
}

function requireHand(table) {
  if (!isHandInProgress(table)) {
    throw new EngineError(ErrorCode.NO_HAND, 'No hand is being played at this table');
  }
}

/** A player acts. See applyAction in hand.js for the action format. */
export function act(previous, playerId, action) {
  requireHand(previous);
  const table = structuredClone(previous);
  table.hand = applyAction(table.hand, playerId, action);
  return settle(table);
}

/** The turn timer ran out for the player whose turn it is: check if possible, else fold. */
export function actOnTimeout(previous) {
  requireHand(previous);
  const table = structuredClone(previous);
  table.hand = applyTimeout(table.hand);
  return settle(table);
}

export function legalActionsFor(table, playerId) {
  return isHandInProgress(table) ? legalActions(table.hand, playerId) : null;
}

/** Id of the player whose turn it is, or null. Useful for the turn timer. */
export function playerToAct(table) {
  if (!isHandInProgress(table)) return null;
  return table.hand.players[table.hand.toAct].id;
}

/** Everything one viewer may see. Send this (never the table itself) over the WebSocket. */
export function viewTable(table, viewerId = null) {
  const liveStacks = new Map((table.hand?.players ?? []).map((p) => [p.id, p.stack]));
  const live = isHandInProgress(table);
  return {
    config: { ...table.config },
    handNumber: table.handNumber,
    buttonSeat: table.buttonSeat,
    seats: table.seats.map((s) =>
      s === null
        ? null
        : {
            id: s.id,
            name: s.name,
            stack: live && liveStacks.has(s.id) ? liveStacks.get(s.id) : s.stack,
            leaving: s.leaving,
          },
    ),
    hand: table.hand === null ? null : viewHand(table.hand, viewerId),
    lastResult: table.lastResult === null ? null : structuredClone(table.lastResult),
  };
}
