import { useEffect, useId, useRef } from 'react';
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

/**
 * My own camera, mirrored, with the ring on top (the panel here and the gesture tutorial).
 * `children`, when given, is laid over the camera instead of the ring.
 */
export function GesturePreview({ gestures, children }) {
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
      {children ?? <GestureHold gestures={gestures} />}
    </div>
  );
}

// Line icons for the cheat sheet (20px, 2px stroke, like src/components/Icon.jsx).
const GUIDE_ICONS = {
  check: <path d="M9 4v9M15 4v9M4 19h16" />,
  call: (
    <>
      <path d="M7 10v11" />
      <path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.5l-2.3 7A2 2 0 0 1 17.5 21H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3l3.6-7a2.4 2.4 0 0 1 4.4 1.9Z" />
    </>
  ),
  fold: (
    <g transform="matrix(1 0 0 -1 0 24)">
      <path d="M7 10v11" />
      <path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.5l-2.3 7A2 2 0 0 1 17.5 21H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3l3.6-7a2.4 2.4 0 0 1 4.4 1.9Z" />
    </g>
  ),
  raise: <path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" />,
  allin: <path d="m4 7 5 5-5 5M11 7l5 5-5 5M20 6v12" />,
};

function GuideIcon({ action }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GUIDE_ICONS[action]}
    </svg>
  );
}

// The guide text without its trailing emoji: the card draws a line icon instead.
const withoutEmoji = (text) => text.replace(/\s*\p{Extended_Pictographic}.*$/u, '');

/** Short status next to the panel title. */
function gestureStatus(gestures) {
  if (gestures.status === 'off') return 'Off';
  if (gestures.status === 'starting') return 'Starting…';
  if (gestures.status === 'error') return 'Camera problem';
  return gestures.hand ? 'Hand tracked' : 'Camera on';
}

/**
 * Gesture card for the table's side column: status, what to do next, the gestures cheat sheet
 * and an on/off switch. The buttons in the action bar always work as well.
 * showPreview false leaves out the camera preview, when my video tile already shows my camera
 * and the ring (GestureHold) is drawn on it instead.
 * legal: the actions I can take right now (null when it is not my turn), to dim the others.
 * toCall: the amount a call costs, shown on the Call row.
 * guideOpen / onGuideToggle: fold the cheat sheet away (the table starts with it folded). Without
 * onGuideToggle the cheat sheet is always shown.
 */
export function GesturePanel({
  gestures,
  myTurn,
  onToggle,
  error,
  showPreview = true,
  legal = null,
  toCall = 0,
  guideOpen = true,
  onGuideToggle,
}) {
  const guideId = useId();
  const showGuide = !onGuideToggle || guideOpen;
  const on = gestures.status !== 'off';
  const live = gestures.status === 'on';
  return (
    <section className="panel gesture-panel" aria-labelledby="gesture-panel-title">
      <div className="gesture-panel__head">
        <h2 id="gesture-panel-title" className="gesture-panel__title">
          Gestures
        </h2>
        <span className={live ? 'status-dot' : 'status-dot gesture-panel__status--idle'}>
          {gestureStatus(gestures)}
        </span>
      </div>

      {live && showPreview && <GesturePreview gestures={gestures} />}

      <p className="gesture-panel__message" aria-live="polite">
        {gestureMessage(gestures, { myTurn })}
      </p>
      {live && gestures.raising && (
        <p className="gesture-panel__raise tabular">
          Raise to <strong>{formatChips(gestures.raiseAmount)}</strong>
        </p>
      )}
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      {on && showGuide && (
        <ul className="gesture-panel__guide" id={guideId}>
          {GESTURE_GUIDE.map(({ action, how }) => {
            const unavailable = legal !== null && !legal.includes(action);
            const holding = live && gestures.action === action;
            const classes = [
              'gesture-panel__item',
              holding && 'gesture-panel__item--holding',
              unavailable && 'gesture-panel__item--unavailable',
            ]
              .filter(Boolean)
              .join(' ');
            let title = ACTION_LABELS[action];
            if (action === 'call' && legal?.includes('call') && toCall > 0) {
              title = `Call ${formatChips(toCall)}`;
            }
            return (
              <li key={action} className={classes}>
                <span className="gesture-panel__icon">
                  <GuideIcon action={action} />
                </span>
                <span className="gesture-panel__text">
                  <strong>
                    {title}
                    {unavailable && ' (not available now)'}
                  </strong>
                  <span>{withoutEmoji(how)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="row gesture-panel__actions">
        {gestures.status === 'error' && (
          <button type="button" className="pill pill--sm" onClick={gestures.retry}>
            Try again
          </button>
        )}
        <button type="button" className="pill pill--sm" onClick={onToggle}>
          {on ? 'Turn off gestures' : 'Turn on gestures'}
        </button>
        {on && onGuideToggle && (
          <button
            type="button"
            className="pill pill--sm gesture-panel__guide-toggle"
            aria-expanded={guideOpen}
            aria-controls={guideId}
            onClick={onGuideToggle}
          >
            {guideOpen ? 'Hide guide' : 'Show all gestures'}
          </button>
        )}
      </div>
    </section>
  );
}
