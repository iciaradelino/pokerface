import { useCallback, useEffect, useRef, useState } from 'react';
import { createMesh } from './mesh.js';

// Small on purpose: six tiles of 640x480 would be heavy on a weak connection (README risks).
const VIDEO = { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 } };
// Echo cancellation matters: players will often sit close to their speakers.
export const CAMERA_CONSTRAINTS = {
  video: VIDEO,
  audio: { echoCancellation: true, noiseSuppression: true },
};
const VIDEO_ONLY = { video: VIDEO, audio: false };

/** Camera and microphone; if that fails, the camera alone (the mic may be missing or blocked). */
async function openMedia(devices) {
  if (!devices?.getUserMedia) throw new Error('getUserMedia is not available');
  try {
    return await devices.getUserMedia(CAMERA_CONSTRAINTS);
  } catch {
    return devices.getUserMedia(VIDEO_ONLY);
  }
}

/** Maps the browser's getUserMedia errors to something the tile can explain. */
export function cameraProblem(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'denied';
  return 'unavailable'; // no camera, in use by another app, or no getUserMedia at all
}

/**
 * Video for one table.
 *   playerId   me
 *   peerIds    ids of everyone seated (mine is ignored)
 *   send       (toPlayerId, data) => void, sends a { type: "signal" } message
 *   onSignal   (listener) => unsubscribe; calls listener(from, data) for each incoming signal
 *
 * Returns { camera, local, remotes, retry, hasMic, micOn, toggleMic }:
 *   camera   "asking" | "on" | "denied" | "unavailable"
 *   local    my MediaStream (or null)
 *   remotes  { [playerId]: { stream, state } }
 *   hasMic   false when only the camera could be opened
 *   micOn    whether others can hear me; toggleMic() mutes and unmutes
 * Only the people at the table receive the video and sound, and it never goes through the server.
 */
export function useVideo({ playerId, peerIds, send, onSignal }) {
  const [camera, setCamera] = useState('asking');
  const [local, setLocal] = useState(null);
  const [remotes, setRemotes] = useState({});
  const [attempt, setAttempt] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const meshRef = useRef(null);
  const sendRef = useRef(send);
  const peerKey = [...new Set(peerIds)].sort().join(',');

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // One mesh per table visit.
  useEffect(() => {
    const mesh = createMesh({
      selfId: playerId,
      send: (to, data) => sendRef.current?.(to, data),
      onChange: () => setRemotes(mesh.remotes()),
    });
    meshRef.current = mesh;
    const unsubscribe = onSignal((from, data) => mesh.handleSignal(from, data));
    return () => {
      unsubscribe?.();
      mesh.close();
      meshRef.current = null;
      setRemotes({});
    };
  }, [playerId, onSignal]);

  useEffect(() => {
    meshRef.current?.setPeers(peerKey ? peerKey.split(',') : []);
  }, [peerKey, playerId, onSignal]);

  // My camera. Stopped when leaving, so the light goes off.
  useEffect(() => {
    let stream = null;
    let active = true;
    // A browser without camera support fails the same way as having no camera.
    openMedia(globalThis.navigator?.mediaDevices)
      .then((media) => {
        if (!active) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        setMicOn(true);
        setLocal(media);
        setCamera('on');
        meshRef.current?.setLocalStream(media);
      })
      .catch((error) => active && setCamera(cameraProblem(error)));
    return () => {
      active = false;
      stream?.getTracks().forEach((track) => track.stop());
      setLocal(null);
      meshRef.current?.setLocalStream(null);
    };
  }, [attempt, playerId, onSignal]);

  const toggleMic = useCallback(() => {
    const next = !micOn;
    local?.getAudioTracks().forEach((track) => (track.enabled = next));
    setMicOn(next);
  }, [local, micOn]);

  const hasMic = (local?.getAudioTracks().length ?? 0) > 0;

  const retry = useCallback(() => {
    setCamera('asking');
    setAttempt((n) => n + 1);
  }, []);
  return { camera, local, remotes, retry, hasMic, micOn, toggleMic };
}
