import { createDeck, isValidCard, shuffle } from './cards.js';
import { evaluateBest } from './evaluator.js';
import { awardPots, buildPots } from './pots.js';
import { secureRandomInt } from './random.js';
import { EngineError, ErrorCode } from './errors.js';

/**
 * One hand of No-Limit Texas Hold'em.
 *
 * Every exported function is pure: it never modifies the state it receives and returns a new
 * one. The state contains the deck and every player's hole cards, so it must never be sent
 * to a client as is: send `viewHand(state, playerId)` instead.
 */

export const Phase = Object.freeze({
  PREFLOP: 'preflop',
  FLOP: 'flop',
  TURN: 'turn',
  RIVER: 'river',
  COMPLETE: 'complete',
});

export const ActionType = Object.freeze({
  FOLD: 'fold',
  CHECK: 'check',
  CALL: 'call',
  RAISE: 'raise',
  ALL_IN: 'allIn',
});

const NEXT_STREET = { preflop: 'flop', flop: 'turn', turn: 'river' };
const CARDS_DEALT = { flop: 3, turn: 1, river: 1 };
const MAX_PLAYERS = 10;

const isPositiveInt = (x) => Number.isInteger(x) && x > 0;
const total = (players, key) => players.reduce((sum, p) => sum + p[key], 0);

// ---------------------------------------------------------------------------------------------
// Starting a hand
// ---------------------------------------------------------------------------------------------

function validateStart({ players, buttonIndex, smallBlind, bigBlind }, deck) {
  const fail = (message) => {
    throw new EngineError(ErrorCode.INVALID_CONFIG, message);
  };
  if (!Array.isArray(players) || players.length < 2 || players.length > MAX_PLAYERS) {
    fail(`A hand needs between 2 and ${MAX_PLAYERS} players`);
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) fail('Player ids must be unique');
  if (!players.every((p) => typeof p.id === 'string' && p.id && isPositiveInt(p.stack))) {
    fail('Every player needs a string id and a positive whole-chip stack');
  }
  if (!Number.isInteger(buttonIndex) || buttonIndex < 0 || buttonIndex >= players.length) {
    fail('buttonIndex must point at a player');
  }
  if (!isPositiveInt(smallBlind) || !isPositiveInt(bigBlind) || smallBlind > bigBlind) {
    fail('Blinds must be positive whole numbers with smallBlind <= bigBlind');
  }
  if (deck !== undefined) {
    const valid = Array.isArray(deck) && deck.length === 52 && deck.every(isValidCard);
    if (!valid || new Set(deck).size !== 52) fail('A fixed deck must contain all 52 cards once');
  }
}

/** Moves chips from a player's stack into the pot for the current street. */
function putChips(player, amount) {
  player.stack -= amount;
  player.streetBet += amount;
  player.totalBet += amount;
  if (player.stack === 0) player.allIn = true;
}

function postBlind(state, index, blind, type) {
  const player = state.players[index];
  const amount = Math.min(blind, player.stack);
  putChips(player, amount);
  state.actions.push({
    playerId: player.id,
    type,
    amount,
    to: player.streetBet,
    phase: state.phase,
  });
}

/**
 * Starts a hand: posts blinds, deals hole cards and finds the first player to act.
 *
 * @param {object} params
 * @param {{id: string, stack: number}[]} params.players players dealt in, in seat order
 * @param {number} params.buttonIndex index in `players` of the dealer button
 * @param {number} params.smallBlind
 * @param {number} params.bigBlind
 * @param {number} [params.handNumber]
 * @param {object} [options]
 * @param {(max: number) => number} [options.randomInt] shuffle source (default: crypto)
 * @param {string[]} [options.deck] a fixed 52-card deck, top card first (tests only)
 */
export function startHand(params, options = {}) {
  validateStart(params, options.deck);
  const { players, buttonIndex, smallBlind, bigBlind, handNumber = 1 } = params;
  const count = players.length;
  const deck = options.deck
    ? [...options.deck]
    : shuffle(createDeck(), options.randomInt ?? secureRandomInt);

  const state = {
    handNumber,
    phase: Phase.PREFLOP,
    smallBlind,
    bigBlind,
    buttonIndex,
    deck,
    board: [],
    players: players.map((p) => ({
      id: p.id,
      startStack: p.stack,
      stack: p.stack,
      holeCards: [],
      streetBet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      hasActed: false,
      actedAtRaise: -1,
    })),
    currentBet: 0,
    lastRaiseSize: bigBlind,
    fullRaiseCount: 0,
    toAct: null,
    actions: [],
    result: null,
  };

  // Heads-up the button posts the small blind; otherwise the player to its left does.
  const sbIndex = count === 2 ? buttonIndex : (buttonIndex + 1) % count;
  const bbIndex = (sbIndex + 1) % count;
  state.sbIndex = sbIndex;
  state.bbIndex = bbIndex;
  postBlind(state, sbIndex, smallBlind, 'smallBlind');
  postBlind(state, bbIndex, bigBlind, 'bigBlind');
  // Callers owe the full big blind even if the big blind could not post all of it.
  state.currentBet = bigBlind;

  // Two rounds of one card each, starting left of the button.
  for (let round = 0; round < 2; round++) {
    for (let k = 1; k <= count; k++) {
      state.players[(buttonIndex + k) % count].holeCards.push(state.deck.shift());
    }
  }

  return progress(state, bbIndex);
}

// ---------------------------------------------------------------------------------------------
// Turn order and street progression
// ---------------------------------------------------------------------------------------------

const canBet = (p) => !p.folded && !p.allIn;

function needsToAct(state, player) {
  return canBet(player) && (!player.hasActed || player.streetBet < state.currentBet);
}

/** Next player (clockwise after `fromIndex`) who must act, or null if the round is over. */
function findNextToAct(state, fromIndex) {
  const active = state.players.filter(canBet);
  if (active.length === 0) return null;
  // Nobody left to bet against: a lone player who has matched the bet has nothing to decide.
  if (active.length === 1 && active[0].streetBet >= state.currentBet) return null;
  const count = state.players.length;
  for (let k = 1; k <= count; k++) {
    const index = (fromIndex + k) % count;
    if (needsToAct(state, state.players[index])) return index;
  }
  return null;
}

/** Called after anything that changes the hand: decides who acts next or what happens next. */
function progress(state, fromIndex) {
  const live = state.players.filter((p) => !p.folded);
  if (live.length === 1) return finishWithoutShowdown(state, live[0]);
  const next = findNextToAct(state, fromIndex);
  if (next !== null) {
    state.toAct = next;
    return state;
  }
  return advanceStreet(state);
}

function advanceStreet(state) {
  for (const p of state.players) {
    p.streetBet = 0;
    p.hasActed = false;
    p.actedAtRaise = -1;
  }
  state.currentBet = 0;
  state.lastRaiseSize = state.bigBlind;
  state.fullRaiseCount = 0;
  state.toAct = null;

  if (state.phase === Phase.RIVER) return showdown(state);

  state.phase = NEXT_STREET[state.phase];
  state.deck.shift(); // burn card
  state.board.push(...state.deck.splice(0, CARDS_DEALT[state.phase]));

  // With fewer than two players able to bet, deal the rest of the board without betting.
  if (state.players.filter(canBet).length < 2) return advanceStreet(state);
  state.toAct = findNextToAct(state, state.buttonIndex);
  return state;
}

/** Player ids clockwise, starting with the first seat left of the button. */
function seatOrderFromButton(state) {
  const count = state.players.length;
  return Array.from(
    { length: count },
    (_, k) => state.players[(state.buttonIndex + 1 + k) % count].id,
  );
}

// ---------------------------------------------------------------------------------------------
// Ending a hand
// ---------------------------------------------------------------------------------------------

function completeHand(state, awarded, evaluations) {
  const payout = {};
  const wonContested = new Set();
  for (const pot of awarded) {
    for (const w of pot.winners) {
      payout[w.id] = (payout[w.id] ?? 0) + w.amount;
      if (pot.contributors.length > 1) wonContested.add(w.id);
    }
  }
  for (const p of state.players) p.stack += payout[p.id] ?? 0;

  const showdownReached = evaluations !== null;
  const revealed = {};
  const hands = {};
  if (showdownReached) {
    for (const [id, evaluation] of Object.entries(evaluations)) {
      revealed[id] = [...state.players.find((p) => p.id === id).holeCards];
      hands[id] = { name: evaluation.name, cards: evaluation.cards };
    }
  }

  state.result = {
    handNumber: state.handNumber,
    showdown: showdownReached,
    board: [...state.board],
    pots: awarded.map((pot) => ({
      amount: pot.amount,
      eligible: pot.eligible,
      winners: pot.winners.map((w) => ({ ...w, handName: hands[w.id]?.name ?? null })),
    })),
    revealed,
    hands,
    players: state.players.map((p) => ({
      id: p.id,
      startStack: p.startStack,
      endStack: p.stack,
      net: p.stack - p.startStack,
      won: wonContested.has(p.id),
    })),
  };
  state.phase = Phase.COMPLETE;
  state.toAct = null;
  return state;
}

function finishWithoutShowdown(state, winner) {
  const pot = {
    amount: total(state.players, 'totalBet'),
    eligible: [winner.id],
    contributors: state.players.filter((p) => p.totalBet > 0).map((p) => p.id),
  };
  return completeHand(state, awardPots([pot], {}, seatOrderFromButton(state)), null);
}

function showdown(state) {
  const evaluations = {};
  const scores = {};
  for (const p of state.players.filter((q) => !q.folded)) {
    evaluations[p.id] = evaluateBest([...p.holeCards, ...state.board]);
    scores[p.id] = evaluations[p.id].score;
  }
  const pots = buildPots(
    state.players.map((p) => ({ id: p.id, amount: p.totalBet, folded: p.folded })),
  );
  return completeHand(state, awardPots(pots, scores, seatOrderFromButton(state)), evaluations);
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

function computeLegal(state, index) {
  const player = state.players[index];
  const owed = Math.max(0, state.currentBet - player.streetBet);
  const othersCanRespond = state.players.some((p, i) => i !== index && canBet(p));
  // After an all-in that is smaller than a full raise, players who already acted may only
  // call or fold: betting is reopened for them only by a full raise.
  const reopened = !player.hasActed || player.actedAtRaise < state.fullRaiseCount;
  const canRaise = reopened && othersCanRespond && player.stack > owed;
  const maxRaiseTo = player.streetBet + player.stack;
  return {
    toCall: Math.min(owed, player.stack),
    canCheck: owed === 0,
    canCall: owed > 0,
    canRaise,
    minRaiseTo: canRaise ? Math.min(state.currentBet + state.lastRaiseSize, maxRaiseTo) : null,
    maxRaiseTo: canRaise ? maxRaiseTo : null,
    canAllIn: player.stack > 0 && (player.stack <= owed || canRaise),
    allInTo: maxRaiseTo,
  };
}

function findPlayerIndex(state, playerId) {
  const index = state.players.findIndex((p) => p.id === playerId);
  if (index < 0) throw new EngineError(ErrorCode.UNKNOWN_PLAYER, 'That player is not in this hand');
  return index;
}

/**
 * What the player may do right now, or null if it is not their turn.
 * `actions` lists the allowed action types; amounts are "raise to" totals for this street.
 */
export function legalActions(state, playerId) {
  const index = state.players.findIndex((p) => p.id === playerId);
  if (state.phase === Phase.COMPLETE || index < 0 || index !== state.toAct) return null;
  const legal = computeLegal(state, index);
  const actions = [ActionType.FOLD];
  if (legal.canCheck) actions.push(ActionType.CHECK);
  if (legal.canCall) actions.push(ActionType.CALL);
  if (legal.canRaise) actions.push(ActionType.RAISE);
  if (legal.canAllIn) actions.push(ActionType.ALL_IN);
  return {
    actions,
    toCall: legal.toCall,
    minRaiseTo: legal.minRaiseTo,
    maxRaiseTo: legal.maxRaiseTo,
    allInTo: legal.allInTo,
  };
}

function raiseTo(state, player, amount) {
  const raiseSize = amount - state.currentBet;
  putChips(player, amount - player.streetBet);
  if (raiseSize >= state.lastRaiseSize) {
    state.lastRaiseSize = raiseSize;
    state.fullRaiseCount += 1;
  }
  state.currentBet = amount;
}

/**
 * Applies a player's action and returns the new state.
 *
 * @param {object} action one of:
 *   { type: 'fold' } | { type: 'check' } | { type: 'call' } | { type: 'allIn' }
 *   | { type: 'raise', amount }  amount = total bet for this street ("raise to"); also used
 *                                for the first bet of a street
 */
export function applyAction(previous, playerId, action) {
  if (previous.phase === Phase.COMPLETE) {
    throw new EngineError(ErrorCode.HAND_OVER, 'This hand is already over');
  }
  const state = structuredClone(previous);
  const index = findPlayerIndex(state, playerId);
  if (index !== state.toAct) throw new EngineError(ErrorCode.NOT_YOUR_TURN, 'It is not your turn');

  const player = state.players[index];
  const legal = computeLegal(state, index);
  const illegal = (message) => {
    throw new EngineError(ErrorCode.ILLEGAL_ACTION, message);
  };
  const before = player.totalBet;
  const type = action?.type;

  switch (type) {
    case ActionType.FOLD:
      player.folded = true;
      break;
    case ActionType.CHECK:
      if (!legal.canCheck) illegal('You cannot check: there is a bet to call');
      break;
    case ActionType.CALL:
      if (!legal.canCall) illegal('There is nothing to call: check instead');
      putChips(player, legal.toCall);
      break;
    case ActionType.RAISE: {
      if (!legal.canRaise) illegal('You cannot raise now');
      const amount = action.amount;
      if (!Number.isInteger(amount) || amount < legal.minRaiseTo || amount > legal.maxRaiseTo) {
        throw new EngineError(
          ErrorCode.INVALID_AMOUNT,
          `Raise to a whole amount between ${legal.minRaiseTo} and ${legal.maxRaiseTo}`,
        );
      }
      raiseTo(state, player, amount);
      break;
    }
    case ActionType.ALL_IN:
      if (!legal.canAllIn) illegal('You cannot go all-in now');
      if (player.stack <= legal.toCall) putChips(player, player.stack);
      else raiseTo(state, player, legal.allInTo);
      break;
    default:
      throw new EngineError(ErrorCode.INVALID_ACTION, `Unknown action: ${String(type)}`);
  }

  player.hasActed = true;
  player.actedAtRaise = state.fullRaiseCount;
  state.actions.push({
    playerId,
    type,
    amount: player.totalBet - before,
    to: player.streetBet,
    phase: state.phase,
  });
  return progress(state, index);
}

/** What happens when the turn timer runs out: check if possible, otherwise fold. */
export function timeoutAction(state) {
  if (state.phase === Phase.COMPLETE || state.toAct === null) return null;
  return computeLegal(state, state.toAct).canCheck
    ? { type: ActionType.CHECK }
    : { type: ActionType.FOLD };
}

/** Applies the timeout action for the player whose turn it is. */
export function applyTimeout(state) {
  const action = timeoutAction(state);
  if (action === null) throw new EngineError(ErrorCode.HAND_OVER, 'This hand is already over');
  return applyAction(state, state.players[state.toAct].id, action);
}

/**
 * A player disconnects or leaves mid-hand: they fold, even out of turn.
 * An all-in player stays in: their chips are committed and they can still win.
 */
export function playerLeaves(previous, playerId) {
  if (previous.phase === Phase.COMPLETE) return previous;
  const state = structuredClone(previous);
  const index = findPlayerIndex(state, playerId);
  const player = state.players[index];
  if (player.folded || player.allIn) return state;
  player.folded = true;
  state.actions.push({
    playerId,
    type: 'leave',
    amount: 0,
    to: player.streetBet,
    phase: state.phase,
  });
  // Re-check from just before the current turn: the same player keeps the turn if they still
  // need to act, otherwise the turn moves on (or the round or hand ends).
  const count = state.players.length;
  return progress(state, (state.toAct - 1 + count) % count);
}

// ---------------------------------------------------------------------------------------------
// What a client may see
// ---------------------------------------------------------------------------------------------

/**
 * The hand as seen by one player (or by a spectator if `viewerId` is null).
 * Contains the viewer's own hole cards, cards revealed at showdown, and nothing else private:
 * no deck, no other hole cards, not even the cards of folded players.
 */
export function viewHand(state, viewerId = null) {
  const revealed = state.result?.revealed ?? {};
  return {
    handNumber: state.handNumber,
    phase: state.phase,
    board: [...state.board],
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    buttonId: state.players[state.buttonIndex].id,
    toAct: state.toAct === null ? null : state.players[state.toAct].id,
    currentBet: state.currentBet,
    pot: total(state.players, 'totalBet'),
    players: state.players.map((p) => {
      let holeCards = null;
      if (p.id === viewerId) holeCards = [...p.holeCards];
      else if (revealed[p.id]) holeCards = [...revealed[p.id]];
      return {
        id: p.id,
        stack: p.stack,
        streetBet: p.streetBet,
        totalBet: p.totalBet,
        folded: p.folded,
        allIn: p.allIn,
        holeCards,
      };
    }),
    actions: state.actions.map((a) => ({ ...a })),
    legalActions: viewerId === null ? null : legalActions(state, viewerId),
    result: state.result === null ? null : structuredClone(state.result),
  };
}
