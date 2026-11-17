import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { gameApi } from '../api/gameApi.js';
import { ApiError } from '../api/http.js';
import { playerColour } from '../components/Avatar.jsx';
import { Button } from '../components/Button.jsx';
import { formatChips } from '../components/Chips.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { isCompleteCode, normalizeCode } from '../tableCode.js';
import { isPlayerGone, usePlayer } from '../usePlayer.js';
import './WaitingRoomPage.css';

// How often the seats are refreshed, and how players who are not the host find out that the
// game has started (the table's `paused` turns false).
export const POLL_MS = 3000;
const MIN_PLAYERS = 2;

/**
 * /tables/:code. Opening the page joins the table, so the creator, someone who typed the code
 * and someone who opened an invite link all land here the same way. Joining again (a reload)
 * gives you your seat back.
 *
 * Tables are created paused. The host's Start game unpauses it (POST /tables/:id/start), and as
 * soon as the table reads paused: false, everyone here moves to /tables/:code/play.
 */
export function WaitingRoomPage({ pollMs = POLL_MS }) {
  const code = normalizeCode(useParams().code);
  const { playerId, player, startOver } = usePlayer();

  // status: joining | seated | notFound | full | unavailable
  const [status, setStatus] = useState(isCompleteCode(code) ? 'joining' : 'notFound');
  const [table, setTable] = useState(null);
  const [stale, setStale] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isCompleteCode(code)) return undefined;
    let active = true;
    gameApi
      .join(code, playerId)
      .then((result) => {
        if (!active) return;
        setTable(result.table);
        setStatus('seated');
      })
      .catch((err) => {
        if (!active) return;
        if (isPlayerGone(err)) startOver();
        else if (err instanceof ApiError && err.status === 404) setStatus('notFound');
        else if (err instanceof ApiError && err.status === 409) setStatus('full');
        else setStatus('unavailable');
      });
    return () => {
      active = false;
    };
  }, [code, playerId, startOver, attempt]);

  useEffect(() => {
    if (status !== 'seated') return undefined;
    const timer = setInterval(() => {
      gameApi
        .getTable(code)
        .then((latest) => {
          setTable(latest);
          setStale(false);
        })
        .catch((err) => {
          if (err instanceof ApiError && err.status === 404) setStatus('notFound');
          else setStale(true);
        });
    }, pollMs);
    return () => clearInterval(timer);
  }, [status, code, pollMs]);

  // Only the host can start, but everyone follows: on the start response, or on the next refresh.
  async function startGame() {
    const latest = await gameApi.startTable(code, playerId);
    setTable({ ...latest, paused: false });
  }

  // `=== false`, not `!paused`: a table without the field (older game service) never moves on.
  if (status === 'seated' && table?.paused === false) {
    return <Navigate to={`/tables/${code}/play`} replace />;
  }

  return (
    <div className="waiting">
      <TopBar player={player} />
      <main className="waiting__main">
        {status === 'seated' ? (
          <Room
            code={code}
            table={table}
            playerId={playerId}
            player={player}
            stale={stale}
            onStart={startGame}
          />
        ) : (
          <Problem
            status={status}
            code={code}
            onRetry={() => {
              setStatus('joining');
              setAttempt((n) => n + 1);
            }}
          />
        )}
      </main>
    </div>
  );
}

const PROBLEMS = {
  joining: { title: 'Taking your seat…', text: null },
  notFound: {
    title: 'Table not found',
    text: 'This code doesn’t match an open table. The host may have closed it.',
  },
  full: {
    title: 'This table is full',
    text: 'All seats are taken. Ask the host for another table.',
  },
  unavailable: {
    title: 'Tables unavailable',
    text: 'We couldn’t reach the game server. Try again in a moment.',
  },
};

function Problem({ status, code, onRetry }) {
  const { title, text } = PROBLEMS[status];
  return (
    <section className="panel waiting__problem" aria-live="polite">
      {code && <p className="label">Table {code}</p>}
      <h1>{title}</h1>
      {text && <p className="muted">{text}</p>}
      {status !== 'joining' && (
        <div className="row" style={{ gap: 'var(--space-3)' }}>
          {status === 'unavailable' && (
            <Button variant="ink" onClick={onRetry}>
              Try again
            </Button>
          )}
          <Link className="btn btn--outline" to="/lobby">
            Back to lobby
          </Link>
        </div>
      )}
    </section>
  );
}

function Room({ code, table, playerId, player, stale, onStart }) {
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  const seats = Array.from(
    { length: table.maxSeats },
    (_, index) => table.seats.find((seat) => seat.seatIndex === index) ?? null,
  );
  const taken = table.seats.length;
  const host = table.seats.find((seat) => seat.playerId === table.createdBy);
  const isHost = table.createdBy === playerId;
  const hostName = isHost ? 'You' : (host?.name ?? 'The host');

  return (
    <>
      <div className="waiting__head">
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <Link className="waiting__back" to="/lobby">
            ← Back to lobby
          </Link>
          <h1>Waiting room</h1>
          <p className="muted">
            Waiting for players · {taken} of {table.maxSeats} seats taken
          </p>
        </div>
        <InviteCard code={code} />
      </div>

      {stale && (
        <div className="banner" role="status">
          Tables unavailable. Seats may be out of date; we keep trying.
        </div>
      )}

      <div className="waiting__grid">
        <ol className="waiting__seats" aria-label="Seats">
          {seats.map((seat, index) => (
            <SeatTile
              key={index}
              seat={seat}
              isYou={seat?.playerId === playerId}
              isHost={seat?.playerId === table.createdBy}
              colour={
                seat?.playerId === playerId && player ? player.avatar : (seat?.playerId ?? index)
              }
            />
          ))}
        </ol>

        <aside className="waiting__side">
          <section className="panel waiting__settings" aria-labelledby="waiting-settings">
            <h2 id="waiting-settings">Table settings</h2>
            <dl>
              <div>
                <dt className="muted">Blinds</dt>
                <dd>
                  {formatChips(table.smallBlind)} / {formatChips(table.bigBlind)}
                </dd>
              </div>
              <div>
                <dt className="muted">Starting stack</dt>
                <dd>{formatChips(table.startingStack)}</dd>
              </div>
              <div>
                <dt className="muted">Seats</dt>
                <dd>{table.maxSeats}</dd>
              </div>
              <div>
                <dt className="muted">Host</dt>
                <dd>{isHost ? `${host?.name ?? 'You'} (you)` : hostName}</dd>
              </div>
            </dl>
          </section>

          {isHost ? (
            <div className="stack waiting__start">
              <Button
                variant="lime"
                size="hero"
                block
                disabled={taken < MIN_PLAYERS || starting}
                onClick={async () => {
                  setStarting(true);
                  setStartError(null);
                  try {
                    await onStart(); // On success this page moves to the table.
                  } catch (err) {
                    setStartError(err instanceof ApiError ? err.message : 'Tables unavailable');
                    setStarting(false);
                  }
                }}
              >
                {starting ? 'Starting…' : 'Start game'}
              </Button>
              {startError && (
                <p className="field__error" role="alert">
                  {startError}
                </p>
              )}
              {taken < MIN_PLAYERS && (
                <p className="text-small muted">
                  You need at least {MIN_PLAYERS} players to start.
                </p>
              )}
            </div>
          ) : (
            <p className="panel waiting__host-note">Waiting for {hostName} to start the game.</p>
          )}
        </aside>
      </div>
    </>
  );
}

function InviteCard({ code }) {
  const [copy, setCopy] = useState('idle'); // idle | copied | failed
  const link = `${window.location.origin}/tables/${code}`;

  useEffect(() => {
    if (copy === 'idle') return undefined;
    const timer = setTimeout(() => setCopy('idle'), 2500);
    return () => clearTimeout(timer);
  }, [copy]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  }

  return (
    <section className="waiting__invite" aria-label="Invite friends">
      <div>
        <p className="label">Table code</p>
        <p className="waiting__code">{code}</p>
      </div>
      <div className="stack" style={{ gap: 'var(--space-1)', alignItems: 'flex-end' }}>
        <Button variant="lime" onClick={copyLink}>
          {copy === 'copied' ? 'Link copied' : 'Copy invite link'}
        </Button>
        <span className="waiting__copy-note" role="status">
          {copy === 'failed' && `Copy this link: ${link}`}
        </span>
      </div>
    </section>
  );
}

function SeatTile({ seat, isYou, isHost, colour }) {
  if (!seat) {
    return (
      <li className="waiting__seat waiting__seat--empty">
        <span className="waiting__empty-title">Empty seat</span>
        <span className="text-small muted">Waiting for a friend</span>
      </li>
    );
  }
  return (
    <li className="waiting__seat" style={{ '--seat-colour': playerColour(colour) }}>
      <svg className="waiting__silhouette" viewBox="0 0 120 90" aria-hidden="true">
        <circle cx="60" cy="34" r="16" />
        <path d="M26 90c0-20 15-32 34-32s34 12 34 32Z" />
      </svg>
      {isHost && <span className="waiting__badge">Host</span>}
      <span className="waiting__name">
        {seat.name}
        {isYou && ' (you)'}
      </span>
    </li>
  );
}
