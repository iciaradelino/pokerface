import { randomInt } from 'node:crypto';

/**
 * A "random int" function returns an integer in [0, max).
 * Production uses the cryptographically secure generator so shuffles cannot be predicted.
 */
export const secureRandomInt = (max) => randomInt(max);

/**
 * Deterministic generator (mulberry32) for tests and for replaying a hand from a seed.
 * Never use it for real games: its output is predictable.
 */
export function seededRandomInt(seed) {
  let state = seed >>> 0;
  return (max) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(unit * max);
  };
}
