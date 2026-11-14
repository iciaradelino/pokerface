import { randomUUID } from 'node:crypto';
import {
  act,
  actOnTimeout,
  isHandInProgress,
  playerToAct,
  privateState,
  publicState,
  sitDown,
  standUp,
  startNextHand,
  toEngineAction,
} from './engine/index.js';
import { restoreEngineTable } from './engineRestore.js';

export const HAND_PAUSE_MS = 5000;
export const SAVE_RETRY_MS = 3000;
export const TURN_MS = 120_000;

/**
 * The tables being played, kept in memory with their poker engine state (max 1 replica, so one
 * process owns every table). The database stays the source of truth for tables, seats, stacks
 * and finished hands; a hand in progress only lives here.
 *
 * Every change to a table goes through its own queue, so a join, a leave or the start of a hand
 * never interleaves with a hand being saved. Different tables never wait for each other.
 *
 * Statuses returned to the routes:
 *   join:   'joined' | 'already_seated' | 'full' | 'not_found'   (+ seatIndex)
 *   leave:  'left' | 'leaving' (at the end of the current hand) | 'not_seated' | 'not_found'
 *   remove: 'deleted' | 'hand_in_progress' | 'not_found'
 *   act:    'ok' (+ state, private) | 'not_found'; a rule violation throws the engine's EngineError
 *
 * Each player has `turnMs` to act. When the time runs out the engine checks for them if it can,
 * otherwise folds them, so a player who walks away never blocks the table.
 */
export function createLiveTables({
  tables,
  handPauseMs = HAND_PAUSE_MS,
  saveRetryMs = SAVE_RETRY_MS,
  turnMs = TURN_MS,
  generateHandId = randomUUID,
  dealOptions = () => ({}),
  onChange = () => {},
  logger = console.log,
}) {
  const live = new Map(); // table id -> entry
  const queues = new Map(); // table id -> tail of its queue

  function run(id, work) {
    const result = (queues.get(id) ?? Promise.resolve()).then(work);
    const tail = result.catch(() => {});
    queues.set(id, tail);
    tail.then(() => {
      if (queues.get(id) === tail) queues.delete(id);
    });
    return result;
  }

  const log = (event, fields) => logger(JSON.stringify({ level: 'info', event, ...fields }));
  const isCurrent = (entry) => live.get(entry.id) === entry;
  const playable = (game) =>
    game.seats.filter((seat) => seat !== null && !seat.leaving && seat.stack > 0).length;
  const unsaved = (entry) => (entry.game.lastResult?.handNumber ?? 0) > entry.savedHandNumber;

  // Loads a table into memory the first time it is used. Returns null if it does not exist.
  async function load(id) {
    if (live.has(id)) return live.get(id);
    const stored = await tables.getTable(id);
    if (!stored) return null;
    const lastHandNumber = await tables.getLastHandNumber(id);
    const entry = {
      id,
      paused: stored.paused,
      game: restoreEngineTable(stored, lastHandNumber),
      savedHandNumber: lastHandNumber,
      pendingHandId: null,
      nextHandTimer: null,
      retryTimer: null,
      turn: null, // { handNumber, playerId, endsAt, timer } for the player whose turn it is
    };
    live.set(id, entry);
    scheduleNextHand(entry);
    return entry;
  }

  function scheduleNextHand(entry) {
    const ready =
      !entry.paused &&
      !entry.nextHandTimer &&
      !entry.retryTimer &&
      !isHandInProgress(entry.game) &&
      !unsaved(entry) &&
      playable(entry.game) >= 2;
    if (!ready) return;
    entry.nextHandTimer = setTimeout(() => {
      entry.nextHandTimer = null;
      run(entry.id, () => startHand(entry)).catch(() => {});
    }, handPauseMs);
  }

  async function startHand(entry) {
    if (!isCurrent(entry) || entry.paused || isHandInProgress(entry.game)) return;
    if (playable(entry.game) < 2) return;
    entry.game = startNextHand(entry.game, dealOptions());
    log('hand_started', { tableId: entry.id, handNumber: entry.game.handNumber });
    await afterChange(entry);
  }

  // Starts the turn timer when the turn passes to someone else. A change that keeps the same
  // player to act (e.g. someone joining mid-hand) leaves their timer running.
  function updateTurnTimer(entry) {
    const playerId = playerToAct(entry.game);
    const handNumber = entry.game.handNumber;
    if (entry.turn && entry.turn.playerId === playerId && entry.turn.handNumber === handNumber) return;
    clearTimeout(entry.turn?.timer);
    entry.turn = null;
    if (playerId === null) return;
    const timer = setTimeout(() => {
      run(entry.id, () => timeOut(entry, handNumber, playerId)).catch(() => {});
    }, turnMs);
    entry.turn = { handNumber, playerId, endsAt: new Date(Date.now() + turnMs).toISOString(), timer };
  }

  async function timeOut(entry, handNumber, playerId) {
    if (!isCurrent(entry) || playerToAct(entry.game) !== playerId) return;
    if (entry.game.handNumber !== handNumber) return;
    entry.game = actOnTimeout(entry.game);
    log('turn_timed_out', { tableId: entry.id, handNumber });
    await afterChange(entry);
  }

  // What the players see: the "state" message for everyone and the "private" one for a player.
  const timerEndsAt = (entry) => entry.turn?.endsAt ?? null;
  const stateOf = (entry) => publicState(entry.game, { timerEndsAt: timerEndsAt(entry) });

  // Called after every change to the engine state: tells the listeners (the WebSocket), saves a
  // hand that just ended, or schedules the next one.
  async function afterChange(entry) {
    updateTurnTimer(entry);
    onChange(entry.id, entry.game, { timerEndsAt: timerEndsAt(entry) });
    if (unsaved(entry)) await saveHand(entry);
    else scheduleNextHand(entry);
  }

  // Saves the finished hand, every player's result and the new stacks in one transaction. If the
  // database fails, the table waits and retries: no new hand starts until the result is saved.
  async function saveHand(entry) {
    const result = entry.game.lastResult;
    entry.pendingHandId ??= generateHandId();
    const seated = entry.game.seats.filter((seat) => seat !== null);
    try {
      await tables.saveHand(entry.id, {
        handId: entry.pendingHandId,
        handNumber: result.handNumber,
        result: {
          showdown: result.showdown,
          board: result.board,
          revealed: result.revealed,
          winners: result.pots.flatMap((pot) =>
            pot.winners.map((w) => ({ playerId: w.id, amount: w.amount, handName: w.handName })),
          ),
        },
        deltas: result.players.map((p) => ({ playerId: p.id, delta: p.net })),
        stacks: seated.map((seat) => ({ playerId: seat.id, stack: seat.stack })),
      });
    } catch {
      log('hand_save_failed', { tableId: entry.id, handNumber: result.handNumber });
      entry.retryTimer = setTimeout(() => {
        entry.retryTimer = null;
        run(entry.id, () => (isCurrent(entry) && unsaved(entry) ? saveHand(entry) : null)).catch(
          () => {},
        );
      }, saveRetryMs);
      return;
    }
    entry.savedHandNumber = result.handNumber;
    entry.pendingHandId = null;
    log('hand_saved', { tableId: entry.id, handNumber: result.handNumber });
    scheduleNextHand(entry);
  }

  function forget(entry) {
    clearTimeout(entry.turn?.timer);
    clearTimeout(entry.nextHandTimer);
    clearTimeout(entry.retryTimer);
    live.delete(entry.id);
  }

  return {
    /** The engine state of a table, loading it if needed, or null if it does not exist. */
    get: (id) => run(id, async () => (await load(id))?.game ?? null),

    /** The "state" message for everyone and the "private" one for a player, or null. */
    view: (id, playerId) =>
      run(id, async () => {
        const entry = await load(id);
        if (!entry) return null;
        return { state: stateOf(entry), private: privateState(entry.game, playerId) };
      }),

    /**
     * A player acts: { action: check | call | fold | raise | allin, amount? }, where amount is
     * the "raise to" total. Throws the engine's EngineError for anything against the rules.
     */
    act: (id, playerId, body) =>
      run(id, async () => {
        const entry = await load(id);
        if (!entry) return { status: 'not_found' };
        entry.game = act(entry.game, playerId, toEngineAction(body));
        await afterChange(entry);
        return { status: 'ok', state: stateOf(entry), private: privateState(entry.game, playerId) };
      }),

    /** Seats the player in the database and in the engine. Mid-hand, they play from the next hand. */
    join: (id, { playerId, playerName }) =>
      run(id, async () => {
        const wasLoaded = live.has(id);
        const result = await tables.joinTable(id, { playerId, playerName });
        if (result.status !== 'joined') return result;
        const entry = await load(id); // A table loaded just now already has the new seat.
        if (wasLoaded) {
          entry.game = sitDown(entry.game, { id: playerId, name: playerName }, result.seatIndex);
        }
        await afterChange(entry);
        return result;
      }),

    /** Frees the seat now, or folds the player and frees it when the current hand ends. */
    leave: (id, playerId) =>
      run(id, async () => {
        const entry = await load(id);
        if (!entry) return { status: 'not_found' };
        if (!entry.game.seats.some((seat) => seat?.id === playerId)) return { status: 'not_seated' };
        const inHand =
          isHandInProgress(entry.game) && entry.game.hand.players.some((p) => p.id === playerId);
        if (!inHand) await tables.removeSeat(id, playerId);
        entry.game = standUp(entry.game, playerId);
        await afterChange(entry);
        const stillSeated = entry.game.seats.some((seat) => seat?.id === playerId);
        return { status: stillSeated ? 'leaving' : 'left' };
      }),

    /** Pausing lets the current hand finish but starts no new one until the table is resumed. */
    setPaused: (id, paused) =>
      run(id, async () => {
        const entry = await load(id);
        if (!entry) return false;
        await tables.setPaused(id, paused);
        entry.paused = paused;
        if (paused) {
          clearTimeout(entry.nextHandTimer);
          entry.nextHandTimer = null;
        }
        await afterChange(entry);
        return true;
      }),

    /** Deletes the table unless a hand is being played or has not been saved yet. */
    remove: (id) =>
      run(id, async () => {
        const entry = live.get(id);
        if (entry && (isHandInProgress(entry.game) || unsaved(entry))) {
          return { status: 'hand_in_progress' };
        }
        const deleted = await tables.deleteTable(id);
        if (entry) forget(entry);
        return { status: deleted ? 'deleted' : 'not_found' };
      }),

    /** Stops every timer (on shutdown and in tests). */
    close() {
      for (const entry of live.values()) forget(entry);
    },
  };
}