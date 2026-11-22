import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { formatChips } from '../src/components/Chips.jsx';
import { TopBar } from '../src/components/TopBar.jsx';
import { normalizeCode } from '../src/tableCode.js';
import { usePlayer } from '../src/usePlayer.js';
import { ACTION_LABELS, GESTURE_GUIDE, GesturePreview, gestureMessage } from './GesturePanel.jsx';
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
 * only ever a waiting room ("/tables/<code>") or the lobby. Anything else, including every way of
 * writing another site ("//", "\", "..", tabs, encoded characters), goes to the lobby. The path is
 * rebuilt from the table code instead of reusing what was passed in.
 */
export function nextPath(value) {
  const match = /^\/tables\/([A-Za-z0-9]{6})$/.exec(typeof value === 'string' ? value : '');
  return match ? `/tables/${normalizeCode(match[1])}` : '/lobby';
}

const describe = (action, amount) =>
  action === 'raise' && amount ? `Raise to ${formatChips(amount)}` : ACTION_LABELS[action];

/**
 * /tutorial?next=<path>. Practise each gesture in the order of the guide and see when it is
 * recognised (issue #13). Nothing is sent to the game: it only uses the camera on this device.
 * Skip, or Continue at the end, goes to `next` (the waiting room it came from) or the lobby.
 */
export function GestureTutorial() {
  const [params] = useSearchParams();
  const next = nextPath(params.get('next'));
  const { player } = usePlayer();
  const [done, setDone] = useState([]);
  const [last, setLast] = useState(null); // { action, amount, right }

  const current = GESTURE_GUIDE.find((step) => !done.includes(step.action)) ?? null;
  const finished = current === null;

  const gestures = useGestures({
    enabled: !finished, // the camera goes off once every gesture is done
    turn: PRACTICE_TURN,
    onFire: (action, amount) => {
      const right = action === current?.action;
      setLast({ action, amount, right });
      if (!right) return;
      const nowDone = [...done, action];
      setDone(nowDone);
      if (nowDone.length === GESTURE_GUIDE.length) markTutorialDone();
    },
  });

  return (
    <div className="tutorial">
      <TopBar player={player} />
      <main className="tutorial__main">
        <div className="tutorial__head">
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            <h1>Practise the gestures</h1>
            <p className="muted">
              Show each gesture to your camera and hold it until the ring fills. This is only
              practice: nothing is sent to the table.
            </p>
          </div>
          {!finished && (
            <Link className="btn btn--outline" to={next}>
              Skip the tutorial
            </Link>
          )}
        </div>

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
            <section className="panel tutorial__camera" aria-label="Your camera">
              {gestures.status === 'on' ? (
                <GesturePreview gestures={gestures} />
              ) : (
                <div className="tutorial__no-camera" />
              )}
              <p className="tutorial__message" aria-live="polite">
                {gestureMessage(gestures, { myTurn: true })}
              </p>
              {gestures.status === 'error' && (
                <button type="button" className="pill pill--sm" onClick={gestures.retry}>
                  Try again
                </button>
              )}
            </section>

            <section className="panel tutorial__steps" aria-labelledby="tutorial-steps">
              <h2 id="tutorial-steps">
                {done.length} of {GESTURE_GUIDE.length} done
              </h2>
              <p className="tutorial__now">
                Now: <strong>{ACTION_LABELS[current.action]}</strong> {current.how}
              </p>
              {last && (
                <p
                  className={last.right ? 'tutorial__feedback' : 'tutorial__feedback--wrong'}
                  role="status"
                >
                  {last.right
                    ? `✓ ${describe(last.action, last.amount)} recognised.`
                    : `That was ${describe(last.action, last.amount)}. Try ${ACTION_LABELS[current.action]}.`}
                </p>
              )}
              <ol className="tutorial__list">
                {GESTURE_GUIDE.map(({ action, how }) => {
                  const isDone = done.includes(action);
                  const isNow = action === current.action;
                  return (
                    <li
                      key={action}
                      className={isNow ? 'tutorial__item tutorial__item--now' : 'tutorial__item'}
                      aria-current={isNow ? 'step' : undefined}
                    >
                      <span className="tutorial__tick" aria-hidden="true">
                        {isDone ? '✓' : ''}
                      </span>
                      <span>
                        <strong>{ACTION_LABELS[action]}</strong> {how}
                        {isDone && <span className="tutorial__done"> Done</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
