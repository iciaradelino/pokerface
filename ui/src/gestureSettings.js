// The gesture choices saved on the player (players service `gestureSettings`, a small JSON object):
//   enabled  false means buttons only (the default is on)
//   holdMs   how long call, fold and all-in must be held before they are sent
import { TIMING } from '../gestures/detector.js';

export const HOLD_MIN_MS = 500;
export const HOLD_MAX_MS = 2000;
export const HOLD_STEP_MS = 100;

/** The player's hold time, kept within the range the profile offers. */
export function holdMsOf(player) {
  const saved = player?.gestureSettings?.holdMs;
  if (!Number.isFinite(saved)) return TIMING.holdMs;
  return Math.min(HOLD_MAX_MS, Math.max(HOLD_MIN_MS, saved));
}

/** True unless the player turned gestures off. */
export const gesturesOn = (player) => player?.gestureSettings?.enabled !== false;

/** 1000 → "1.0 s" */
export const formatHold = (ms) => `${(ms / 1000).toFixed(1)} s`;
