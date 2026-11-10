import { PlayingCard } from '../components/PlayingCard.jsx';

// Placeholder until the "Create your player" screen replaces it.
export function HomePage() {
  return (
    <main className="page stack" style={{ gap: 'var(--space-6)', paddingTop: 'var(--space-12)' }}>
      <div className="row" style={{ gap: 'var(--space-2)' }}>
        <PlayingCard card="As" size="sm" />
        <PlayingCard card="Kh" size="sm" />
      </div>
      <h1 className="hero-title">
        Poker,
        <br />
        face to face.
      </h1>
      <p className="muted" style={{ maxWidth: 520, fontSize: 'var(--text-body-lg)' }}>
        Play Texas Hold&apos;em with friends over webcam. Act with hand signals, read their tells,
        hide your own.
      </p>
    </main>
  );
}
