import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from '../src/App.jsx';
import { clearPlayerId, savePlayerId } from '../src/player.js';
import { FakeSocket } from './fakeSocket.js';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

// Pages load data on mount; no service is running in these tests.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 503 })),
  );
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearPlayerId();
});

describe('App routes', () => {
  it('asks a new visitor to create a player', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Create your player' })).toBeInTheDocument();
  });

  it('sends a returning player to the lobby', () => {
    savePlayerId('p-1');
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Ready to play?' })).toBeInTheDocument();
  });

  it('opens the waiting room for a table code', () => {
    savePlayerId('p-1');
    renderAt('/tables/k7qx2m');
    expect(screen.getByRole('heading', { name: 'Taking your seat…' })).toBeInTheDocument();
    expect(screen.getByText('Table K7QX2M')).toBeInTheDocument();
  });

  it('opens the table once a game starts', () => {
    savePlayerId('p-1');
    renderAt('/tables/k7qx2m/play');
    expect(screen.getByRole('button', { name: 'Leave table' })).toBeInTheDocument();
    expect(screen.getByText('Code K7QX2M')).toBeInTheDocument();
  });

  it('sends visitors without a player away from the lobby', () => {
    renderAt('/lobby');
    expect(screen.getByRole('heading', { name: 'Create your player' })).toBeInTheDocument();
  });

  it('shows not found for unknown paths', () => {
    renderAt('/nope');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
