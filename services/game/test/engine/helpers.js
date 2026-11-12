import { createDeck } from '../../src/engine/cards.js';

/**
 * Builds a 52-card deck that deals the given hole cards and board.
 * `hands[i]` are the hole cards of player i (in seat order); dealing starts left of the button.
 */
export function riggedDeck({ hands, board = [], buttonIndex = 0 }) {
  const used = new Set([...hands.flat(), ...board]);
  const rest = createDeck().filter((c) => !used.has(c));
  const take = () => rest.shift();
  const count = hands.length;
  const deck = [];
  for (let round = 0; round < 2; round++) {
    for (let k = 1; k <= count; k++) deck.push(hands[(buttonIndex + k) % count][round] ?? take());
  }
  const boardLeft = [...board];
  const nextBoard = () => (boardLeft.length > 0 ? boardLeft.shift() : take());
  deck.push(take(), nextBoard(), nextBoard(), nextBoard()); // burn + flop
  deck.push(take(), nextBoard()); // burn + turn
  deck.push(take(), nextBoard()); // burn + river
  deck.push(...rest);
  return deck;
}

export const players = (...stacks) =>
  stacks.map((stack, i) => ({ id: String.fromCharCode(65 + i), stack }));

export const ids = (state) => state.players.map((p) => p.id);
export const toActId = (state) => (state.toAct === null ? null : state.players[state.toAct].id);
export const chipsOf = (state) => state.players.reduce((s, p) => s + p.stack + p.totalBet, 0);
export const byId = (state, id) => state.players.find((p) => p.id === id);
