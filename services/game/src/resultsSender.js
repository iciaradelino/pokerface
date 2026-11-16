import { PlayersUnavailableError } from './playersClient.js';

export const RESULTS_INTERVAL_MS = 60_000;
export const RESULTS_BATCH = 50;

/**
 * Sends finished hand results (dbo.hand_players rows with sent_at NULL) to the players service.
 * It runs after every saved hand and once a minute, so results reach the players service even
 * if no other hand is played after an outage.
 *
 *   200 -> marked as sent
 *   404 -> the player deleted their profile: marked as sent, never retried
 *   timeout, network error or 5xx -> left unsent; the rest of the round stops too, so a players
 *   service that is down is not flooded with requests. The next round tries again.
 *
 * Only one round runs at a time. A call during a round makes it run once more afterwards, so
 * a hand saved meanwhile is not left waiting for the next minute.
 */
export function createResultsSender({
  tables,
  players,
  intervalMs = RESULTS_INTERVAL_MS,
  batchSize = RESULTS_BATCH,
  logger = console.log,
}) {
  const log = (event, fields) => logger(JSON.stringify({ level: 'info', event, ...fields }));
  let running = null;
  let again = false;
  let timer = null;

  // Sends everything pending, batch by batch. Returns how many rows it settled.
  async function round() {
    let settled = 0;
    for (;;) {
      const rows = await tables.getUnsentResults(batchSize);
      for (const row of rows) {
        const outcome = await players.saveResult(row.playerId, { handId: row.handId, delta: row.delta });
        await tables.markResultSent(row.handId, row.playerId);
        if (outcome === 'not_found') log('result_player_gone', { handId: row.handId });
        settled += 1;
      }
      if (rows.length < batchSize) return settled;
    }
  }

  async function runRounds() {
    do {
      again = false;
      try {
        const settled = await round();
        if (settled > 0) log('results_sent', { count: settled });
      } catch (error) {
        const reason = error instanceof PlayersUnavailableError ? 'players_unavailable' : 'database';
        log('results_send_failed', { reason });
        return;
      }
    } while (again);
  }

  return {
    /** Starts a round, or asks the running one to go again. Never throws. */
    sendPending() {
      if (running) {
        again = true;
        return running;
      }
      running = runRounds().finally(() => {
        running = null;
      });
      return running;
    },

    /** Sends what is pending now (e.g. from before a restart) and then once every interval. */
    start() {
      this.sendPending();
      timer = setInterval(() => this.sendPending(), intervalMs);
      timer.unref();
    },

    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}