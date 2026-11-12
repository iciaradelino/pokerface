import { Link, useParams } from 'react-router';
import { Logo } from '../components/Logo.jsx';

// Placeholder so "Start game" has somewhere to go. The real table screen is next.
export function TablePage() {
  const { code } = useParams();
  return (
    <main className="page stack" style={{ gap: 'var(--space-6)' }}>
      <Logo />
      <h1>Table {code.toUpperCase()}</h1>
      <p className="muted">The table screen is coming next.</p>
      <p>
        <Link to={`/tables/${code}`}>Back to the waiting room</Link>
      </p>
    </main>
  );
}
