import { useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { playersApi } from '../api/playersApi.js';
import { ApiError } from '../api/http.js';
import { COLOUR_CHOICES, playerColour } from '../components/Avatar.jsx';
import { Button } from '../components/Button.jsx';
import { Icon } from '../components/Icon.jsx';
import { Logo } from '../components/Logo.jsx';
import { PlayingCard } from '../components/PlayingCard.jsx';
import { NAME_MAX, savePlayerId, validateName } from '../player.js';
import './CreatePlayerPage.css';

const FEATURES = [
  { icon: 'camera', text: "Everyone's camera around one table" },
  { icon: 'thumbsUp', text: 'Thumbs up to call, thumbs down to fold' },
  { icon: 'chip', text: 'Play chips only, never real money' },
];

export function CreatePlayerPage() {
  const navigate = useNavigate();
  const nameInput = useRef(null);
  const ids = { name: useId(), nameHelp: useId(), gestures: useId() };

  const [name, setName] = useState('');
  const [colour, setColour] = useState(COLOUR_CHOICES[0].id);
  const [gestures, setGestures] = useState(true);
  const [nameError, setNameError] = useState(null);
  const [serviceError, setServiceError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const error = validateName(name);
    if (error) {
      setNameError(error);
      nameInput.current?.focus();
      return;
    }

    setSaving(true);
    setServiceError(null);
    try {
      const player = await playersApi.create({
        name: name.trim(),
        avatar: COLOUR_CHOICES.find((choice) => choice.id === colour).hex,
        gestureSettings: { enabled: gestures },
      });
      savePlayerId(player.id);
      navigate('/lobby', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && !err.isUnavailable) {
        setNameError(err.message);
        nameInput.current?.focus();
      } else {
        setServiceError('Player service unavailable. Try again in a moment.');
      }
      setSaving(false);
    }
  }

  const displayName = name.trim() || 'Your name';

  return (
    <div className="create-player" style={{ '--chosen': playerColour(colour) }}>
      <section className="create-player__intro" aria-label="About Pokerface">
        <Logo />

        <div className="create-player__pitch">
          <p className="hero-title">
            Poker,
            <br />
            face to face.
          </p>
          <p className="create-player__lead">
            Play Texas Hold&apos;em with friends over webcam. Act with hand signals, read their
            tells, hide your own.
          </p>
          <ul className="create-player__features">
            {FEATURES.map(({ icon, text }) => (
              <li key={icon}>
                <span className="create-player__feature-icon">
                  <Icon name={icon} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <div className="create-player__bottom">
          <p className="create-player__footnote">A university project · Play money only</p>

          <div className="create-player__art" aria-hidden="true">
            <PlayingCard
              card="As"
              size="lg"
              className="create-player__card create-player__card--a"
            />
            <PlayingCard
              card="Kh"
              size="lg"
              className="create-player__card create-player__card--k"
            />
            <span className="create-player__chip create-player__chip--pink" />
            <span className="create-player__chip create-player__chip--lime" />
          </div>
        </div>
      </section>

      <main className="create-player__main">
        <form className="create-player__form" onSubmit={handleSubmit} noValidate>
          <header className="stack" style={{ gap: 'var(--space-2)' }}>
            <h1>Create your player</h1>
            <p className="muted">No password needed. Your player is saved on this device.</p>
          </header>

          <div className="panel create-player__preview">
            <div className="create-player__tile" aria-hidden="true">
              <svg className="create-player__silhouette" viewBox="0 0 120 90">
                <circle cx="60" cy="34" r="16" />
                <path d="M26 90c0-20 15-32 34-32s34 12 34 32Z" />
              </svg>
              <span className="create-player__tile-name">{displayName}</span>
            </div>
            <div className="stack" style={{ gap: 'var(--space-1)' }}>
              <p className="text-small muted">This is how friends see you at the table</p>
              <p className="create-player__preview-name">{displayName}</p>
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor={ids.name}>
              Display name
            </label>
            <input
              ref={nameInput}
              id={ids.name}
              className="input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder="e.g. Alex"
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

          <fieldset className="field create-player__colours">
            <legend className="field__label">Your colour</legend>
            <div className="create-player__swatches">
              {COLOUR_CHOICES.map((choice) => (
                <label key={choice.id} className="create-player__swatch">
                  <input
                    type="radio"
                    name="colour"
                    value={choice.id}
                    checked={colour === choice.id}
                    onChange={() => setColour(choice.id)}
                    className="visually-hidden"
                  />
                  <span
                    className="create-player__swatch-dot"
                    style={{ background: playerColour(choice.id) }}
                  />
                  <span className="visually-hidden">{choice.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="create-player__gestures" htmlFor={ids.gestures}>
            <input
              id={ids.gestures}
              type="checkbox"
              checked={gestures}
              onChange={(e) => setGestures(e.target.checked)}
            />
            <span className="stack" style={{ gap: 'var(--space-1)' }}>
              <span className="create-player__gestures-title">Play with gestures</span>
              <span className="text-small muted">
                Uses your camera to read hand signals. Video stays on your device; only the action
                is sent.
              </span>
            </span>
          </label>

          {serviceError && (
            <div className="banner" role="alert">
              {serviceError}
            </div>
          )}

          <Button type="submit" variant="lime" size="primary" block disabled={saving}>
            {saving ? 'Creating player…' : 'Create player & enter lobby'}
          </Button>
        </form>
      </main>
    </div>
  );
}
