import { useEffect, useRef } from 'react';
import './VideoTile.css';

const MESSAGES = {
  asking: 'Allow the camera…',
  denied: 'Camera blocked',
  unavailable: 'No camera',
  connecting: 'Connecting video…',
  failed: 'Video unavailable',
};

/** What to say instead of a picture, or null when there is a picture to show. */
export function videoNotice({ stream, camera, state, isMe }) {
  if (isMe) return camera === 'on' && stream ? null : MESSAGES[camera];
  if (state === 'failed') return MESSAGES.failed;
  return stream ? null : MESSAGES.connecting;
}

/**
 * The picture for one seat. Mine is muted (no echo) and mirrored like a mirror; the others'
 * are not mirrored so text and gestures read the right way round. Children are shown as the
 * fallback (the seat silhouette) while there is no picture.
 */
export function VideoTile({
  stream,
  isMe = false,
  silent = false,
  camera,
  state,
  onRetry,
  children,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && ref.current.srcObject !== (stream ?? null)) {
      ref.current.srcObject = stream ?? null;
    }
  }, [stream]);

  const notice = videoNotice({ stream, camera, state, isMe });
  return (
    <div className="video-tile">
      {stream && (
        <video
          ref={ref}
          className={isMe ? 'video-tile__video video-tile__video--me' : 'video-tile__video'}
          autoPlay
          playsInline
          muted={isMe || silent}
          aria-label={isMe ? 'Your camera' : 'Player camera'}
        />
      )}
      {!stream && children}
      {notice && (
        <span className="video-tile__notice" role="status">
          {notice}
          {isMe && (camera === 'denied' || camera === 'unavailable') && onRetry && (
            <button type="button" className="video-tile__retry" onClick={onRetry}>
              Try again
            </button>
          )}
        </span>
      )}
    </div>
  );
}
