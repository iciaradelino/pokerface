import { createTable, sitDown } from './engine/index.js';

/**
 * Rebuilds a table in the poker engine from what the database stores: settings, who sits where
 * with how many chips, and how many hands have been played (so hand numbers keep counting and
 * stay unique in dbo.hands after a restart). The dealer button starts again from the first seat.
 *
 * The engine has no restore function yet, so this seats everyone with the public API and then
 * copies the saved stacks and hand counter onto the engine's (plain data) table. When the engine
 * gets restoreTable, only this function changes.
 */
export function restoreEngineTable(stored, lastHandNumber) {
  let game = createTable({
    smallBlind: stored.smallBlind,
    bigBlind: stored.bigBlind,
    startingStack: stored.startingStack,
    maxSeats: stored.maxSeats,
  });
  for (const seat of stored.seats) {
    game = sitDown(game, { id: seat.playerId, name: seat.name }, seat.seatIndex);
  }
  const restored = structuredClone(game);
  for (const seat of stored.seats) restored.seats[seat.seatIndex].stack = seat.stack;
  restored.handNumber = lastHandNumber;
  return restored;
}