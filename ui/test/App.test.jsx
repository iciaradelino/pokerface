import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { App } from '../src/App.jsx';
import { clearPlayerId, savePlayerId } from '../src/player.js';
import { FakeSocket } from './fakeSocket.js';

function CurrentPath() {
  return <span data-testid="current-path">{useLocation().pathname}</span>;
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <CurrentPath />
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

  it.each(['/', '/menu', '/lobby'])('opens the main menu at /menu from %s', (path) => {
    savePlayerId('p-1');
    renderAt(path);
    expect(screen.getByRole('heading', { name: 'Ready to play?' })).toBeInTheDocument();
    expect(screen.getByTestId('current-path')).toHaveTextContent(/^\/menu$/);
  });

  it('opens the waiting room for a table code', () => {
    savePlayerId('p-1');
    renderAt('/tables/k7qx2m');
    expect(screen.getByRole('heading', { name: 'Taking your seat…' })).toBeInTheDocument();
    expect(screen.getByText('Table K7QX2M')).toBeInTheDocument();
  });

  it.each(['/tables/k7qx2m', '/tables/k7qx2m/play'])(
    'joins %s after a new visitor creates a player',
    async (path) => {
      const player = { id: 'p-1', name: 'Alex', avatar: '#B8F23A', chips: 1000 };
      const table = {
        id: 'K7QX2M',
        createdBy: 'host',
        paused: true,
        smallBlind: 5,
        bigBlind: 10,
        startingStack: 1000,
        maxSeats: 6,
        seats: [
          { seatIndex: 0, playerId: 'host', name: 'Host', stack: 1000 },
          { seatIndex: 1, playerId: player.id, name: player.name, stack: 1000 },
        ],
      };
      const fetch = vi.fn(async (url) => {
        switch (new URL(url).pathname) {
          case '/players':
            return Response.json(player, { status: 201 });
          case '/players/p-1':
            return Response.json(player);
          case '/tables/K7QX2M/join':
            return Response.json({ table, seatIndex: 1 });
          default:
            return new Response(null, { status: 503 });
        }
      });
      vi.stubGlobal('fetch', fetch);
      renderAt(path);

      fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Alex' } });
      fireEvent.click(screen.getByRole('button', { name: /^Create player &/ }));

      expect(await screen.findByRole('heading', { name: 'Table lobby' })).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3002/tables/K7QX2M/join',
        expect.objectContaining({ method: 'POST', body: '{"playerId":"p-1"}' }),
      );
    },
  );

  it('opens the table once a game starts', () => {
    savePlayerId('p-1');
    renderAt('/tables/k7qx2m/play');
    expect(screen.getByRole('button', { name: 'Leave table' })).toBeInTheDocument();
    expect(screen.getByText('Code K7QX2M')).toBeInTheDocument();
  });

  it('sends visitors without a player away from the main menu', () => {
    renderAt('/menu');
    expect(screen.getByRole('heading', { name: 'Create your player' })).toBeInTheDocument();
  });

  it('shows not found for unknown paths', () => {
    renderAt('/nope');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
