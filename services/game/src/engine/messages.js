import { EngineError, ErrorCode } from './errors.js';
import { ActionType, Phase, legalActions } from './hand.js';
import { isHandInProgress } from './table.js';

/**
 * Translates between the engine and the formats agreed in plan.md §6.
 * The engine stays as it is; only this file knows the names used on the wire.
 *
 *   toEngineAction(body)              HTTP action body  -> engine action
 *   publicState(table, options)       table             -> WebSocket "state" (same for everyone)
 *   privateState(table, playerId)     table             -> WebSocket "private" (one per player)
 *   handResults(table, tableId)       finished hand     -> POST /players/:id/results bodies
 *   httpStatusFor(error)              engine error      -> HTTP status code
 */

/** Action names in §6 and the engine's names for them. */
const ACTION_NAMES = Object.freeze({
  fold: ActionType.FOLD,
  check: ActionType.CHECK,
  call: ActionType.CALL,
  raise: ActionType.RAISE,
  allin: ActionType.ALL_IN,
});

const WIRE_NAME = Object.freeze(
  Object.fromEntries(Object.entries(ACTION_NAMES).map(([wire, engine]) => [engine, wire])),
);

/**
 * Converts the body of `POST /tables/:id/actions` to an engine action.
 *
 * @param {{ action: string, amount?: number }} body
 *   `amount` is only used for "raise" and means the player's TOTAL bet on this street after the
 *   raise ("raise to"), not the chips added. If the current bet is 20 and I raise to 60, amount
 *   is 60.
 */
export function toEngineAction(body) {
  const type = ACTION_NAMES[body?.action];
  if (type === undefined) {
    throw new EngineError(
      ErrorCode.INVALID_ACTION,
      `Unknown action: use one of ${Object.keys(ACTION_NAMES).join(', ')}`,
    );
  }
  return type === ActionType.RAISE ? { type, amount: body.amount } : { type };
}

/** Engine error code -> HTTP status: 400 for a malformed request, 409 for a rule violation. */
export function httpStatusFor(error) {
  switch (error?.code) {
    case ErrorCode.INVALID_ACTION:
    case ErrorCode.INVALID_AMOUNT:
    case ErrorCode.INVALID_CONFIG:
      return 400;
    case ErrorCode.UNKNOWN_PLAYER:
      return 404;
    case undefined:
      return 500;
    default:
      return 409;
  }
}

function seatStatus(table, seat) {
  const player = table.hand?.players.find((p) => p.id === seat.id);
  if (!isHandInProgress(table) || player === undefined) {
    return seat.stack > 0 ? 'waiting' : 'out';
  }
  if (player.folded) return 'folded';
  if (player.allIn) return 'allin';
  return 'active';
}

/**
 * Main pot and side pots of the chips bet so far, each with who can still win it.
 *
 * During betting, only all-in players limit what can be won: a player who has not bet yet can
 * still call, so they are eligible for everything. Side pots therefore split only at all-in
 * amounts. (At showdown the engine's own result is used instead.)
 */
function livePots(hand) {
  const inHand = hand.players.filter((p) => !p.folded);
  const caps = [...new Set(inHand.filter((p) => p.allIn).map((p) => p.totalBet))].sort(
    (a, b) => a - b,
  );
  const pots = [];
  let previous = 0;
  for (const level of [...caps, Infinity]) {
    const amount = hand.players.reduce(
      (sum, p) => sum + Math.min(p.totalBet, level) - Math.min(p.totalBet, previous),
      0,
    );
    const eligible = inHand.filter((p) => !p.allIn || p.totalBet >= level).map((p) => p.id);
    previous = level;
    if (amount === 0) continue;
    const last = pots.at(-1);
    if (last && (eligible.length === 0 || eligible.length === last.eligible.length)) {
      last.amount += amount;
    } else {
      pots.push({ amount, eligible });
    }
  }
  return pots;
}

function publicResult(result) {
  return {
    handNumber: result.handNumber,
    showdown: result.showdown,
    winners: result.pots.flatMap((pot) =>
      pot.winners.map((w) => ({ playerId: w.id, amount: w.amount, handName: w.handName })),
    ),
    revealed: structuredClone(result.revealed),
  };
}

/**
 * The WebSocket "state" message, identical for every player. It never contains hole cards,
 * except the ones revealed at showdown (in `result.revealed`).
 *
 * @param {object} table engine table
 * @param {{ timerEndsAt?: string | null }} [options] when the current turn times out (ISO time),
 *   set by the game service's turn timer
 */
export function publicState(table, { timerEndsAt = null } = {}) {
  const hand = table.hand;
  const live = isHandInProgress(table);
  const handPlayers = new Map((hand?.players ?? []).map((p) => [p.id, p]));

  let pots = [];
  if (hand !== null) {
    pots = live
      ? livePots(hand)
      : hand.result.pots.map((pot) => ({ amount: pot.amount, eligible: pot.eligible }));
  }

  return {
    type: 'state',
    handNumber: table.handNumber,
    stage: hand === null ? 'waiting' : hand.phase,
    board: hand === null ? [] : [...hand.board],
    pots,
    dealer: hand === null ? null : hand.players[hand.buttonIndex].id,
    currentPlayer: live ? hand.players[hand.toAct].id : null,
    timerEndsAt: live ? timerEndsAt : null,
    seats: table.seats.flatMap((seat, index) => {
      if (seat === null) return [];
      const player = live ? handPlayers.get(seat.id) : undefined;
      return [
        {
          seat: index,
          playerId: seat.id,
          name: seat.name,
          stack: player ? player.stack : seat.stack,
          bet: player ? player.streetBet : 0,
          status: seatStatus(table, seat),
        },
      ];
    }),
    result: hand !== null && hand.phase === Phase.COMPLETE ? publicResult(hand.result) : null,
  };
}

/**
 * The WebSocket "private" message for one player: their own cards and, on their turn, what they
 * may do. `minRaise` and `maxRaise` are "raise to" amounts (see toEngineAction).
 */
export function privateState(table, playerId) {
  const player = table.hand?.players.find((p) => p.id === playerId);
  const legal = isHandInProgress(table) ? legalActions(table.hand, playerId) : null;
  return {
    type: 'private',
    playerId,
    holeCards: player ? [...player.holeCards] : [],
    legalActions: legal ? legal.actions.map((a) => WIRE_NAME[a]) : [],
    toCall: legal ? legal.toCall : 0,
    minRaise: legal ? legal.minRaiseTo : null,
    maxRaise: legal ? legal.maxRaiseTo : null,
  };
}

/**
 * After a hand: one `POST /players/:id/results` body per player who was dealt in.
 * `handId` is unique per table and hand, so the players service can ignore a retried result.
 *
 * @returns {{ playerId: string, body: { handId: string, delta: number } }[]}
 */
export function handResults(table, tableId) {
  const result = table.lastResult;
  if (result === null) return [];
  const handId = `${tableId}-${result.handNumber}`;
  return result.players.map((p) => ({ playerId: p.id, body: { handId, delta: p.net } }));
}
