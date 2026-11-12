import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { gameApi } from '../api/gameApi.js';
import { ApiError } from '../api/http.js';
import { playersApi } from '../api/playersApi.js';
import { Avatar } from '../components/Avatar.jsx';
import { Button } from '../components/Button.jsx';
import { formatChips } from '../components/Chips.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { CODE_LENGTH, isCompleteCode, normalizeCode } from '../tableCode.js';
import { isPlayerGone, usePlayer } from '../usePlayer.js';
import './LobbyPage.css';

// Blind levels offered when starting a table. Every table starts with the service defaults:
// 1,000 chips each and up to 6 seats.
export const BLINDS = [
  { small: 5, big: 10 },
  { small: 10, big: 20 },
  { small: 25, big: 50 },
];
const STARTING_STACK = 1000;
const MAX_SEATS = 6;

export function LobbyPage() {
  const navigate = useNavigate();
  const { playerId, player, unavailable: playerUnavailable, startOver } = usePlayer();
  const [board, setBoard] = useState({ status: 'loading', rows: [] });

  useEffect(() => {
    let active = true;
    playersApi
      .leaderboard()
      .then((rows) => active && setBoard({ status: 'ready', rows }))
      .catch(() => active && setBoard({ status: 'error', rows: [] }));
    return () => {
      active = false;
    };
  }, []);

  const rankIndex = board.rows.findIndex((row) => row.id === playerId);
  const rank = rankIndex === -1 ? null : rankIndex + 1;

  return (
    <div className="lobby">
      <TopBar player={player} />

      <main className="lobby__main">
        <div className="lobby__intro">
          <h1>{player ? `Hey ${player.name}, ready to play?` : 'Ready to play?'}</h1>
          <p className="muted">
            Start a private table and send the code, or join one a friend made.
          </p>
        </div>

        {playerUnavailable && (
          <div className="banner" role="alert">
            Player service unavailable. You can still start or join a table once it is back.
          </div>
        )}

        <div className="lobby__grid">
          <StartTable
            playerId={playerId}
            onOpen={(code) => navigate(`/tables/${code}`)}
            onPlayerGone={startOver}
          />
          <JoinTable
            playerId={playerId}
            onOpen={(code) => navigate(`/tables/${code}`)}
            onPlayerGone={startOver}
          />

          <aside className="lobby__side" aria-label="You and the leaderboard">
            <ProfileCard player={player} rank={rank} />
            <Leaderboard board={board} playerId={playerId} player={player} />
          </aside>
        </div>
      </main>
    </div>
  );
}

function StartTable({ playerId, onOpen, onPlayerGone }) {
  const [blinds, setBlinds] = useState(0);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const { small, big } = BLINDS[blinds];
      const table = await gameApi.createTable(playerId, { smallBlind: small, bigBlind: big });
      onOpen(table.id);
    } catch (err) {
      if (isPlayerGone(err)) return onPlayerGone();
      setError(err instanceof ApiError ? err.message : 'Tables unavailable');
      setCreating(false);
    }
  }

  return (
    <form className="panel panel--feature lobby__start" onSubmit={handleSubmit}>
      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        <h2>Start a table</h2>
        <p className="lobby__on-teal">
          You&apos;ll get a code to share with up to {MAX_SEATS - 1} friends.
        </p>
      </div>

      <fieldset className="lobby__fieldset">
        <legend className="lobby__small-label">Blinds</legend>
        <div className="row lobby__blinds">
          {BLINDS.map(({ small, big }, index) => (
            <label key={big} className="lobby__blind">
              <input
                type="radio"
                name="blinds"
                className="visually-hidden"
                checked={blinds === index}
                onChange={() => setBlinds(index)}
              />
              {small} / {big}
            </label>
          ))}
        </div>
      </fieldset>

      <dl className="lobby__facts">
        <div>
          <dt className="lobby__small-label">Starting stack</dt>
          <dd>{formatChips(STARTING_STACK)}</dd>
        </div>
        <div>
          <dt className="lobby__small-label">Seats</dt>
          <dd>2–{MAX_SEATS}</dd>
        </div>
      </dl>

      {error && (
        <p className="lobby__error lobby__error--on-teal" role="alert">
          {error}
        </p>
      )}

      <div>
        <Button type="submit" variant="lime" size="primary" disabled={creating}>
          {creating ? 'Creating table…' : 'Create private table'}
        </Button>
      </div>
    </form>
  );
}

function JoinTable({ playerId, onOpen, onPlayerGone }) {
  const ids = { code: useId(), help: useId() };
  const input = useRef(null);
  const [code, setCode] = useState('');
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isCompleteCode(code)) {
      setError(`Table codes are ${CODE_LENGTH} letters or numbers.`);
      input.current?.focus();
      return;
    }
    setJoining(true);
    setError(null);
    try {
      await gameApi.join(code, playerId);
      onOpen(code);
    } catch (err) {
      if (isPlayerGone(err)) return onPlayerGone();
      if (err instanceof ApiError && err.status === 404) {
        setError('No table with that code. Check it with the host.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Tables unavailable');
      }
      setJoining(false);
      input.current?.focus();
    }
  }

  const cells = Array.from({ length: CODE_LENGTH }, (_, i) => code[i] ?? '');
  const activeCell = Math.min(code.length, CODE_LENGTH - 1);

  return (
    <form className="panel lobby__join" onSubmit={handleSubmit} noValidate>
      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        <h2>Join with a code</h2>
        <p className="muted">Ask the host for the {CODE_LENGTH}-character table code.</p>
      </div>

      <div className="field">
        <label className="visually-hidden" htmlFor={ids.code}>
          Table code
        </label>
        {/* One real input for typing and pasting; the boxes only draw what it holds. */}
        <div className="lobby__code" onClick={() => input.current?.focus()}>
          {cells.map((char, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={[
                'lobby__code-cell',
                char && 'lobby__code-cell--filled',
                focused && i === activeCell && 'lobby__code-cell--active',
                error && 'lobby__code-cell--invalid',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {char}
            </span>
          ))}
          <input
            ref={input}
            id={ids.code}
            className="lobby__code-input"
            value={code}
            onChange={(e) => {
              setCode(normalizeCode(e.target.value));
              if (error) setError(null);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck="false"
            maxLength={CODE_LENGTH + 4}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? ids.help : undefined}
          />
        </div>
        {error && (
          <span id={ids.help} className="field__error" role="alert">
            {error}
          </span>
        )}
      </div>

      <div>
        <Button type="submit" variant="ink" size="primary" disabled={joining}>
          {joining ? 'Joining…' : 'Join table'}
        </Button>
      </div>
    </form>
  );
}

function ProfileCard({ player, rank }) {
  return (
    <section className="panel panel--dark lobby__profile" aria-label="Your player">
      <div className="row" style={{ gap: 'var(--space-3)' }}>
        <Avatar name={player?.name ?? ''} colourKey={player?.avatar} />
        <div>
          <p className="lobby__profile-name">{player?.name ?? '…'}</p>
          <p className="text-small muted">
            {rank ? `Rank #${rank} on the leaderboard` : 'Play hands to climb the leaderboard'}
          </p>
        </div>
      </div>
      <div className="lobby__stats">
        <div className="stat">
          <span className="label">Chips</span>
          <span className="stat__value lobby__stat-lime">
            {player ? formatChips(player.chips) : '–'}
          </span>
        </div>
        <div className="stat">
          <span className="label">Rank</span>
          <span className="stat__value">{rank ? `#${rank}` : '–'}</span>
        </div>
      </div>
    </section>
  );
}

function Leaderboard({ board, playerId, player }) {
  return (
    <section className="panel lobby__board" aria-labelledby="lobby-board-title">
      <div className="lobby__board-head">
        <h2 id="lobby-board-title">Leaderboard</h2>
        <span className="text-small muted">Top 10 by chips</span>
      </div>

      {board.status === 'loading' && <p className="muted">Loading…</p>}
      {board.status === 'error' && (
        <p className="muted">Leaderboard unavailable right now. Try again in a moment.</p>
      )}
      {board.status === 'ready' && board.rows.length === 0 && (
        <p className="muted">No players yet. Be the first to win a hand.</p>
      )}

      {board.rows.length > 0 && (
        <ol className="lobby__board-list">
          {board.rows.map((row, index) => {
            const isMe = row.id === playerId;
            return (
              <li
                key={row.id}
                className={isMe ? 'lobby__board-row lobby__board-row--me' : 'lobby__board-row'}
                aria-current={isMe ? 'true' : undefined}
              >
                <span className="lobby__board-rank tabular">{index + 1}</span>
                <Avatar
                  name={row.name}
                  colourKey={isMe && player ? player.avatar : row.id}
                  size="sm"
                />
                <span className="lobby__board-name">
                  {row.name}
                  {isMe && <span className="muted"> (you)</span>}
                </span>
                <span className="lobby__board-chips tabular">{formatChips(row.chips)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
