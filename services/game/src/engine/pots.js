import { compareScores } from './evaluator.js';

/**
 * Splits the chips everyone put in during a hand into a main pot and side pots.
 *
 * @param {{id: string, amount: number, folded: boolean}[]} contributions total chips per player
 * @returns {{amount: number, eligible: string[], contributors: string[]}[]} main pot first
 *
 * Each "layer" between two contribution levels is contested by the non-folded players who
 * reached that level. Folded players' chips stay in the pots but they cannot win them.
 * A layer only one player reached is their uncalled excess and goes back to them.
 */
export function buildPots(contributions) {
  const levels = [...new Set(contributions.map((c) => c.amount).filter((a) => a > 0))].sort(
    (a, b) => a - b,
  );
  const pots = [];
  let previous = 0;

  for (const level of levels) {
    let amount = 0;
    const contributors = [];
    for (const c of contributions) {
      const part = Math.min(c.amount, level) - Math.min(c.amount, previous);
      if (part > 0) {
        amount += part;
        contributors.push(c.id);
      }
    }
    const eligible = contributions.filter((c) => !c.folded && c.amount >= level).map((c) => c.id);
    previous = level;

    const last = pots.at(-1);
    // Eligibility only shrinks as levels rise, so equal size means the same players.
    // A layer nobody can win (its top contributor folded) is added to the pot below it.
    if (last && (eligible.length === 0 || eligible.length === last.eligible.length)) {
      last.amount += amount;
      for (const id of contributors) {
        if (!last.contributors.includes(id)) last.contributors.push(id);
      }
    } else if (eligible.length === 0) {
      throw new Error('A pot has no player who can win it');
    } else {
      pots.push({ amount, eligible, contributors });
    }
  }
  return pots;
}

/**
 * Decides the winners of each pot and splits it.
 *
 * @param pots output of buildPots
 * @param {Record<string, number[]>} scoresById hand scores of the players still in the hand
 * @param {string[]} seatOrder player ids starting with the first seat left of the button
 * Odd chips from a split go one at a time to the winners closest to the left of the button.
 */
export function awardPots(pots, scoresById, seatOrder) {
  return pots.map((pot) => {
    let winners = [];
    if (pot.eligible.length === 1) {
      winners = [...pot.eligible];
    } else {
      let best = null;
      for (const id of pot.eligible) {
        const score = scoresById[id];
        if (!score) throw new Error(`Missing hand score for ${id}`);
        const comparison = best === null ? 1 : compareScores(score, best);
        if (comparison > 0) {
          best = score;
          winners = [id];
        } else if (comparison === 0) {
          winners.push(id);
        }
      }
    }
    winners.sort((a, b) => seatOrder.indexOf(a) - seatOrder.indexOf(b));
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    const payouts = winners.map((id) => {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      return { id, amount: share + extra };
    });
    return { ...pot, winners: payouts };
  });
}
