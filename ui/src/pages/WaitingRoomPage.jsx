import { Link, useParams } from 'react-router';
import { Logo } from '../components/Logo.jsx';

// Placeholder so creating or joining a table has somewhere to go. The real waiting room is next.
export function WaitingRoomPage() {
  const { code } = useParams();
  return (
    <main className="page stack" style={{ gap: 'var(--space-6)' }}>
      <Logo />
      <h1>Waiting room</h1>
      <p className="muted">Share this code with your friends:</p>
      <p className="table-code">{code.toUpperCase()}</p>
      <p>
        <Link to="/lobby">Back to the lobby</Link>
      </p>
    </main>
  );
}
