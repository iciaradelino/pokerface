import { useEffect, useRef, useState } from 'react';
import { cameraProblem } from '../video/useVideo.js';
import { TIMING, createDetector } from './detector.js';
import { createFrameReader, loadGestureRecognizer } from './recognizer.js';

// 640x480 gives MediaPipe enough detail; the picture is only used on this device.
export const GESTURE_CAMERA = {
  video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
  audio: false,
};

const STARTING = {
  status: 'starting',
  problem: null,
  stream: null,
  action: null,
  progress: 0,
  raising: false,
  raiseAmount: null,
  cooling: false,
  hand: false,
};

/**
 * Gesture control for one screen (plan.md §6: onProgress, onRaiseAmount, onFire).
 *   enabled        false keeps the camera off
 *   stream         a camera MediaStream to reuse (e.g. the video tiles'); without one, the hook
 *                  opens the camera itself and closes it again when done. A stream it is given is
 *                  never stopped: its owner turns it off
 *   cameraPending  true while the owner of `stream` is still asking for the camera: the hook
 *                  waits ("starting") instead of opening a second camera of its own
 *   turn           what may be done now, from turnFrom() in detector.js; null when it is not my
 *                  turn, so nothing fires
 *   onFire         (action, amount?) when a gesture is confirmed
 *   onProgress     (action, 0..1) while a gesture is held; (null, 0) when it is let go
 *   onRaiseAmount  (amount) while an open palm picks a raise
 *   holdMs         how long call, fold and all-in must be held (the profile's "Hold to confirm");
 *                  a change applies straight away, without restarting the camera
 *
 * Returns { status, problem, stream, action, progress, raising, raiseAmount, cooling, hand, retry }:
 *   hand     true while a hand is in view (the tutorial's "Hand tracked")
 *   status   "off" | "starting" | "on" | "error"
 *   problem  with "error": "denied" (camera blocked), "unavailable" (no camera) or "model"
 *            (gesture recognition could not load). The buttons still work in every case.
 */
export function useGestures({
  enabled,
  stream = null,
  cameraPending = false,
  turn,
  onFire,
  onProgress,
  onRaiseAmount,
  holdMs = TIMING.holdMs,
}) {
  const [view, setView] = useState(STARTING);
  const [attempt, setAttempt] = useState(0);
  const turnRef = useRef(turn);
  const callbacks = useRef({ onFire, onProgress, onRaiseAmount });
  const holdRef = useRef(holdMs);

  useEffect(() => {
    turnRef.current = turn;
    holdRef.current = holdMs;
    callbacks.current = { onFire, onProgress, onRaiseAmount };
  });

  useEffect(() => {
    if (!enabled || cameraPending) return undefined;
    let stopped = false;
    let frame = null;
    let ownStream = null;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;

    function fail(problem) {
      ownStream?.getTracks().forEach((track) => track.stop());
      if (!stopped) setView({ ...STARTING, status: 'error', problem });
    }

    async function start() {
      let camera = stream;
      if (!camera) {
        try {
          if (!navigator.mediaDevices?.getUserMedia) throw new Error('No getUserMedia');
          const media = await navigator.mediaDevices.getUserMedia(GESTURE_CAMERA);
          // Turned off or left the table while the browser was still asking: the cleanup has
          // already run, so this late camera must be closed here or it would stay on.
          if (stopped) {
            media.getTracks().forEach((track) => track.stop());
            return undefined;
          }
          ownStream = media;
          camera = ownStream;
        } catch (err) {
          return fail(cameraProblem(err));
        }
      }
      if (stopped) return undefined;

      let recognizer;
      try {
        video.srcObject = camera;
        await video.play();
        recognizer = await loadGestureRecognizer();
      } catch {
        return fail('model');
      }
      if (stopped) return undefined;

      const reader = createFrameReader(recognizer, video);
      // The detector reads holdMs on every frame, so it follows the current setting.
      const detector = createDetector({
        ...TIMING,
        get holdMs() {
          return holdRef.current;
        },
      });
      let last = { ...STARTING, status: 'on', stream: camera };
      setView(last);

      const tick = () => {
        if (stopped) return;
        const now = performance.now();
        const hands = reader.recognize(now);
        if (hands) {
          const out = detector.update(hands, now, turnRef.current);
          last = publish(last, { ...out, hand: hands.length > 0 });
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      return undefined;
    }

    function publish(last, out) {
      const { onFire, onProgress, onRaiseAmount } = callbacks.current;
      // 20 steps are plenty for a ring, and save re-rendering the page on every frame.
      const progress = Math.round(out.progress * 20) / 20;
      const next = { ...last, ...out, progress };
      delete next.fired;
      if (next.action !== last.action || next.progress !== last.progress) {
        onProgress?.(next.action, next.progress);
      }
      if (next.raiseAmount !== null && next.raiseAmount !== last.raiseAmount) {
        onRaiseAmount?.(next.raiseAmount);
      }
      if (out.fired) onFire?.(out.fired.action, out.fired.amount);
      const changed = Object.keys(next).some((key) => next[key] !== last[key]);
      if (changed) setView(next);
      return next;
    }

    start();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      ownStream?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      setView(STARTING);
    };
  }, [enabled, stream, cameraPending, attempt]);

  const retry = () => setAttempt((n) => n + 1);
  if (!enabled) return { ...STARTING, status: 'off', retry };
  return { ...view, retry };
}
