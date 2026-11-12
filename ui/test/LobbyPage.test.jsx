import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { LobbyPage } from '../src/pages/LobbyPage.jsx';
import { clearPlayerId, getPlayerId, savePlayerId } from '../src/player.js';
import { normalizeCode } from '../src/tableCode.js';

const ME = 'aaaaaaaa-0000-4000-8000-000000000001';
const ALEX = { id: ME, name: 'Alex', avatar: '#FF5FA2', chips: 1450, gestureSettings: {} };
const BOARD = [
  { id: 'bbbbbbbb-0000-4000-8000-000000000002', name: 'Sofía', chips: 4900 },
  { id: ME, name: 'Alex', chips: 1450 },
];

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Fake services. `routes` maps "METHOD /path" to a response (or a function returning one);
 * player and leaderboard default to Alex and BOARD.
 */
function mockServices(routes = {}) {
  const all = {
    [`GET /players/${ME}`]: () => json(200, ALEX),
    'GET /leaderboard': () => json(200, BOARD),
    ...routes,
  };
  const fetch = vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${new URL(url).pathname}`;
    const reply = all[key];
    if (!reply) throw new TypeError('Failed to fetch');
    return reply();
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function TableStub() {
  const { code } = useParams();
  return <h1>Table {code}</h1>;
}

function renderLobby() {
  return render(
    <MemoryRouter initialEntries={['/lobby']}>
      <Routes>
        <Route path="/" element={<h1>Create your player</h1>} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/tables/:code" element={<TableStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

const bodyOf = (fetch, method, path) => {
  const call = fetch.mock.calls.find(
    ([url, init = {}]) => (init.method ?? 'GET') === method && new URL(url).pathname === path,
  );
  return JSON.parse(call[1].body);
};

const codeInput = () => screen.getByLabelText('Table code');

beforeEach(() => savePlayerId(ME));
afterEach(() => {
  vi.unstubAllGlobals();
  clearPlayerId();
});

describe('LobbyPage', () => {
  it('greets the player and shows their chips and rank', async () => {
    mockServices();
    renderLobby();

    expect(
      await screen.findByRole('heading', { name: 'Hey Alex, ready to play?' }),
    ).toBeInTheDocument();
    const profile = screen.getByRole('region', { name: 'Your player' });
    expect(within(profile).getByText('Rank #2 on the leaderboard')).toBeInTheDocument();
    expect(within(profile).getByText('#2')).toBeInTheDocument();
    expect(screen.getAllByText('1,450').length).toBeGreaterThan(0);
  });

  it('lists the leaderboard and marks the player', async () => {
    mockServices();
    renderLobby();

    const board = await screen.findByRole('list');
    const rows = await within(board).findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Sofía');
    expect(rows[0]).toHaveTextContent('4,900');
    expect(rows[1]).toHaveTextContent('Alex (you)');
    expect(rows[1]).toHaveAttribute('aria-current', 'true');
  });

  it('creates a table with the chosen blinds and opens it', async () => {
    const fetch = mockServices({
      'POST /tables': () => json(201, { id: 'K7QX2M', seats: [] }),
    });
    renderLobby();

    fireEvent.click(screen.getByLabelText('10 / 20'));
    fireEvent.click(screen.getByRole('button', { name: 'Create private table' }));

    expect(await screen.findByRole('heading', { name: 'Table K7QX2M' })).toBeInTheDocument();
    expect(bodyOf(fetch, 'POST', '/tables')).toEqual({
      playerId: ME,
      smallBlind: 10,
      bigBlind: 20,
    });
  });

  it('shows why a table could not be created', async () => {
    mockServices({
      'POST /tables': () =>
        json(503, { code: 'PLAYERS_UNAVAILABLE', message: 'Player service unavailable' }),
    });
    renderLobby();

    fireEvent.click(screen.getByRole('button', { name: 'Create private table' }));

    expect(await screen.findByText('Player service unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create private table' })).toBeEnabled();
  });

  it('cleans up a typed code and joins the table', async () => {
    const fetch = mockServices({
      'POST /tables/K7QX2M/join': () => json(200, { table: {}, seatIndex: 1 }),
    });
    renderLobby();

    fireEvent.change(codeInput(), { target: { value: 'k7-qx 2m' } });
    expect(codeInput()).toHaveValue('K7QX2M');
    fireEvent.click(screen.getByRole('button', { name: 'Join table' }));

    expect(await screen.findByRole('heading', { name: 'Table K7QX2M' })).toBeInTheDocument();
    expect(bodyOf(fetch, 'POST', '/tables/K7QX2M/join')).toEqual({ playerId: ME });
  });

  it('asks for the whole code before sending anything', () => {
    const fetch = mockServices();
    renderLobby();

    fireEvent.change(codeInput(), { target: { value: 'K7Q' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join table' }));

    expect(screen.getByText('Table codes are 6 letters or numbers.')).toBeInTheDocument();
    expect(codeInput()).toHaveAttribute('aria-invalid', 'true');
    expect(fetch.mock.calls.some(([url]) => url.includes('/join'))).toBe(false);
  });

  it('explains an unknown code and a full table', async () => {
    let reply = () => json(404, { code: 'NOT_FOUND', message: 'Table not found' });
    mockServices({ 'POST /tables/ABC234/join': () => reply() });
    renderLobby();

    fireEvent.change(codeInput(), { target: { value: 'ABC234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join table' }));
    expect(
      await screen.findByText('No table with that code. Check it with the host.'),
    ).toBeInTheDocument();

    reply = () => json(409, { code: 'TABLE_FULL', message: 'This table is full' });
    fireEvent.click(screen.getByRole('button', { name: 'Join table' }));
    expect(await screen.findByText('This table is full')).toBeInTheDocument();
  });

  it('starts over when the saved player no longer exists', async () => {
    mockServices({
      [`GET /players/${ME}`]: () => json(404, { code: 'NOT_FOUND', message: 'Player not found' }),
    });
    renderLobby();

    expect(await screen.findByRole('heading', { name: 'Create your player' })).toBeInTheDocument();
    expect(getPlayerId()).toBeNull();
  });

  it('still works when the players service is down', async () => {
    mockServices({
      [`GET /players/${ME}`]: () => json(503, {}),
      'GET /leaderboard': () => json(503, {}),
    });
    renderLobby();

    expect(await screen.findByRole('alert')).toHaveTextContent('Player service unavailable');
    expect(await screen.findByText(/Leaderboard unavailable/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ready to play?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join table' })).toBeEnabled();
  });
});

describe('normalizeCode', () => {
  it('uppercases, drops other characters and keeps 6', () => {
    expect(normalizeCode('k7-qx 2m')).toBe('K7QX2M');
    expect(normalizeCode('ABCDEFGH')).toBe('ABCDEF');
    expect(normalizeCode(undefined)).toBe('');
  });
});
