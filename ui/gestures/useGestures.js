import { useEffect, useRef, useState } from 'react';
import { cameraProblem } from '../video/useVideo.js';
import { createDetector } from './detector.js';
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
};

/**
 * Gesture control for one screen (plan.md §6: onProgress, onRaiseAmount, onFire).
 *   enabled        false keeps the camera off
 *   stream         a camera MediaStream to reuse (e.g. the video tiles'); without one, the hook
 *                  opens the camera itself and closes it again when done
 *   turn           what may be done now, from turnFrom() in detector.js; null when it is not my
 *                  turn, so nothing fires
 *   onFire         (action, amount?) when a gesture is confirmed
 *   onProgress     (action, 0..1) while a gesture is held; (null, 0) when it is let go
 *   onRaiseAmount  (amount) while an open palm picks a raise
 *
 * Returns { status, problem, stream, action, progress, raising, raiseAmount, cooling, retry }:
 *   status   "off" | "starting" | "on" | "error"
 *   problem  with "error": "denied" (camera blocked), "unavailable" (no camera) or "model"
 *            (gesture recognition could not load). The buttons still work in every case.
 */
export function useGestures({ enabled, stream = null, turn, onFire, onProgress, onRaiseAmount }) {
  const [view, setView] = useState(STARTING);
  const [attempt, setAttempt] = useState(0);
  const turnRef = useRef(turn);
  const callbacks = useRef({ onFire, onProgress, onRaiseAmount });

  useEffect(() => {
    turnRef.current = turn;
    callbacks.current = { onFire, onProgress, onRaiseAmount };
  });

  useEffect(() => {
    if (!enabled) return undefined;
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
          ownStream = await navigator.mediaDevices.getUserMedia(GESTURE_CAMERA);
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
      const detector = createDetector();
      let last = { ...STARTING, status: 'on', stream: camera };
      setView(last);

      const tick = () => {
        if (stopped) return;
        const now = performance.now();
        const hands = reader.recognize(now);
        if (hands) last = publish(last, detector.update(hands, now, turnRef.current));
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
  }, [enabled, stream, attempt]);

  const retry = () => setAttempt((n) => n + 1);
  if (!enabled) return { ...STARTING, status: 'off', retry };
  return { ...view, retry };
}
