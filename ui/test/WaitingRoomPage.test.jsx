import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { WaitingRoomPage } from '../src/pages/WaitingRoomPage.jsx';
import { clearPlayerId, getPlayerId, savePlayerId } from '../src/player.js';
import { FakeSocket } from './fakeSocket.js';
import { FakePeerConnection, fakeStream } from './fakePeerConnection.js';

const ME = 'aaaaaaaa-0000-4000-8000-000000000001';
const SOFIA = 'bbbbbbbb-0000-4000-8000-000000000002';
const ALEX = { id: ME, name: 'Alex', avatar: '#FF5FA2', chips: 1450, gestureSettings: {} };

// New tables are paused until the host starts the game.
function makeTable({ createdBy = ME, seats, paused = true } = {}) {
  return {
    id: 'K7QX2M',
    smallBlind: 10,
    bigBlind: 20,
    startingStack: 1000,
    maxSeats: 6,
    createdBy,
    createdAt: '2026-11-12T10:00:00.000Z',
    paused,
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

beforeEach(() => {
  savePlayerId(ME);
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  // jsdom has no RTCPeerConnection; with two or more seats the video mesh opens one.
  FakePeerConnection.reset();
  vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
});
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

  const twoSeats = [{ seatIndex: 0, playerId: ME, name: 'Alex', stack: 1000 }, sofiaSeat(1)];

  it('starts the game for the host with at least 2 players', async () => {
    const fetch = mockServices({
      'POST /tables/K7QX2M/join': () => json(200, { table: makeTable({ seats: twoSeats }) }),
      'POST /tables/K7QX2M/start': () => json(200, makeTable({ seats: twoSeats, paused: false })),
    });
    renderRoom();

    await seatList();
    expect(screen.queryByText('You need at least 2 players to start.')).toBeNull();
    fireEvent.click(startButton());
    expect(await screen.findByRole('heading', { name: 'Game started' })).toBeInTheDocument();

    const start = fetch.mock.calls.find(([url]) => url.endsWith('/tables/K7QX2M/start'));
    expect(start[1].method).toBe('POST');
    expect(JSON.parse(start[1].body)).toEqual({ playerId: ME });
  });

  it('explains why the game could not start', async () => {
    mockServices({
      'POST /tables/K7QX2M/join': () => json(200, { table: makeTable({ seats: twoSeats }) }),
      'POST /tables/K7QX2M/start': () =>
        json(403, {
          code: 'FORBIDDEN',
          message: 'Only the player who created the table can do this',
        }),
    });
    renderRoom();

    await seatList();
    fireEvent.click(startButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only the player who created the table can do this',
    );
    expect(startButton()).toBeEnabled();
  });

  it('moves everyone to the table once the host has started', async () => {
    const table = makeTable({
      createdBy: SOFIA,
      seats: [sofiaSeat(0), { ...twoSeats[0], seatIndex: 1 }],
    });
    let started = false;
    mockServices({
      'POST /tables/K7QX2M/join': () => json(200, { table }),
      'GET /tables/K7QX2M': () => json(200, { ...table, paused: !started }),
    });
    renderRoom('/tables/K7QX2M', 20);

    await seatList();
    expect(screen.getByText('Waiting for Sofía to start the game.')).toBeInTheDocument();
    started = true;
    expect(await screen.findByRole('heading', { name: 'Game started' })).toBeInTheDocument();
  });

  it('goes straight to the table when the game is already running', async () => {
    mockServices({
      'POST /tables/K7QX2M/join': () =>
        json(200, { table: makeTable({ seats: twoSeats, paused: false }) }),
    });
    renderRoom();

    expect(await screen.findByRole('heading', { name: 'Game started' })).toBeInTheDocument();
  });

  it('stays in the waiting room when the table does not say it is unpaused', async () => {
    const { paused, ...withoutPaused } = makeTable({ seats: twoSeats });
    expect(paused).toBe(true);
    mockServices({ 'POST /tables/K7QX2M/join': () => json(200, { table: withoutPaused }) });
    renderRoom();

    expect(await seatList()).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Game started' })).toBeNull();
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

describe('WaitingRoomPage video', () => {
  const twoSeats = [{ seatIndex: 0, playerId: ME, name: 'Alex', stack: 1000 }, sofiaSeat(1)];
  const bothSeated = () =>
    mockServices({
      'POST /tables/K7QX2M/join': () => json(200, { table: makeTable({ seats: twoSeats }) }),
    });
  function withCamera(stream = fakeStream('mine', { audio: true })) {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    return stream;
  }
  const signals = (socket) => socket.sent.filter((message) => message.type === 'signal');

  it('shows my camera in my seat', async () => {
    bothSeated();
    withCamera();
    renderRoom();
    await seatList();
    expect(await screen.findByLabelText('Your camera')).toBeInTheDocument();
  });

  it('says so in my seat when there is no camera', async () => {
    bothSeated();
    renderRoom();
    const seats = within(await seatList()).getAllByRole('listitem');
    expect(await within(seats[0]).findByText('No camera')).toBeInTheDocument();
    expect(within(seats[1]).getByText('Connecting video…')).toBeInTheDocument();
  });

  it('sends my offer to the other player through the table socket', async () => {
    bothSeated();
    withCamera();
    renderRoom();
    await seatList();
    const socket = FakeSocket.latest;
    expect(socket.url).toContain(`/tables/K7QX2M/ws?playerId=${ME}`);
    socket.open();
    await waitFor(() => expect(signals(socket)).toHaveLength(1));
    expect(signals(socket)[0]).toMatchObject({ to: SOFIA });
    expect(signals(socket)[0].data.description.type).toBe('offer');
  });

  it('does not connect video to someone who is not seated', async () => {
    bothSeated();
    withCamera();
    renderRoom();
    await seatList();
    const socket = FakeSocket.latest;
    socket.open();
    await waitFor(() => expect(signals(socket)).toHaveLength(1));
    socket.push({
      type: 'signal',
      from: 'cccccccc-0000-4000-8000-000000000003',
      to: ME,
      data: { description: { type: 'offer', sdp: '' } },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(signals(socket)).toHaveLength(1);
  });

  it('lets me mute and unmute my microphone', async () => {
    bothSeated();
    const stream = withCamera();
    renderRoom();
    fireEvent.click(await screen.findByRole('button', { name: 'Mute microphone' }));
    expect(stream.getAudioTracks()[0].enabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));
    expect(stream.getAudioTracks()[0].enabled).toBe(true);
  });

  it('turns the camera off when moving on to the table', async () => {
    const stream = withCamera();
    mockServices({
      'POST /tables/K7QX2M/join': () => json(200, { table: makeTable({ seats: twoSeats }) }),
      'POST /tables/K7QX2M/start': () => json(200, makeTable({ seats: twoSeats, paused: false })),
    });
    renderRoom();
    await screen.findByLabelText('Your camera');
    fireEvent.click(startButton());
    expect(await screen.findByRole('heading', { name: 'Game started' })).toBeInTheDocument();
    expect(stream.getTracks().every((track) => track.stopped)).toBe(true);
  });
});
