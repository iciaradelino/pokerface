import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../src/components/Button.jsx';
import { formatChips } from '../src/components/Chips.jsx';
import { Icon } from '../src/components/Icon.jsx';
import { TopBar } from '../src/components/TopBar.jsx';
import { normalizeCode } from '../src/tableCode.js';
import { formatHold, holdMsOf } from '../src/gestureSettings.js';
import { usePlayer } from '../src/usePlayer.js';
import {
  ACTION_LABELS,
  GESTURE_GUIDE,
  GesturePreview,
  GestureRing,
  gestureMessage,
} from './GesturePanel.jsx';
import { TIMING } from './detector.js';
import { useGestures } from './useGestures.js';
import './GestureTutorial.css';

// Every action is allowed while practising, with a raise between 20 and 1,000.
export const PRACTICE_TURN = Object.freeze({
  legalActions: ['check', 'call', 'fold', 'raise', 'allin'],
  minRaise: 20,
  maxRaise: 1000,
  step: 10,
});

const DONE_KEY = 'pokerface.gestureTutorialDone';

/** True once this device finished the tutorial (the waiting room words its link with it). */
export function tutorialDone() {
  try {
    return localStorage.getItem(DONE_KEY) === 'yes';
  } catch {
    return false;
  }
}

function markTutorialDone() {
  try {
    localStorage.setItem(DONE_KEY, 'yes');
  } catch {
    // Private mode or storage blocked: the tutorial still works, it is just offered again.
  }
}

/**
 * Where to go after the tutorial. `next` comes from the address, so anyone can write it: it is
 * only ever a waiting room ("/tables/<code>") or the main menu. Anything else, including every way of
 * writing another site ("//", "\", "..", tabs, encoded characters), goes to the main menu. The path is
 * rebuilt from the table code instead of reusing what was passed in.
 */
export function nextPath(value) {
  if (value === '/profile') return '/profile'; // "Recalibrate" on the profile page
  const match = /^\/tables\/([A-Za-z0-9]{6})$/.exec(typeof value === 'string' ? value : '');
  return match ? `/tables/${normalizeCode(match[1])}` : '/menu';
}

const describe = (action, amount) =>
  action === 'raise' && amount ? `Raise to ${formatChips(amount)}` : ACTION_LABELS[action];

/**
 * What the tutorial shows for each gesture: an icon, the gesture in a few words, what it does
 * (with the player's own hold time) and what it stands for at a real table.
 */
export const LESSONS = {
  check: {
    icon: 'peace',
    short: 'Peace sign',
    explain: (hold) =>
      `Show a peace sign (index and middle finger up, palm or back of the hand) and hold it for ${hold} to pass without betting.`,
    realTable: 'tapping the table',
  },
  call: {
    icon: 'thumbsUp',
    short: 'Thumbs up',
    explain: (hold) => `Show a thumbs up and hold it for ${hold} to match the bet.`,
    realTable: 'pushing in chips to match',
  },
  fold: {
    icon: 'thumbsDown',
    short: 'Thumbs down',
    explain: (hold) => `Show a thumbs down and hold it for ${hold} to give up this hand.`,
    realTable: 'mucking your cards',
  },
  raise: {
    icon: 'upDown',
    short: 'Open palm, then fist',
    explain: () =>
      'Open your palm and move it up or down to pick the amount, then close your fist to confirm.',
    realTable: 'saying “raise” and counting out chips',
  },
  allin: {
    icon: 'allIn',
    short: 'Thumb, index and little finger out',
    explain: (hold) =>
      `Hold out your thumb, index and little finger for ${hold} to bet everything.`,
    realTable: 'pushing your whole stack forward',
  },
};

const TIPS = [
  'Face a light, not a window',
  'Keep your hand inside the frame',
  'Buttons always work if a gesture doesn’t',
];

/**
 * /tutorial?next=<path>. Practise each gesture and see when it is recognised (issue #13).
 * Nothing is sent to the game: it only uses the camera on this device. "Next gesture" moves the
 * current one to the end, to come back to it later. Skip, or Continue at the end, goes to `next`
 * (the waiting room or profile it came from) or the main menu.
 */
export function GestureTutorial() {
  const [params] = useSearchParams();
  const next = nextPath(params.get('next'));
  const { player } = usePlayer();
  return (
    <div className="tutorial">
      <TopBar player={player} />
      <main className="tutorial__main">
        <GesturePractice player={player} next={next} />
      </main>
    </div>
  );
}

export function GesturePractice({ player, next, onExit, onComplete, video }) {
  const inRoom = Boolean(onExit);
  const lessonTitle = useRef(null);

  useEffect(() => {
    if (inRoom) lessonTitle.current?.focus({ preventScroll: true });
  }, [inRoom]);
  const holdMs = holdMsOf(player);
  const [order, setOrder] = useState(() => GESTURE_GUIDE.map((step) => step.action));
  const [done, setDone] = useState([]);
  const [last, setLast] = useState(null); // { action, amount, right }

  const left = order.filter((action) => !done.includes(action));
  const current = left[0] ?? null;
  const finished = current === null;

  const cameraError = ['denied', 'unavailable'].includes(video?.camera) ? video.camera : null;
  const gestures = useGestures({
    enabled: !finished,
    stream: video?.local,
    cameraPending: video?.camera === 'asking',
    cameraError,
    turn: PRACTICE_TURN,
    holdMs,
    onFire: (action, amount) => {
      const right = action === current;
      setLast({ action, amount, right });
      if (!right) return;
      const nowDone = [...done, action];
      if (nowDone.length === GESTURE_GUIDE.length) {
        markTutorialDone();
        if (onComplete) {
          onComplete();
          return;
        }
      }
      setDone(nowDone);
    },
  });

  function nextGesture() {
    setOrder((now) => [...now.filter((action) => action !== current), current]);
    setLast(null);
  }

  return (
    <>
      {!inRoom && (
        <div className="tutorial__head">
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            <h1>Learn the gestures</h1>
            <p className="muted">
              Five signals, about a minute. Hold each one until the ring fills.
            </p>
          </div>
          <LearnedBar learned={done.length} total={GESTURE_GUIDE.length} />
        </div>
      )}

      {finished ? (
        <section className="panel tutorial__finished" aria-labelledby="tutorial-finished">
          <h2 id="tutorial-finished">You&rsquo;re ready ✓</h2>
          <p className="muted">
            You did all five gestures. At the table they work on your turn, and the buttons always
            work too.
          </p>
          <Link className="btn btn--lime btn--primary-size" to={next}>
            Continue
          </Link>
        </section>
      ) : (
        <div className="tutorial__grid">
          <div className="tutorial__left">
            <CameraStage
              gestures={gestures}
              previewStream={video?.local}
              current={current}
              holdMs={holdMs}
              retry={cameraError ? video.retry : gestures.retry}
            />
            {!inRoom && (
              <ul className="tutorial__tips" aria-label="Tips">
                {TIPS.map((tip) => (
                  <li key={tip} className="tutorial__tip">
                    {tip}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="tutorial__right">
            {inRoom && <LearnedBar learned={done.length} total={GESTURE_GUIDE.length} />}
            <section className="tutorial__now" aria-labelledby="tutorial-now">
              <p className="tutorial__now-label">Now practising</p>
              <div className="tutorial__now-title">
                <span className="tutorial__now-icon">
                  <Icon name={LESSONS[current].icon} size={26} />
                </span>
                <h2 id="tutorial-now" ref={lessonTitle} tabIndex={inRoom ? -1 : undefined}>
                  {ACTION_LABELS[current]}
                </h2>
              </div>
              <p>{LESSONS[current].explain(formatHold(holdMs).replace(' ', ' '))}</p>
              <p className="text-small tutorial__now-real">
                At a real table: {LESSONS[current].realTable}
              </p>
              {last && (
                <p
                  className={
                    last.right
                      ? 'tutorial__feedback'
                      : 'tutorial__feedback tutorial__feedback--wrong'
                  }
                  role="status"
                >
                  {last.right
                    ? `✓ ${describe(last.action, last.amount)} recognised.`
                    : `That was ${describe(last.action, last.amount)}. Try ${ACTION_LABELS[current]}.`}
                </p>
              )}
            </section>

            <section className="panel tutorial__steps" aria-label="All gestures">
              <ol className="tutorial__list">
                {GESTURE_GUIDE.map(({ action }) => {
                  const state = done.includes(action)
                    ? 'learned'
                    : action === current
                      ? 'now'
                      : 'next';
                  return (
                    <li
                      key={action}
                      className={`tutorial__item tutorial__item--${state}`}
                      aria-current={state === 'now' ? 'step' : undefined}
                    >
                      <span className="tutorial__item-icon">
                        <Icon name={LESSONS[action].icon} />
                      </span>
                      <span className="tutorial__item-text">
                        <span className="tutorial__item-name">{ACTION_LABELS[action]}</span>
                        <span className="text-small muted">{LESSONS[action].short}</span>
                      </span>
                      <span className={`tutorial__badge tutorial__badge--${state}`}>
                        {state === 'learned' ? 'Learned' : state === 'now' ? 'Now' : 'Next'}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>

            <div className="tutorial__actions">
              {inRoom ? (
                <Button variant="outline" onClick={onExit}>
                  Exit practice
                </Button>
              ) : (
                <Link className="btn btn--outline" to={next}>
                  Skip for now
                </Link>
              )}
              <button
                type="button"
                className="btn btn--lime"
                onClick={nextGesture}
                disabled={left.length < 2}
              >
                Next gesture
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** "2 of 5 learned" with a bar. */
function LearnedBar({ learned, total }) {
  return (
    <div className="tutorial__learned">
      <span className="tutorial__learned-text tabular">
        {learned} of {total} learned
      </span>
      <span
        className="tutorial__bar"
        role="progressbar"
        aria-label="Gestures learned"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={learned}
      >
        <span className="tutorial__bar-fill" style={{ width: `${(learned / total) * 100}%` }} />
      </span>
    </div>
  );
}

/**
 * The big camera picture: a "Hand tracked" badge, and a pill at the bottom with the hold ring,
 * the gesture being held and the seconds left. Before the camera is on, or when it cannot be
 * used, the message and a way to try again take its place.
 */
function CameraStage({ gestures, previewStream, current, holdMs, retry }) {
  const message = gestureMessage(gestures, { myTurn: true });
  if (gestures.status !== 'on') {
    const notice = (
      <>
        <p className="tutorial__stage-message" aria-live="polite">
          {message}
        </p>
        {gestures.status === 'error' && (
          <button type="button" className="btn btn--outline" onClick={retry}>
            Try again
          </button>
        )}
      </>
    );
    return previewStream ? (
      <section className="tutorial__stage">
        <GesturePreview gestures={{ stream: previewStream }}>
          <div className="tutorial__hold tutorial__hold--notice">{notice}</div>
        </GesturePreview>
      </section>
    ) : (
      <section className="tutorial__stage tutorial__stage--off" aria-label="Your camera">
        {notice}
      </section>
    );
  }

  const { action, progress, raising, raiseAmount } = gestures;
  let title = message;
  let detail = `Try: ${LESSONS[current].short.toLowerCase()}`;
  if (action) {
    const total = action === 'raise' ? TIMING.raiseConfirmMs : holdMs;
    title = action === 'raise' ? `Raise ${formatChips(raiseAmount)}` : LESSONS[action].short;
    detail = `Keep holding… ${(((1 - progress) * total) / 1000).toFixed(1)} s`;
  } else if (raising) {
    title = `Raise ${formatChips(raiseAmount)}`;
    detail = 'Move up or down, then close your fist';
  } else if (gestures.cooling) {
    detail = 'Recognised';
  }

  return (
    <section className="tutorial__stage" aria-label="Your camera">
      <GesturePreview gestures={gestures}>
        <span
          className={
            gestures.hand ? 'tutorial__tracked' : 'tutorial__tracked tutorial__tracked--off'
          }
        >
          {gestures.hand ? 'Hand tracked' : 'No hand in view'}
        </span>
        <div className="tutorial__hold" aria-live="polite">
          <GestureRing action={action ?? 'none'} progress={action ? progress : 0} size={44} />
          <span className="stack" style={{ gap: 0 }}>
            <span className="tutorial__hold-title">{title}</span>
            <span className="tutorial__hold-detail tabular">{detail}</span>
          </span>
        </div>
      </GesturePreview>
    </section>
  );
}
