import { useEffect, useRef } from 'react';
import { formatChips } from '../src/components/Chips.jsx';
import './GesturePanel.css';

export const ACTION_LABELS = {
  check: 'Check',
  call: 'Call',
  fold: 'Fold',
  raise: 'Raise',
  allin: 'All-in',
};

export const GESTURE_GUIDE = [
  { action: 'check', how: 'Knock twice with a fist or a finger ✊' },
  { action: 'call', how: 'Thumbs up, hold 1 s 👍' },
  { action: 'fold', how: 'Thumbs down, hold 1 s 👎' },
  { action: 'raise', how: 'Open palm, move up or down for the amount, then close your fist ✋' },
  { action: 'allin', how: 'Thumb, index and little finger out, hold 1 s 🤟' },
];

const PROBLEMS = {
  denied: 'Camera blocked. Allow it in your browser to use gestures, or use the buttons.',
  unavailable: 'No camera found. You can still play with the buttons.',
  model: 'Gesture recognition could not load. You can still play with the buttons.',
};

/** What to tell the player right now, from the useGestures() result. */
export function gestureMessage(gestures, { myTurn }) {
  if (gestures.status === 'off') return 'Gestures are off. Use the buttons.';
  if (gestures.status === 'starting') return 'Starting the camera…';
  if (gestures.status === 'error') return PROBLEMS[gestures.problem] ?? PROBLEMS.model;
  if (!myTurn) return 'Gestures work on your turn.';
  if (gestures.cooling) return 'Got it.';
  if (gestures.action) return `Hold for ${ACTION_LABELS[gestures.action]}…`;
  if (gestures.raising) {
    return `Raise to ${formatChips(gestures.raiseAmount)}. Close your fist to confirm.`;
  }
  return 'Show a gesture.';
}

/** Progress ring for the gesture being held. */
export function GestureRing({ action, progress, size = 96, label }) {
  const r = size / 2 - 6;
  const length = 2 * Math.PI * r;
  return (
    <svg
      className="gesture-ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="progressbar"
      aria-label={label ?? (action ? `Holding ${ACTION_LABELS[action]}` : 'No gesture')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <circle className="gesture-ring__track" cx={size / 2} cy={size / 2} r={r} />
      <circle
        className={`gesture-ring__bar gesture-ring__bar--${action ?? 'none'}`}
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeDasharray={length}
        strokeDashoffset={length * (1 - progress)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

/**
 * The ring and what it is for, to lay over my camera: the gesture being held, or the raise
 * amount while an open palm picks it. Nothing when no gesture is seen.
 */
export function GestureHold({ gestures, size = 96 }) {
  const { action, progress, raising, raiseAmount } = gestures;
  if (!action && !raising) return null;
  const label = raising
    ? `${ACTION_LABELS.raise} ${formatChips(raiseAmount)}`
    : ACTION_LABELS[action];
  return (
    <div className="gesture-hold">
      <GestureRing
        action={action ?? 'raise'}
        progress={action ? progress : 0}
        size={size}
        label={action ? undefined : 'Picking the raise amount'}
      />
      <span className="gesture-hold__label tabular">{label}</span>
    </div>
  );
}

/** My own camera, mirrored, with the ring on top (the panel here and the gesture tutorial). */
export function GesturePreview({ gestures }) {
  const videoRef = useRef(null);
  const { stream } = gestures;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    video.play?.()?.catch?.(() => {});
  }, [stream]);
  return (
    <div className="gesture-preview">
      <video ref={videoRef} muted playsInline aria-label="Your camera" />
      <GestureHold gestures={gestures} />
    </div>
  );
}

/**
 * Gesture status for the table: camera preview with the hold ring, what to do next, the
 * gestures cheat sheet and an on/off switch. The buttons below always work as well.
 * showPreview false leaves out the preview, when my video tile already shows my camera and the
 * ring (GestureHold) is drawn on it instead.
 */
export function GesturePanel({ gestures, myTurn, onToggle, error, showPreview = true }) {
  const on = gestures.status !== 'off';
  return (
    <section className="panel gesture-panel" aria-label="Gestures">
      {gestures.status === 'on' && showPreview && <GesturePreview gestures={gestures} />}
      <div className="gesture-panel__body">
        <div className="gesture-panel__top">
          <p className="gesture-panel__message" aria-live="polite">
            {gestureMessage(gestures, { myTurn })}
          </p>
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            {gestures.status === 'error' && (
              <button type="button" className="pill pill--sm" onClick={gestures.retry}>
                Try again
              </button>
            )}
            <button type="button" className="pill pill--sm" onClick={onToggle}>
              {on ? 'Turn off gestures' : 'Turn on gestures'}
            </button>
          </div>
        </div>
        {gestures.status === 'on' && gestures.raising && (
          <p className="gesture-panel__raise tabular">
            Raise to <strong>{formatChips(gestures.raiseAmount)}</strong>
          </p>
        )}
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        {on && (
          <ul className="gesture-panel__guide text-small muted">
            {GESTURE_GUIDE.map(({ action, how }) => (
              <li key={action}>
                <strong>{ACTION_LABELS[action]}</strong> {how}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
