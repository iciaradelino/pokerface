import { useEffect, useId, useState } from 'react';
import { gameApi } from '../api/gameApi.js';
import { ApiError } from '../api/http.js';
import { Button } from '../components/Button.jsx';
import { formatChips } from '../components/Chips.jsx';
import { isPlayerGone } from '../usePlayer.js';
import { formatClock, potRaise, secondsLeft } from './tableView.js';

const QUICK_RAISES = [
  { label: '½ Pot', fraction: 0.5 },
  { label: 'Pot', fraction: 1 },
  { label: '2× Pot', fraction: 2 },
];

/** Ticks once a second while there is a turn timer, so the clock counts down. */
function useSecondsLeft(timerEndsAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timerEndsAt) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [timerEndsAt]);
  return secondsLeft(timerEndsAt, now);
}

/**
 * The fallback buttons and raise slider. They are always there, so you can play without
 * gestures. Remounted (via `key`) on every new turn, so the raise amount starts at the minimum.
 * Gestures (Ali) send the same actions through gameApi.act.
 */
export function ActionBar({
  code,
  playerId,
  state,
  mine,
  pot,
  bigBlind,
  waitingFor,
  onPlayerGone,
}) {
  const sliderId = useId();
  const legal = new Set(mine?.legalActions ?? []);
  const myTurn = legal.size > 0 && state?.currentPlayer === playerId;
  const me = state?.seats.find((seat) => seat.playerId === playerId);
  const canRaise = myTurn && legal.has('raise') && mine.minRaise !== null;

  // The amount you picked, or null for the minimum. Kept within the current limits, because the
  // "state" and "private" messages of a new turn arrive one after the other.
  const [picked, setPicked] = useState(null);
  const raiseTo = canRaise
    ? Math.min(Math.max(picked ?? mine.minRaise, mine.minRaise), mine.maxRaise)
    : 0;
  const setRaiseTo = setPicked;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const seconds = useSecondsLeft(myTurn ? state.timerEndsAt : null);

  async function send(action, amount) {
    setSending(true);
    setError(null);
    try {
      await gameApi.act(code, playerId, action, amount);
      // The socket sends the new state and a new turn, which resets this bar.
    } catch (err) {
      if (isPlayerGone(err)) return onPlayerGone();
      setError(err instanceof ApiError ? err.message : 'Tables unavailable');
      setSending(false);
    }
  }

  const disabled = (action) => !myTurn || sending || !legal.has(action);
  const limits = canRaise
    ? {
        pot,
        toCall: mine.toCall,
        myBet: me?.bet ?? 0,
        minRaise: mine.minRaise,
        maxRaise: mine.maxRaise,
      }
    : null;

  let heading;
  if (myTurn) heading = seconds === null ? 'Your turn' : `Your turn · ${formatClock(seconds)}`;
  else if (me?.status === 'folded') heading = 'You folded';
  else if (waitingFor) heading = `Waiting for ${waitingFor}`;
  else heading = 'Waiting for the next hand';

  return (
    <section className="panel action-bar" aria-label="Your actions">
      <div className="action-bar__top">
        <div className="action-bar__status">
          <p
            className={
              myTurn ? 'action-bar__heading action-bar__heading--turn' : 'action-bar__heading'
            }
          >
            {heading}
          </p>
          <p className="text-small muted">
            {myTurn ? 'Gesture or tap a button' : 'Your buttons light up on your turn'}
          </p>
        </div>

        <div className="action-bar__raise">
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            {QUICK_RAISES.map(({ label, fraction }) => {
              const amount = limits ? potRaise(fraction, limits) : null;
              return (
                <button
                  key={label}
                  type="button"
                  className="pill pill--sm"
                  aria-pressed={amount !== null && amount === raiseTo}
                  disabled={!canRaise || sending}
                  onClick={() => setRaiseTo(amount)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="action-bar__slider">
            <label className="text-small muted" htmlFor={sliderId}>
              Raise to
            </label>
            <input
              id={sliderId}
              type="range"
              className="range"
              min={canRaise ? mine.minRaise : 0}
              max={canRaise ? mine.maxRaise : 0}
              step={Math.max(1, Math.min(bigBlind, canRaise ? mine.maxRaise - mine.minRaise : 1))}
              value={canRaise ? raiseTo : 0}
              disabled={!canRaise || sending}
              onChange={(e) => setRaiseTo(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      <div className="action-bar__buttons">
        <Button
          variant="outline"
          size="primary"
          disabled={disabled('fold')}
          onClick={() => send('fold')}
        >
          Fold
        </Button>
        <Button
          variant="outline"
          size="primary"
          disabled={disabled('check')}
          onClick={() => send('check')}
        >
          Check
        </Button>
        <Button
          variant="call"
          size="primary"
          disabled={disabled('call')}
          onClick={() => send('call')}
        >
          {myTurn && legal.has('call') ? `Call ${formatChips(mine.toCall)}` : 'Call'}
        </Button>
        <Button
          variant="lime"
          size="primary"
          disabled={!canRaise || sending}
          onClick={() => send('raise', raiseTo)}
        >
          {canRaise ? `Raise to ${formatChips(raiseTo)}` : 'Raise'}
        </Button>
        <Button
          variant="outline"
          size="primary"
          disabled={disabled('allin')}
          onClick={() => send('allin')}
        >
          All-in
        </Button>
      </div>

      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
