// Turns recognised hands into poker actions. No camera, no MediaPipe and no React here, so the
// rules can be tested with made-up hands. Ported from prototype/gestures/app.js.
//
// A "hand" is { landmarks, gesture, score }:
//   landmarks  21 points { x, y } from MediaPipe, 0..1 of the picture (y grows downwards)
//   gesture    MediaPipe's label: Victory, Thumb_Up, Thumb_Down, Open_Palm, Closed_Fist, ILoveYou, ...
// Only the first hand is used, so one hand plays every action.
//   score      how sure MediaPipe is about the label, 0..1

export const TIMING = {
  holdMs: 1000, // check, call, fold and all-in must be held this long
  raiseConfirmMs: 600, // the fist that confirms a raise
  cooldownMs: 1200, // nothing fires right after an action
  graceMs: 250, // a gesture lost for a frame or two keeps its progress
  raiseTimeoutMs: 1500, // raise mode ends when no palm or fist is seen for this long
};

export const MIN_SCORE = 0.6;

// Palm height that maps to the smallest and the largest raise (0 is the top of the picture).
const RAISE_LOW_Y = 0.85;
const RAISE_HIGH_Y = 0.2;

/**
 * The detector's view of the turn, built from the "private" message, or null when it is not
 * my turn (or an action is being sent). Nothing is recognised while it is null.
 *   legalActions  e.g. ["fold", "call", "raise", "allin"]
 *   minRaise      smallest "raise to" amount, or null when raising is not allowed
 *   maxRaise      largest "raise to" amount
 *   step          raise amounts are rounded to this (the big blind)
 */
export function turnFrom({ myTurn, mine, bigBlind }) {
  if (!myTurn || !mine) return null;
  return {
    legalActions: mine.legalActions ?? [],
    minRaise: mine.minRaise ?? null,
    maxRaise: mine.maxRaise ?? null,
    step: Math.max(1, bigBlind || 1),
  };
}

/**
 * Raise amount for a palm at height y: higher hand, bigger raise. Rounded to the step and kept
 * between minRaise and maxRaise; the very top is always the maximum.
 */
export function raiseAmountAt(y, { minRaise, maxRaise, step = 1 }) {
  const t = clamp((RAISE_LOW_Y - y) / (RAISE_LOW_Y - RAISE_HIGH_Y), 0, 1);
  if (t === 1 || maxRaise <= minRaise) return maxRaise <= minRaise ? minRaise : maxRaise;
  const raw = minRaise + t * (maxRaise - minRaise);
  const rounded = minRaise + Math.round((raw - minRaise) / step) * step;
  return clamp(rounded, minRaise, maxRaise);
}

const IDLE = Object.freeze({
  action: null,
  progress: 0,
  raising: false,
  raiseAmount: null,
  cooling: false,
  fired: null,
});

/**
 * Returns a detector with update(hands, now, turn) and reset(). Call update once per video
 * frame; `now` is in milliseconds. It returns:
 *   action       the gesture being held ("check", "call", "fold", "raise" or "allin"), or null
 *   progress     how far the hold is, 0..1
 *   raising      true while an open palm is choosing a raise amount
 *   raiseAmount  the amount the palm points at (while raising), or null
 *   cooling      true just after an action fired
 *   fired        { action, amount? } on the one frame an action is confirmed, otherwise null
 * Only actions in turn.legalActions are recognised.
 */
export function createDetector(timing = TIMING) {
  let hold = null; // { action, start, lastSeen }
  let cooldownUntil = 0;
  let raise = null; // { amount, lastSeen }

  function reset() {
    hold = null;
    raise = null;
  }

  function fire(action, now) {
    const fired = action === 'raise' ? { action, amount: raise.amount } : { action };
    cooldownUntil = now + timing.cooldownMs;
    reset();
    return { ...IDLE, cooling: true, fired };
  }

  function update(hands, now, turn) {
    if (!turn) {
      reset();
      return IDLE;
    }
    if (now < cooldownUntil) {
      reset();
      return { ...IDLE, cooling: true };
    }

    const legal = new Set(turn.legalActions);
    const canRaise = legal.has('raise') && turn.minRaise !== null && turn.maxRaise !== null;
    const sure = (hand, name) => hand.gesture === name && hand.score >= MIN_SCORE;
    let candidate = null;
    let holdMs = timing.holdMs;

    if (hands.length >= 1) {
      const hand = hands[0];

      if (sure(hand, 'Victory')) {
        // Check is the ✌️ sign, held like the others. It used to be knocking twice, but a moving
        // gesture was often missed: a blurred frame lost the hand and the knocks started over.
        raise = null;
        if (legal.has('check')) candidate = 'check';
      } else if (sure(hand, 'ILoveYou')) {
        // All-in is the 🤟 sign (thumb, index and little finger out). It used to be two open
        // palms, but that starts with one open palm, so it was often read as a raise.
        raise = null;
        if (legal.has('allin')) candidate = 'allin';
      } else if (sure(hand, 'Thumb_Up')) {
        if (legal.has('call')) candidate = 'call';
      } else if (sure(hand, 'Thumb_Down')) {
        raise = null;
        if (legal.has('fold')) candidate = 'fold';
      } else if (canRaise && sure(hand, 'Open_Palm')) {
        raise = { amount: raiseAmountAt(hand.landmarks[9].y, turn), lastSeen: now };
      } else if (raise && sure(hand, 'Closed_Fist')) {
        candidate = 'raise';
        holdMs = timing.raiseConfirmMs;
        raise.lastSeen = now;
      } else if (peaceShape(hand.landmarks)) {
        // MediaPipe's model mostly knows ✌️ with the palm to the camera. From the back of the hand
        // it rarely says "Victory", but the finger joints still show the shape, so check works
        // either way. A raise being chosen is kept: a fist closing can pass through this shape.
        if (legal.has('check')) candidate = 'check';
      }
    }

    if (raise && now - raise.lastSeen > timing.raiseTimeoutMs) raise = null;
    const raiseView = { raising: raise !== null, raiseAmount: raise?.amount ?? null };

    if (!candidate) {
      // A gesture that flickers out for a frame keeps its progress for a moment.
      if (hold && now - hold.lastSeen <= timing.graceMs) {
        return { ...IDLE, ...raiseView, action: hold.action, progress: hold.progress };
      }
      hold = null;
      return { ...IDLE, ...raiseView };
    }

    if (hold?.action !== candidate) hold = { action: candidate, start: now, progress: 0 };
    hold.lastSeen = now;
    hold.progress = Math.min(1, (now - hold.start) / holdMs);
    if (hold.progress >= 1) return fire(candidate, now);
    return { ...IDLE, ...raiseView, action: candidate, progress: hold.progress };
  }

  return { update, reset };
}

// Finger joints from MediaPipe's hand landmarks: [middle joint, fingertip].
const INDEX = [6, 8];
const MIDDLE = [10, 12];
const RING = [14, 16];
const LITTLE = [18, 20];

/**
 * ✌️ from the finger joints alone, whichever side of the hand faces the camera: index and middle
 * finger stretched out (the tip well past its middle joint, seen from the wrist), ring and little
 * finger folded in (the tip closer to the wrist than its middle joint). The thumb can be anywhere.
 */
export function peaceShape(landmarks) {
  if (!landmarks || landmarks.length < 21) return false;
  const reach = ([joint, tip]) =>
    dist(landmarks[tip], landmarks[0]) / dist(landmarks[joint], landmarks[0]);
  return reach(INDEX) > 1.2 && reach(MIDDLE) > 1.2 && reach(RING) < 1 && reach(LITTLE) < 1;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
