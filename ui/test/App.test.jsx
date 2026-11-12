import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from '../src/App.jsx';
import { clearPlayerId, savePlayerId } from '../src/player.js';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => clearPlayerId());

describe('App routes', () => {
  it('asks a new visitor to create a player', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Create your player' })).toBeInTheDocument();
  });

  it('sends a returning player to the lobby', () => {
    savePlayerId('p-1');
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Lobby' })).toBeInTheDocument();
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
