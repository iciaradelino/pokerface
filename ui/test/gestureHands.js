// Made-up MediaPipe hands for the gesture tests.

/**
 * One hand with 21 landmarks. The middle-finger knuckle (landmark 9) sits at height y and the
 * wrist 0.2 below it, so the hand is 0.2 tall.
 *   curled  middle, ring and little finger curled (a fist or a pointing finger)
 *   tipY    height of the index fingertip (landmark 8), for knocking
 */
export function hand(gesture, { y = 0.5, curled = false, tipY, score = 0.9 } = {}) {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y }));
  landmarks[0] = { x: 0.5, y: y + 0.2 };
  for (const joint of [10, 14, 18]) landmarks[joint] = { x: 0.5, y: y - 0.05 };
  for (const tip of [12, 16, 20]) landmarks[tip] = { x: 0.5, y: curled ? y + 0.1 : y - 0.15 };
  landmarks[8] = { x: 0.5, y: tipY ?? y - 0.1 };
  return { landmarks, gesture, score };
}

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
