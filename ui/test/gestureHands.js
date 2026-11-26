// Made-up MediaPipe hands for the gesture tests.

/**
 * One hand with 21 landmarks. The middle-finger knuckle (landmark 9) sits at height y and the
 * wrist 0.2 below it, so the hand is 0.2 tall.
 *   curled  middle, ring and little finger curled (a fist or a pointing finger)
 *   out     instead, exactly which fingers are stretched out, e.g. ['index', 'middle'] for ✌️;
 *           the others are curled
 */
export function hand(gesture, { y = 0.5, curled = false, out, score = 0.9 } = {}) {
  const isOut = (finger) => (out ? out.includes(finger) : finger === 'index' || !curled);
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y }));
  landmarks[0] = { x: 0.5, y: y + 0.2 };
  for (const joint of [10, 14, 18]) landmarks[joint] = { x: 0.5, y: y - 0.05 };
  const tips = {
    index: [8, y - 0.1],
    middle: [12, y - 0.15],
    ring: [16, y - 0.15],
    little: [20, y - 0.15],
  };
  for (const [finger, [tip, outY]] of Object.entries(tips)) {
    landmarks[tip] = { x: 0.5, y: isOut(finger) ? outY : y + 0.1 };
  }
  return { landmarks, gesture, score };
}

/** ✌️ with the back of the hand to the camera: the shape is there, but MediaPipe's label is not. */
export const backOfHandPeace = (options) =>
  hand('None', { out: ['index', 'middle'], score: 0, ...options });

/** The same hands as MediaPipe's GestureRecognizer returns them. */
export function mediapipeResult(hands) {
  return {
    landmarks: hands.map((h) => h.landmarks),
    gestures: hands.map((h) => [{ categoryName: h.gesture, score: h.score }]),
    handedness: hands.map(() => [{ categoryName: 'Right', score: 1 }]),
  };
}

export const MY_TURN = {
  legalActions: ['fold', 'call', 'raise', 'allin'],
  minRaise: 20,
  maxRaise: 980,
  step: 10,
};
