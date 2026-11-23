import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../api/http.js';
import { playersApi } from '../api/playersApi.js';
import { COLOUR_CHOICES, colourIndex, playerColour } from '../components/Avatar.jsx';
import { Button } from '../components/Button.jsx';
import { formatChips } from '../components/Chips.jsx';
import { TopBar } from '../components/TopBar.jsx';
import {
  HOLD_MAX_MS,
  HOLD_MIN_MS,
  HOLD_STEP_MS,
  formatHold,
  gesturesOn,
  holdMsOf,
} from '../gestureSettings.js';
import { NAME_MAX, clearPlayerId, validateName } from '../player.js';
import { isPlayerGone, usePlayer } from '../usePlayer.js';
import './ProfilePage.css';

/** The form's values for a player, so we can tell whether anything changed. */
function formFrom(player) {
  return {
    name: player.name,
    colour: COLOUR_CHOICES[colourIndex(player.avatar)].id,
    gestures: gesturesOn(player),
    holdMs: holdMsOf(player),
  };
}

const sameForm = (a, b) =>
  a.name.trim() === b.name.trim() &&
  a.colour === b.colour &&
  a.gestures === b.gestures &&
  a.holdMs === b.holdMs;

/** "2026-10-03T…" → "October 2026" */
export const monthYear = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

/** "2026-11-20T18:30Z" → "20 Nov, 18:30" (in the player's own time zone) */
export const handTime = (iso) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** +1,450 / −900 / 0 with the same minus sign as the rest of the app. */
export function signedChips(delta) {
  if (delta > 0) return `+${formatChips(delta)}`;
  if (delta < 0) return `−${formatChips(-delta)}`;
  return '0';
}

/**
 * /profile: see your chips, rank and recent hands, change your name, colour and gesture
 * settings, or delete your player (issue #3). Reached from the menu on your avatar.
 */
export function ProfilePage() {
  const navigate = useNavigate();
  const { playerId, player, setPlayer, unavailable, startOver } = usePlayer();
  const [history, setHistory] = useState({ status: 'loading' });
  const [rank, setRank] = useState(null);

  useEffect(() => {
    let active = true;
    playersApi
      .history(playerId)
      .then((data) => active && setHistory({ status: 'ready', ...data }))
      .catch((err) => {
        if (!active) return;
        if (isPlayerGone(err)) startOver();
        else setHistory({ status: 'error' });
      });
    // Only the top 10 are on the leaderboard, so a lower player has no rank to show.
    playersApi
      .leaderboard()
      .then((rows) => {
        const index = rows.findIndex((row) => row.id === playerId);
        if (active) setRank(index === -1 ? null : index + 1);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [playerId, startOver]);

  return (
    <div className="profile">
      <TopBar player={player} />

      <main className="profile__main">
        <aside className="profile__side" aria-label="Your player">
          <PlayerCard player={player} rank={rank} history={history} />
          <RecentHands history={history} />
        </aside>

        <div className="profile__content">
          {unavailable ? (
            <>
              <h1>Profile &amp; settings</h1>
              <div className="banner" role="alert">
                Player service unavailable. Your profile will be back in a moment.
              </div>
            </>
          ) : player ? (
            <>
              <SettingsForm
                key={player.id}
                player={player}
                onSaved={setPlayer}
                onPlayerGone={startOver}
              />
              <DeletePlayer
                playerId={playerId}
                onDeleted={() => {
                  clearPlayerId();
                  navigate('/', { replace: true });
                }}
              />
            </>
          ) : (
            <>
              <h1>Profile &amp; settings</h1>
              <p className="muted">Loading…</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function PlayerCard({ player, rank, history }) {
  return (
    <section
      className="panel panel--dark profile__card"
      style={{ '--chosen': playerColour(player?.avatar ?? 'lime') }}
    >
      <div className="profile__tile" aria-hidden="true">
        <svg className="profile__silhouette" viewBox="0 0 120 90">
          <circle cx="60" cy="34" r="16" />
          <path d="M26 90c0-20 15-32 34-32s34 12 34 32Z" />
        </svg>
      </div>
      <div className="profile__card-name">
        <p className="profile__name">{player?.name ?? '…'}</p>
        {history.status === 'ready' && (
          <p className="text-small muted">Playing since {monthYear(history.since)}</p>
        )}
      </div>
      <div className="profile__stats">
        <div className="stat">
          <span className="label">Chips</span>
          <span className="stat__value profile__stat-lime">
            {player ? formatChips(player.chips) : '–'}
          </span>
        </div>
        <div className="stat">
          <span className="label">Rank</span>
          <span className="stat__value">{rank ? `#${rank}` : '–'}</span>
        </div>
        <div className="stat">
          <span className="label">Hands</span>
          <span className="stat__value">
            {history.status === 'ready' ? formatChips(history.handsPlayed) : '–'}
          </span>
        </div>
      </div>
    </section>
  );
}

function RecentHands({ history }) {
  return (
    <section className="panel profile__hands" aria-labelledby="profile-hands-title">
      <h2 id="profile-hands-title">Recent hands</h2>
      {history.status === 'loading' && <p className="muted">Loading…</p>}
      {history.status === 'error' && (
        <p className="muted">Hand history unavailable right now. Try again in a moment.</p>
      )}
      {history.status === 'ready' && history.recent.length === 0 && (
        <p className="muted">No hands yet. Finished hands show up here.</p>
      )}
      {history.status === 'ready' && history.recent.length > 0 && (
        <ol className="profile__hand-list">
          {history.recent.map((hand) => {
            const result = hand.delta > 0 ? 'won' : hand.delta < 0 ? 'lost' : 'even';
            return (
              <li key={hand.handId} className="profile__hand">
                <span className="stack" style={{ gap: 2 }}>
                  <span className="profile__hand-title">
                    {result === 'won' ? 'Won' : result === 'lost' ? 'Lost' : 'Broke even'}
                  </span>
                  <span className="text-small muted">{handTime(hand.playedAt)}</span>
                </span>
                <span className={`profile__delta profile__delta--${result} tabular`}>
                  {signedChips(hand.delta)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function SettingsForm({ player, onSaved, onPlayerGone }) {
  const ids = {
    name: useId(),
    nameHelp: useId(),
    gestures: useId(),
    hold: useId(),
    holdHelp: useId(),
  };
  const nameInput = useRef(null);
  const [saved, setSaved] = useState(() => formFrom(player));
  const [form, setForm] = useState(saved);
  const [nameError, setNameError] = useState(null);
  const [status, setStatus] = useState({ saving: false, message: null, error: null });

  const changed = !sameForm(form, saved);
  const update = (changes) => {
    setForm((current) => ({ ...current, ...changes }));
    setStatus((current) => ({ ...current, message: null }));
  };

  async function handleSubmit(event) {
    event.preventDefault();
    const error = validateName(form.name);
    if (error) {
      setNameError(error);
      nameInput.current?.focus();
      return;
    }

    setStatus({ saving: true, message: null, error: null });
    try {
      const next = await playersApi.update(player.id, {
        name: form.name.trim(),
        avatar: COLOUR_CHOICES.find((choice) => choice.id === form.colour).hex,
        // Keep any other saved settings; only these two are edited here.
        gestureSettings: {
          ...player.gestureSettings,
          enabled: form.gestures,
          holdMs: form.holdMs,
        },
      });
      const nextForm = formFrom(next);
      setSaved(nextForm);
      setForm(nextForm);
      onSaved(next);
      setStatus({ saving: false, message: 'Changes saved', error: null });
    } catch (err) {
      if (isPlayerGone(err)) return onPlayerGone();
      if (err instanceof ApiError && !err.isUnavailable) {
        setNameError(err.message);
        nameInput.current?.focus();
        setStatus({ saving: false, message: null, error: null });
      } else {
        setStatus({
          saving: false,
          message: null,
          error: 'Player service unavailable. Your changes are not saved yet; try again.',
        });
      }
    }
  }

  return (
    <form className="profile__form" onSubmit={handleSubmit} noValidate>
      <div className="profile__head">
        <h1>Profile &amp; settings</h1>
        <div className="row profile__save">
          {status.message && (
            <span className="text-small profile__saved" role="status">
              {status.message}
            </span>
          )}
          <Button type="submit" variant="lime" size="primary" disabled={!changed || status.saving}>
            {status.saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      {status.error && (
        <div className="banner" role="alert">
          {status.error}
        </div>
      )}

      <section className="panel profile__section" aria-labelledby="profile-player-title">
        <h2 id="profile-player-title">Player</h2>
        <div className="profile__player-fields">
          <div className="field">
            <label className="field__label" htmlFor={ids.name}>
              Display name
            </label>
            <input
              ref={nameInput}
              id={ids.name}
              className="input"
              value={form.name}
              onChange={(e) => {
                update({ name: e.target.value });
                if (nameError) setNameError(null);
              }}
              maxLength={NAME_MAX}
              autoComplete="nickname"
              aria-invalid={nameError ? 'true' : undefined}
              aria-describedby={nameError ? ids.nameHelp : undefined}
            />
            {nameError && (
              <span id={ids.nameHelp} className="field__error">
                {nameError}
              </span>
            )}
          </div>

          <fieldset className="field profile__colours">
            <legend className="field__label">Colour</legend>
            <div className="profile__swatches">
              {COLOUR_CHOICES.map((choice) => (
                <label key={choice.id} className="profile__swatch">
                  <input
                    type="radio"
                    name="colour"
                    value={choice.id}
                    checked={form.colour === choice.id}
                    onChange={() => update({ colour: choice.id })}
                    className="visually-hidden"
                  />
                  <span
                    className="profile__swatch-dot"
                    style={{ background: playerColour(choice.id) }}
                  />
                  <span className="visually-hidden">{choice.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      <section className="panel profile__section" aria-labelledby="profile-gestures-title">
        <div className="profile__section-head">
          <h2 id="profile-gestures-title">Gestures</h2>
          <Link className="profile__link" to="/tutorial?next=%2Fprofile">
            Practise gestures →
          </Link>
        </div>

        <label className="profile__toggle" htmlFor={ids.gestures}>
          <input
            id={ids.gestures}
            type="checkbox"
            role="switch"
            className="switch"
            checked={form.gestures}
            onChange={(e) => update({ gestures: e.target.checked })}
          />
          <span className="stack" style={{ gap: 2 }}>
            <span className="profile__toggle-title">Play with gestures</span>
            <span className="text-small muted">Turn off to use buttons only.</span>
          </span>
        </label>

        <div className="field profile__hold">
          <div className="profile__hold-head">
            <label className="field__label" htmlFor={ids.hold}>
              Hold to confirm
            </label>
            <span className="profile__hold-value tabular">{formatHold(form.holdMs)}</span>
          </div>
          <input
            id={ids.hold}
            type="range"
            className="range"
            min={HOLD_MIN_MS}
            max={HOLD_MAX_MS}
            step={HOLD_STEP_MS}
            value={form.holdMs}
            disabled={!form.gestures}
            onChange={(e) => update({ holdMs: Number(e.target.value) })}
            aria-valuetext={formatHold(form.holdMs)}
            aria-describedby={ids.holdHelp}
          />
          <span id={ids.holdHelp} className="text-small muted">
            How long to hold call, fold and all-in. Longer means fewer accidental actions.
          </span>
        </div>
      </section>
    </form>
  );
}

function DeletePlayer({ playerId, onDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await playersApi.remove(playerId);
      onDeleted();
    } catch (err) {
      // Already gone on the server: nothing left to delete, so finish the same way.
      if (err instanceof ApiError && err.status === 404) return onDeleted();
      setError('Player service unavailable. Your player was not deleted; try again.');
      setDeleting(false);
    }
  }

  return (
    <section className="panel panel--danger profile__danger" aria-labelledby="profile-delete-title">
      <div className="stack" style={{ gap: 'var(--space-1)' }}>
        <h2 id="profile-delete-title" className="profile__danger-title">
          Delete player
        </h2>
        <p className="text-small muted">
          {confirming
            ? 'This cannot be undone. Your chips and hand history are deleted for good.'
            : 'Removes your player, chips and hand history from this device and the leaderboard.'}
        </p>
        {error && (
          <p className="text-small profile__danger-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {confirming ? (
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <Button variant="ghost" onClick={() => setConfirming(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Yes, delete my player'}
          </Button>
        </div>
      ) : (
        <Button variant="danger" onClick={() => setConfirming(true)}>
          Delete player
        </Button>
      )}
    </section>
  );
}
