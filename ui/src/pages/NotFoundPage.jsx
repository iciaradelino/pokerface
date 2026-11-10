import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="page stack" style={{ paddingTop: 'var(--space-12)' }}>
      <h1>Page not found</h1>
      <p className="muted">This page doesn&apos;t exist.</p>
      <p>
        <Link to="/">Back to the start</Link>
      </p>
    </main>
  );
}
