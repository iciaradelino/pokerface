import { Logo } from '../components/Logo.jsx';

// Placeholder so "Create player & enter lobby" has somewhere to go. The real lobby is next.
export function LobbyPage() {
  return (
    <main className="page stack" style={{ gap: 'var(--space-6)' }}>
      <Logo />
      <h1>Lobby</h1>
      <p className="muted">Your player is ready. Tables are coming soon.</p>
    </main>
  );
}
