import { describe, expect, it } from 'vitest';
import {
  TIMING,
  backFingersCurled,
  createDetector,
  raiseAmountAt,
  turnFrom,
} from '../gestures/detector.js';
import { MY_TURN, hand } from './gestureHands.js';

const FRAME_MS = 50;

/**
 * Shows the same hands for `ms` milliseconds, one frame every 50 ms, starting at `from`.
 * Returns the last output, every fired action, and the time after the last frame.
 */
function show(detector, hands, { from = 0, ms, turn = MY_TURN }) {
  let out;
  const fired = [];
  let now = from;
  for (; now <= from + ms; now += FRAME_MS) {
    out = detector.update(hands, now, turn);
    if (out.fired) fired.push(out.fired);
  }
  return { out, fired, now };
}

/** Moves the index fingertip through these heights, one frame each. */
function knock(detector, heights, { from = 0, turn = MY_TURN, gap = FRAME_MS } = {}) {
  const fired = [];
  let now = from;
  for (const tipY of heights) {
    const out = detector.update([hand('Closed_Fist', { curled: true, tipY })], now, turn);
    if (out.fired) fired.push(out.fired);
    now += gap;
  }
  return { fired, now };
}

const CHECK_TURN = { ...MY_TURN, legalActions: ['fold', 'check', 'raise', 'allin'] };

describe('gesture detector', () => {
  it('calls after a thumbs up held for a second, showing the progress on the way', () => {
    const detector = createDetector();
    const half = show(detector, [hand('Thumb_Up')], { ms: 500 });
    expect(half.out).toMatchObject({ action: 'call', fired: null });
    expect(half.out.progress).toBeCloseTo(0.5);
    expect(half.fired).toEqual([]);

    const rest = show(detector, [hand('Thumb_Up')], { from: half.now, ms: 500 });
    expect(rest.fired).toEqual([{ action: 'call' }]);
  });

  it('folds with a thumbs down', () => {
    const { fired } = show(createDetector(), [hand('Thumb_Down')], { ms: 1100 });
    expect(fired).toEqual([{ action: 'fold' }]);
  });

  it('goes all-in with the 🤟 sign', () => {
    const { fired } = show(createDetector(), [hand('ILoveYou')], { ms: 1100 });
    expect(fired).toEqual([{ action: 'allin' }]);
  });

  it('switches from choosing a raise to all-in, and two palms are only a raise', () => {
    const detector = createDetector();
    const palm = show(detector, [hand('Open_Palm')], { ms: 200 });
    expect(palm.out.raising).toBe(true);
    const allin = show(detector, [hand('ILoveYou')], { from: palm.now, ms: 1000 });
    expect(allin.fired).toEqual([{ action: 'allin' }]);

    const twoPalms = show(createDetector(), [hand('Open_Palm'), hand('Open_Palm')], { ms: 1500 });
    expect(twoPalms.fired).toEqual([]);
    expect(twoPalms.out.raising).toBe(true);
  });

  it('does nothing when it is not my turn, and forgets a hold when my turn ends', () => {
    const detector = createDetector();
    expect(show(detector, [hand('Thumb_Up')], { ms: 2000, turn: null }).fired).toEqual([]);

    const started = show(detector, [hand('Thumb_Up')], { ms: 800 });
    expect(started.out.action).toBe('call');
    detector.update([hand('Thumb_Up')], started.now, null);
    const after = detector.update([hand('Thumb_Up')], started.now + FRAME_MS, MY_TURN);
    expect(after.progress).toBe(0);
  });

  it('ignores gestures for actions that are not legal', () => {
    const turn = { legalActions: ['fold', 'check'], minRaise: null, maxRaise: null, step: 10 };
    const detector = createDetector();
    expect(show(detector, [hand('Thumb_Up')], { ms: 1500, turn }).fired).toEqual([]);
    expect(show(detector, [hand('ILoveYou')], { ms: 1500, turn }).fired).toEqual([]);
    expect(show(detector, [hand('Open_Palm', { y: 0.2 })], { ms: 300, turn }).out.raising).toBe(
      false,
    );
    expect(knock(detector, [0.4, 0.5, 0.4, 0.5, 0.4], { turn: MY_TURN }).fired).toEqual([]);
  });

  it('ignores gestures MediaPipe is unsure about', () => {
    const { fired, out } = show(createDetector(), [hand('Thumb_Up', { score: 0.4 })], { ms: 1500 });
    expect(fired).toEqual([]);
    expect(out.action).toBeNull();
  });

  it('raises to the amount the open palm points at, confirmed with a fist', () => {
    const detector = createDetector();
    const palm = show(detector, [hand('Open_Palm', { y: 0.2 })], { ms: 300 });
    expect(palm.out).toMatchObject({ raising: true, raiseAmount: 980, action: null });

    const lower = show(detector, [hand('Open_Palm', { y: 0.525 })], { from: palm.now, ms: 100 });
    expect(lower.out.raiseAmount).toBe(500);

    const fist = show(detector, [hand('Closed_Fist', { curled: true })], {
      from: lower.now,
      ms: TIMING.raiseConfirmMs,
    });
    expect(fist.fired).toEqual([{ action: 'raise', amount: 500 }]);
  });

  it('does not raise with a fist alone, and ends the raise when the hand goes away', () => {
    const detector = createDetector();
    expect(
      show(detector, [hand('Closed_Fist', { curled: true })], { ms: 1000, turn: MY_TURN }).fired,
    ).toEqual([]);

    const palm = show(detector, [hand('Open_Palm')], { ms: 100 });
    expect(palm.out.raising).toBe(true);
    const gone = show(detector, [], { from: palm.now, ms: TIMING.raiseTimeoutMs + 100 });
    expect(gone.out.raising).toBe(false);
  });

  it('cancels a raise with a thumbs down', () => {
    const detector = createDetector();
    const palm = show(detector, [hand('Open_Palm')], { ms: 100 });
    const down = detector.update([hand('Thumb_Down')], palm.now, MY_TURN);
    expect(down).toMatchObject({ raising: false, action: 'fold' });
  });

  it('checks with two knocks', () => {
    const { fired } = knock(createDetector(), [0.4, 0.5, 0.4, 0.5, 0.4], { turn: CHECK_TURN });
    expect(fired).toEqual([{ action: 'check' }]);
  });

  it('does not check on one knock, or on two knocks far apart', () => {
    expect(knock(createDetector(), [0.4, 0.5, 0.4, 0.4, 0.4], { turn: CHECK_TURN }).fired).toEqual(
      [],
    );
    expect(
      knock(createDetector(), [0.4, 0.5, 0.4, 0.5, 0.4], { turn: CHECK_TURN, gap: 500 }).fired,
    ).toEqual([]);
  });

  it('pauses after an action so one gesture does not fire twice', () => {
    const detector = createDetector();
    const first = show(detector, [hand('Thumb_Up')], { ms: 1000 });
    expect(first.fired).toHaveLength(1);
    const during = show(detector, [hand('Thumb_Up')], { from: first.now, ms: 1000 });
    expect(during.fired).toEqual([]);
    expect(during.out.cooling).toBe(true);
    const later = show(detector, [hand('Thumb_Up')], {
      from: first.now + TIMING.cooldownMs,
      ms: 1100,
    });
    expect(later.fired).toEqual([{ action: 'call' }]);
  });

  it('keeps the progress when the gesture is lost for a frame', () => {
    const detector = createDetector();
    const held = show(detector, [hand('Thumb_Up')], { ms: 600 });
    const blink = detector.update([], held.now, MY_TURN);
    expect(blink).toMatchObject({ action: 'call', progress: held.out.progress });
    const back = show(detector, [hand('Thumb_Up')], { from: held.now + FRAME_MS, ms: 400 });
    expect(back.fired).toEqual([{ action: 'call' }]);

    const lost = createDetector();
    const again = show(lost, [hand('Thumb_Up')], { ms: 600 });
    expect(lost.update([], again.now + TIMING.graceMs + 1, MY_TURN).action).toBeNull();
  });

  it('starts the hold again when the gesture changes', () => {
    const detector = createDetector();
    const up = show(detector, [hand('Thumb_Up')], { ms: 700 });
    const down = show(detector, [hand('Thumb_Down')], { from: up.now, ms: 500 });
    expect(down.fired).toEqual([]);
    expect(down.out.action).toBe('fold');
    expect(down.out.progress).toBeCloseTo(0.5);
  });
});

describe('gesture helpers', () => {
  const limits = { minRaise: 20, maxRaise: 980, step: 10 };

  it('maps palm height to a raise within the limits, rounded to the big blind', () => {
    expect(raiseAmountAt(0.95, limits)).toBe(20);
    expect(raiseAmountAt(0.85, limits)).toBe(20);
    expect(raiseAmountAt(0.1, limits)).toBe(980);
    expect(raiseAmountAt(0.525, limits)).toBe(500);
    expect(raiseAmountAt(0.5, limits) % 10).toBe(0);
    // The maximum is reachable even when it is not a multiple of the step.
    expect(raiseAmountAt(0.2, { minRaise: 20, maxRaise: 975, step: 10 })).toBe(975);
    expect(raiseAmountAt(0.3, { minRaise: 20, maxRaise: 975, step: 10 })).toBeLessThanOrEqual(975);
    // Only one amount possible (e.g. a short stack).
    expect(raiseAmountAt(0.3, { minRaise: 300, maxRaise: 300, step: 10 })).toBe(300);
  });

  it('tells a fist from an open hand', () => {
    expect(backFingersCurled(hand('Closed_Fist', { curled: true }).landmarks)).toBe(true);
    expect(backFingersCurled(hand('Open_Palm').landmarks)).toBe(false);
  });

  it('builds the turn from the private message', () => {
    const mine = { legalActions: ['fold', 'call'], minRaise: null, maxRaise: null };
    expect(turnFrom({ myTurn: false, mine, bigBlind: 10 })).toBeNull();
    expect(turnFrom({ myTurn: true, mine: null, bigBlind: 10 })).toBeNull();
    expect(turnFrom({ myTurn: true, mine, bigBlind: 10 })).toEqual({
      legalActions: ['fold', 'call'],
      minRaise: null,
      maxRaise: null,
      step: 10,
    });
    expect(turnFrom({ myTurn: true, mine: {}, bigBlind: undefined })).toEqual({
      legalActions: [],
      minRaise: null,
      maxRaise: null,
      step: 1,
    });
  });
});
