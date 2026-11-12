import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { WaitingRoomPage } from '../src/pages/WaitingRoomPage.jsx';
import { clearPlayerId, getPlayerId, savePlayerId } from '../src/player.js';

const ME = 'aaaaaaaa-0000-4000-8000-000000000001';
const SOFIA = 'bbbbbbbb-0000-4000-8000-000000000002';
const ALEX = { id: ME, name: 'Alex', avatar: '#FF5FA2', chips: 1450, gestureSettings: {} };

function makeTable({ createdBy = ME, seats } = {}) {
  return {
    id: 'K7QX2M',
    smallBlind: 10,
    bigBlind: 20,
    startingStack: 1000,
    maxSeats: 6,
    createdBy,
    createdAt: '2026-11-12T10:00:00.000Z',
    seats: seats ?? [{ seatIndex: 0, playerId: ME, name: 'Alex', stack: 1000 }],
  };
}

const sofiaSeat = (seatIndex) => ({ seatIndex, playerId: SOFIA, name: 'Sofía', stack: 1000 });

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Fake services: "METHOD /path" → function returning a Response. */
function mockServices(routes = {}) {
  const all = {
    [`GET /players/${ME}`]: () => json(200, ALEX),
    'POST /tables/K7QX2M/join': () => json(200, { table: makeTable(), seatIndex: 0 }),
    'GET /tables/K7QX2M': () => json(200, makeTable()),
    ...routes,
  };
  const fetch = vi.fn(async (url, init = {}) => {
    const reply = all[`${init.method ?? 'GET'} ${new URL(url).pathname}`];
    if (!reply) throw new TypeError('Failed to fetch');
    return reply();
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function renderRoom(path = '/tables/K7QX2M', pollMs = 60_000) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<h1>Create your player</h1>} />
        <Route path="/lobby" element={<h1>Lobby</h1>} />
        <Route path="/tables/:code" element={<WaitingRoomPage pollMs={pollMs} />} />
        <Route path="/tables/:code/play" element={<h1>Game started</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

const seatList = () => screen.findByRole('list', { name: 'Seats' });
const startButton = () => screen.getByRole('button', { name: 'Start game' });

beforeEach(() => savePlayerId(ME));
afterEach(() => {
  vi.unstubAllGlobals();
  clearPlayerId();
});

describe('WaitingRoomPage', () => {
  it('joins the table and shows every seat', async () => {
    const fetch = mockServices();
    renderRoom('/tables/k7qx2m');

    const seats = within(await seatList()).getAllByRole('listitem');
    expect(seats).toHaveLength(6);
    expect(seats[0]).toHaveTextContent('Alex (you)');
    expect(seats[0]).toHaveTextContent('Host');
    expect(seats[1]).toHaveTextContent('Empty seat');
    expect(screen.getByText('Waiting for players · 1 of 6 seats taken')).toBeInTheDocument();
    expect(screen.getByText('K7QX2M')).toBeInTheDocument();
    expect(screen.getByText('10 / 20')).toBeInTheDocument();
    expect(screen.getByText('Alex (you)', { selector: 'dd' })).toBeInTheDocument();

    const join = fetch.mock.calls.find(([url]) => url.endsWith('/tables/K7QX2M/join'));
    expect(JSON.parse(join[1].body)).toEqual({ playerId: ME });
  });

  it('lets the host start only with at least 2 players', async () => {
    mockServices({
      'POST /tables/K7QX2M/join': () =>
        json(200, {
          table: makeTable({
            seats: [{ seatIndex: 0, playerId: ME, name: 'Alex', stack: 1000 }, sofiaSeat(1)],
          }),
        }),
    });
    renderRoom();

    await seatList();
    expect(screen.queryByText('You need at least 2 players to start.')).toBeNull();
    fireEvent.click(startButton());
    expect(await screen.findByRole('heading', { name: 'Game started' })).toBeInTheDocument();
  });

  it('keeps Start game disabled while the host is alone', async () => {
    mockServices();
    renderRoom();

    await seatList();
    expect(startButton()).toBeDisabled();
    expect(screen.getByText('You need at least 2 players to start.')).toBeInTheDocument();
  });

  it('tells other players they are waiting for the host', async () => {
    const table = makeTable({
      createdBy: SOFIA,
      seats: [sofiaSeat(0), { seatIndex: 1, playerId: ME, name: 'Alex', stack: 1000 }],
    });
    mockServices({ 'POST /tables/K7QX2M/join': () => json(200, { table }) });
    renderRoom();

    await seatList();
    expect(screen.getByText('Waiting for Sofía to start the game.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start game' })).toBeNull();
  });

  it('refreshes the seats while waiting', async () => {
    mockServices({
      'GET /tables/K7QX2M': () =>
        json(
          200,
          makeTable({
            seats: [{ seatIndex: 0, playerId: ME, name: 'Alex', stack: 1000 }, sofiaSeat(1)],
          }),
        ),
    });
    renderRoom('/tables/K7QX2M', 20);

    expect(await screen.findByText('Sofía')).toBeInTheDocument();
    expect(screen.getByText('Waiting for players · 2 of 6 seats taken')).toBeInTheDocument();
  });

  it('explains an unknown code', async () => {
    mockServices({
      'POST /tables/K7QX2M/join': () =>
        json(404, { code: 'NOT_FOUND', message: 'Table not found' }),
    });
    renderRoom();

    expect(await screen.findByRole('heading', { name: 'Table not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to lobby' })).toBeInTheDocument();
  });

  it('does not try to join a malformed code', () => {
    const fetch = mockServices();
    renderRoom('/tables/nope');

    expect(screen.getByRole('heading', { name: 'Table not found' })).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => url.includes('/join'))).toBe(false);
  });

  it('explains a full table', async () => {
    mockServices({
      'POST /tables/K7QX2M/join': () =>
        json(409, { code: 'TABLE_FULL', message: 'This table is full' }),
    });
    renderRoom();

    expect(await screen.findByRole('heading', { name: 'This table is full' })).toBeInTheDocument();
  });

  it('can try again when the game service is down', async () => {
    let up = false;
    mockServices({
      'POST /tables/K7QX2M/join': () =>
        up ? json(200, { table: makeTable() }) : json(503, { code: 'UNAVAILABLE' }),
    });
    renderRoom();

    expect(await screen.findByRole('heading', { name: 'Tables unavailable' })).toBeInTheDocument();
    up = true;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await seatList()).toBeInTheDocument();
  });

  it('starts over when the saved player no longer exists', async () => {
    mockServices({
      'POST /tables/K7QX2M/join': () =>
        json(404, { code: 'NOT_FOUND', message: 'Player not found' }),
    });
    renderRoom();

    expect(await screen.findByRole('heading', { name: 'Create your player' })).toBeInTheDocument();
    expect(getPlayerId()).toBeNull();
  });

  it('copies the invite link, or shows it when copying fails', async () => {
    mockServices();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderRoom();

    await seatList();
    fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' }));
    expect(await screen.findByRole('button', { name: 'Link copied' })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/tables/K7QX2M`);

    writeText.mockRejectedValueOnce(new Error('blocked'));
    fireEvent.click(screen.getByRole('button', { name: 'Link copied' }));
    expect(
      await screen.findByText(`Copy this link: ${window.location.origin}/tables/K7QX2M`),
    ).toBeInTheDocument();
  });
});
