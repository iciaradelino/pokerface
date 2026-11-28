import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { TablePage } from '../src/pages/TablePage.jsx';
import { useTableSocket } from '../src/table/useTableSocket.js';
import { clearPlayerId, savePlayerId } from '../src/player.js';
import {
  arrangeSeats,
  blindPlayers,
  formatClock,
  potRaise,
  secondsLeft,
  moveText,
  seatNote,
} from '../src/table/tableView.js';
import { FakeSocket } from './fakeSocket.js';
import { fakeStream } from './fakePeerConnection.js';

const ME = 'aaaaaaaa-0000-4000-8000-000000000001';
const SOFIA = 'bbbbbbbb-0000-4000-8000-000000000002';

const TABLE = {
  id: 'K7QX2M',
  smallBlind: 5,
  bigBlind: 10,
  startingStack: 1000,
  maxSeats: 6,
  createdBy: ME,
  createdAt: '2026-11-12T10:00:00.000Z',
  seats: [
    { seatIndex: 0, playerId: ME, name: 'Alex', stack: 1000 },
    { seatIndex: 1, playerId: SOFIA, name: 'Sofía', stack: 1000 },
  ],
};

/** A "state" message as publicState() builds it. */
function stateMessage(overrides = {}) {
  return {
    type: 'state',
    handNumber: 3,
    stage: 'flop',
    board: ['Kh', '9s', '9d'],
    pots: [{ amount: 40, eligible: [ME, SOFIA] }],
    dealer: SOFIA,
    currentPlayer: ME,
    timerEndsAt: new Date(Date.now() + 14_000).toISOString(),
    seats: [
      { seat: 0, playerId: ME, name: 'Alex', stack: 980, bet: 0, status: 'active' },
      { seat: 1, playerId: SOFIA, name: 'Sofía', stack: 970, bet: 10, status: 'active' },
    ],
    result: null,
    ...overrides,
  };
}

/** A "private" message as privateState() builds it, on my turn. */
function privateMessage(overrides = {}) {
  return {
    type: 'private',
    playerId: ME,
    holeCards: ['As', 'Kd'],
    legalActions: ['fold', 'call', 'raise', 'allin'],
    toCall: 10,
    minRaise: 20,
    maxRaise: 980,
    ...overrides,
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockServices(routes = {}) {
  const all = {
    [`GET /players/${ME}`]: () =>
      json(200, { id: ME, name: 'Alex', avatar: '#B8F23A', chips: 1000 }),
    'GET /tables/K7QX2M': () => json(200, TABLE),
    'POST /tables/K7QX2M/actions': () => json(200, {}),
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

function renderTable() {
  return render(
    <MemoryRouter initialEntries={['/tables/K7QX2M/play']}>
      <Routes>
        <Route path="/" element={<h1>Create your player</h1>} />
        <Route path="/menu" element={<h1>Main menu</h1>} />
        <Route path="/tables/:code" element={<h1>Table lobby</h1>} />
        <Route path="/tables/:code/play" element={<TablePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Renders the table, waits for the HTTP seats, then opens the socket and sends messages. */
async function renderLive(state = stateMessage(), mine = privateMessage()) {
  renderTable();
  await screen.findByLabelText(/^You, /);
  const socket = FakeSocket.latest;
  socket.open();
  socket.push(state);
  socket.push({
    type: 'video-peers',
    peers: Object.fromEntries(state.seats.map(({ playerId }, i) => [playerId, i + 1])),
  });
  if (mine) socket.push(mine);
  return socket;
}

const button = (name) => screen.getByRole('button', { name });
const actionBody = (fetch) => {
  const call = fetch.mock.calls.find(([url]) => url.endsWith('/actions'));
  return JSON.parse(call[1].body);
};

beforeEach(() => {
  savePlayerId(ME);
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearPlayerId();
});

describe('TablePage', () => {
  it('shows the seats before the live connection is up', async () => {
    mockServices();
    renderTable();

    expect(await screen.findByLabelText('You, 1,000 chips')).toBeInTheDocument();
    expect(screen.getByLabelText('Sofía, 1,000 chips')).toBeInTheDocument();
    expect(screen.getByText('Blinds 5 / 10')).toBeInTheDocument();
    expect(screen.getByText('Connecting to the table…')).toHaveAttribute('role', 'status');
    expect(screen.getAllByText('Empty seat')).toHaveLength(4);
    // The host comes from VITE_GAME_URL, so only the path is checked here.
    expect(FakeSocket.latest.url).toMatch(/^ws:\/\/[^/]+\/tables\/K7QX2M\/ws\?playerId=/);
    expect(FakeSocket.latest.url).toContain(ME);
  });

  it('draws the live hand: board, pot, my cards, bets and whose turn it is', async () => {
    mockServices();
    await renderLive();

    expect(screen.queryByText('Connecting to the table…')).toBeNull();
    expect(screen.getByText('Hand #3 · Flop')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'King of hearts' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Ace of spades' })).toBeInTheDocument();
    expect(screen.getByText('Pot 40')).toBeInTheDocument();
    expect(screen.getByLabelText('You, 980 chips, Your turn')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Dealer' })).toBeInTheDocument();
    // Heads-up the dealer (Sofía) posts the small blind and I post the big blind
    expect(screen.getByRole('img', { name: 'Small blind' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Big blind' })).toBeInTheDocument();
    expect(screen.getByText(/^Your turn · 0:1\d$/)).toBeInTheDocument();
  });

  it('enables only the legal actions and sends a call', async () => {
    const fetch = mockServices();
    await renderLive();

    expect(button('Check')).toBeDisabled();
    expect(button('Fold')).toBeEnabled();
    fireEvent.click(button('Call 10'));

    await vi.waitFor(() => expect(actionBody(fetch)).toEqual({ playerId: ME, action: 'call' }));
    expect(button('Call 10')).toBeDisabled();
  });

  it('raises to the amount picked with the pot buttons', async () => {
    const fetch = mockServices();
    await renderLive();

    expect(button('Raise to 20')).toBeEnabled();
    fireEvent.click(button('Pot'));
    // Calling 10 makes the bet 10 and the pot 50; a pot raise adds 50 → raise to 60.
    fireEvent.click(button('Raise to 60'));

    await vi.waitFor(() =>
      expect(actionBody(fetch)).toEqual({ playerId: ME, action: 'raise', amount: 60 }),
    );
  });

  it('starts the raise at the new minimum when a turn comes back', async () => {
    mockServices();
    // Sofía's turn first: I may not raise.
    const socket = await renderLive(
      stateMessage({ currentPlayer: SOFIA }),
      privateMessage({ legalActions: [], toCall: 0, minRaise: null, maxRaise: null }),
    );

    // My turn on the turn card: "state" arrives before my new "private".
    socket.push(stateMessage({ stage: 'turn', currentPlayer: ME }));
    socket.push(privateMessage({ legalActions: ['fold', 'check', 'raise', 'allin'], toCall: 0 }));

    expect(button('Raise to 20')).toBeEnabled();
    expect(button('Check')).toBeEnabled();
  });

  it('shows the reason when the server refuses an action', async () => {
    mockServices({
      'POST /tables/K7QX2M/actions': () =>
        json(409, { code: 'NOT_YOUR_TURN', message: 'It is not your turn' }),
    });
    await renderLive();

    fireEvent.click(button('Fold'));
    expect(await screen.findByRole('alert')).toHaveTextContent('It is not your turn');
    expect(button('Fold')).toBeEnabled();
  });

  it('waits for the other player when it is not my turn', async () => {
    mockServices();
    await renderLive(
      stateMessage({ currentPlayer: SOFIA }),
      privateMessage({ legalActions: [], toCall: 0, minRaise: null, maxRaise: null }),
    );

    expect(screen.getByText('Waiting for Sofía')).toBeInTheDocument();
    expect(screen.getByLabelText('Sofía, 970 chips, Thinking…')).toBeInTheDocument();
    for (const name of ['Fold', 'Check', 'Call', 'Raise', 'All-in']) {
      expect(button(name)).toBeDisabled();
    }
  });

  it('shows the winner and the revealed cards at showdown', async () => {
    mockServices();
    await renderLive(
      stateMessage({
        stage: 'complete',
        currentPlayer: null,
        timerEndsAt: null,
        board: ['Kh', '9s', '9d', '4c', '2h'],
        result: {
          handNumber: 3,
          showdown: true,
          winners: [{ playerId: SOFIA, amount: 300, handName: 'Full house' }],
          revealed: { [ME]: ['As', 'Kd'], [SOFIA]: ['9h', '9c'] },
        },
      }),
      privateMessage({ legalActions: [], minRaise: null, maxRaise: null }),
    );

    expect(screen.getByText('Sofía wins')).toBeInTheDocument();
    expect(screen.getByText(/300 · Full house/)).toBeInTheDocument();
    // The winner's seat says so too
    expect(screen.getByText('Wins 300')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '9 of clubs' })).toBeInTheDocument();
  });

  it.each([true, false])(
    'returns to the same waiting room after the host pauses (host: %s)',
    async (host) => {
      const fetch = mockServices({
        'GET /tables/K7QX2M': () => json(200, { ...TABLE, createdBy: host ? ME : SOFIA }),
        'POST /tables/K7QX2M/pause': () => json(200, { ...TABLE, paused: true }),
      });
      const seats = stateMessage().seats.map((seat, i) => ({ ...seat, stack: i ? 0 : 2000 }));
      const state = stateMessage({ stage: 'complete', currentPlayer: null, paused: false, seats });
      const socket = await renderLive(state, null);
      expect(screen.getByRole('heading', { name: 'Not enough players with chips' })).toBeVisible();
      if (host) {
        fireEvent.click(button('Back to table lobby'));
        await waitFor(() => {
          const call = fetch.mock.calls.find(([url]) => url.endsWith('/tables/K7QX2M/pause'));
          expect(JSON.parse(call[1].body)).toEqual({ playerId: ME });
        });
      } else {
        expect(screen.queryByRole('button', { name: 'Back to table lobby' })).toBeNull();
      }
      socket.push({ ...state, paused: true });
      expect(await screen.findByRole('heading', { name: 'Table lobby' })).toBeVisible();
    },
  );

  it.each([true, false])(
    'finishes the active hand before returning to the lobby (host: %s)',
    async (host) => {
      const fetch = mockServices({
        'GET /tables/K7QX2M': () => json(200, { ...TABLE, createdBy: host ? ME : SOFIA }),
        'POST /tables/K7QX2M/pause': () => json(200, { ...TABLE, paused: true }),
      });
      const state = stateMessage({ paused: false });
      const socket = await renderLive(state);
      if (host) {
        fireEvent.click(button('Back to table lobby'));
        await waitFor(() => {
          const call = fetch.mock.calls.find(([url]) => url.endsWith('/tables/K7QX2M/pause'));
          expect(JSON.parse(call[1].body)).toEqual({ playerId: ME });
        });
      } else {
        expect(screen.queryByRole('button', { name: 'Back to table lobby' })).toBeNull();
      }

      socket.push({ ...state, paused: true });
      expect(
        screen.getByText('Everyone will return to the table lobby after this hand.'),
      ).toHaveAttribute('role', 'status');
      expect(button('Call 10')).toBeEnabled();
      expect(screen.queryByRole('heading', { name: 'Table lobby' })).toBeNull();

      socket.push({ ...state, stage: 'complete', paused: true, currentPlayer: null });
      expect(await screen.findByRole('heading', { name: 'Table lobby' })).toBeVisible();
    },
  );

  it('says when the connection drops and opens a new one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockServices();
    const socket = await renderLive();

    socket.drop();
    expect(screen.getByText('Connection lost. Reconnecting…')).toHaveAttribute('role', 'status');
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeSocket.all).toHaveLength(2);
    vi.useRealTimers();
  });

  it('shows what each player just did next to their seat', async () => {
    mockServices();
    await renderLive(
      stateMessage({
        currentPlayer: SOFIA,
        seats: [
          {
            seat: 0,
            playerId: ME,
            name: 'Alex',
            stack: 960,
            bet: 40,
            status: 'active',
            lastAction: { type: 'raise', amount: 40, to: 40 },
          },
          { seat: 1, playerId: SOFIA, name: 'Sofía', stack: 970, bet: 10, status: 'active' },
        ],
      }),
      privateMessage({ legalActions: [], minRaise: null, maxRaise: null }),
    );

    expect(screen.getByText('Raised to 40')).toBeInTheDocument();
    expect(screen.getByText('Thinking…')).toBeInTheDocument();
  });

  it('stops reconnecting when the table no longer exists', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockServices();
    const socket = await renderLive();

    socket.drop(4404);
    expect(screen.getByRole('heading', { name: 'Table not found' })).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(FakeSocket.all).toHaveLength(1);
    vi.useRealTimers();
  });

  it('stops reconnecting when I am not seated, or the request was malformed', async () => {
    mockServices();
    let socket = await renderLive();
    socket.drop(4403);
    expect(screen.getByRole('heading', { name: 'You’re not at this table' })).toBeInTheDocument();

    cleanup();
    FakeSocket.reset();
    socket = await renderLive();
    socket.drop(4400);
    expect(screen.getByRole('heading', { name: 'Table not found' })).toBeInTheDocument();
  });

  it('ignores messages it does not understand', async () => {
    mockServices();
    const socket = await renderLive();

    socket.onmessage({ data: 'not json' });
    socket.push({ type: 'signal', from: SOFIA, to: ME, data: {} });
    socket.push(privateMessage({ playerId: SOFIA, holeCards: ['2c', '3c'] }));
    expect(screen.queryByRole('img', { name: '2 of clubs' })).toBeNull();
    expect(screen.getByRole('img', { name: 'Ace of spades' })).toBeInTheDocument();
  });

  it('sends a player who is not seated to the waiting room', async () => {
    mockServices({ 'GET /tables/K7QX2M': () => json(200, { ...TABLE, seats: [TABLE.seats[1]] }) });
    renderTable();

    expect(await screen.findByRole('heading', { name: 'Table lobby' })).toBeInTheDocument();
  });

  it('explains a table that does not exist', async () => {
    mockServices({
      'GET /tables/K7QX2M': () => json(404, { code: 'NOT_FOUND', message: 'Table not found' }),
    });
    renderTable();

    expect(await screen.findByRole('heading', { name: 'Table not found' })).toBeInTheDocument();
  });

  it('leaves to the lobby', async () => {
    mockServices();
    renderTable();

    fireEvent.click(button('Leave table'));
    expect(await screen.findByRole('heading', { name: 'Main menu' })).toBeInTheDocument();
  });

  it('lists the gestures, dimming the ones I cannot use this turn', async () => {
    mockServices();
    await renderLive();

    const panel = screen.getByRole('region', { name: 'Gestures' });
    // Folded away at first
    expect(within(panel).queryByText('Call 10')).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Show all gestures' }));
    expect(within(panel).getByRole('button', { name: 'Hide guide' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(within(panel).getByText('Call 10')).toBeInTheDocument();
    expect(within(panel).getByText('Check (not available now)')).toBeInTheDocument();
    expect(within(panel).getByText('Fold')).toBeInTheDocument();
  });

  it('folds the action buttons away and back', async () => {
    mockServices();
    await renderLive();

    // Without a working camera in the test, gestures are not on, so the buttons start open.
    expect(button('Call 10')).toBeInTheDocument();
    fireEvent.click(button('Hide buttons'));
    expect(screen.queryByRole('button', { name: 'Call 10' })).toBeNull();
    expect(screen.getByText('Show a gesture to act')).toBeInTheDocument();
    expect(screen.getByText(/^Your turn · 0:1\d$/)).toBeInTheDocument();
    fireEvent.click(button('Show buttons'));
    expect(button('Call 10')).toBeInTheDocument();
  });

  it('shows my chips in the top bar and the leaderboard beside the table', async () => {
    mockServices({
      'GET /leaderboard': () =>
        json(200, [
          { id: SOFIA, name: 'Sofía', chips: 1400 },
          { id: ME, name: 'Alex', chips: 980 },
        ]),
    });
    renderTable();

    const board = await screen.findByRole('region', { name: 'Leaderboard' });
    const rows = within(board).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Sofía');
    expect(rows[1]).toHaveTextContent('You');
    expect(rows[1]).toHaveAttribute('aria-current', 'true');
    expect(await screen.findByText('play chips')).toBeInTheDocument();
  });
});

describe('TablePage video', () => {
  function withCamera(stream = fakeStream('mine', { audio: true })) {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    return stream;
  }
  const signals = (socket) => socket.sent.filter((message) => message.type === 'signal');

  it('shows my camera and says when there is none', async () => {
    mockServices();
    await renderLive();
    expect(screen.getAllByText('No camera').length).toBeGreaterThan(0);

    cleanup();
    FakeSocket.reset();
    withCamera();
    await renderLive();
    expect(await screen.findByLabelText('Your camera')).toBeInTheDocument();
  });

  it('sends my video offer to the other player through the game service', async () => {
    mockServices();
    withCamera();
    const socket = await renderLive();
    await waitFor(() => expect(signals(socket)).toHaveLength(1));
    expect(signals(socket)[0]).toMatchObject({ to: SOFIA });
    expect(signals(socket)[0].data.description.type).toBe('offer');
  });

  it('answers an offer relayed by the game service', async () => {
    mockServices();
    // Their id sorts before mine, so on a clash I give way and answer them.
    const EARLY = '00000000-0000-4000-8000-000000000009';
    const socket = await renderLive(
      stateMessage({
        seats: [
          { seat: 0, playerId: ME, name: 'Alex', stack: 980, bet: 0, status: 'active' },
          { seat: 1, playerId: EARLY, name: 'Eli', stack: 970, bet: 0, status: 'active' },
        ],
      }),
    );
    socket.push({
      type: 'signal',
      from: EARLY,
      fromConnection: 2,
      to: ME,
      data: { description: { type: 'offer', sdp: '' } },
    });
    await waitFor(() =>
      expect(signals(socket).map((m) => m.data.description?.type)).toContain('answer'),
    );
    const answer = signals(socket).find((m) => m.data.description?.type === 'answer');
    expect(answer.to).toBe(EARLY);
  });

  it('does not answer someone who is not seated at the table', async () => {
    mockServices();
    withCamera();
    const socket = await renderLive();
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
    mockServices();
    const stream = withCamera();
    await renderLive();
    fireEvent.click(await screen.findByRole('button', { name: 'Mute' }));
    expect(stream.getAudioTracks()[0].enabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));
    expect(stream.getAudioTracks()[0].enabled).toBe(true);
  });

  it('has no mute button without a microphone', async () => {
    mockServices();
    await renderLive();
    expect(screen.queryByRole('button', { name: 'Mute' })).toBeNull();
  });

  it('turns the camera off when leaving the table', async () => {
    mockServices();
    const stream = withCamera();
    await renderLive();
    await screen.findByLabelText('Your camera');
    cleanup();
    expect(stream.getTracks().every((track) => track.stopped)).toBe(true);
  });
});

describe('useTableSocket signals', () => {
  const hook = (code = 'K7QX2M') =>
    renderHook(({ table }) => useTableSocket(table, ME), { initialProps: { table: code } });

  it('starts signaling after admission and drops signals for an outdated socket', () => {
    const { result } = hook();
    const socket = FakeSocket.latest;
    socket.open();
    const data = { candidate: { candidate: 'c' } };
    act(() => result.current.send(SOFIA, data, 2));
    expect(socket.sent).toEqual([]);
    socket.push({ type: 'video-peers', peers: { [ME]: 1, [SOFIA]: 2 } });
    act(() => result.current.send(SOFIA, data, 2));
    socket.push({ type: 'video-peers', peers: { [ME]: 1, [SOFIA]: 3 } });
    act(() => result.current.send(SOFIA, data, 2));
    expect(socket.sent).toEqual([{ type: 'signal', to: SOFIA, toConnection: 2, data }]);
  });

  it('clears the video roster on disconnect and ignores late messages from that socket', () => {
    const { result } = hook();
    const listener = vi.fn();
    result.current.onVideo(listener);
    const socket = FakeSocket.latest;
    socket.push({ type: 'video-peers', peers: { [ME]: 1, [SOFIA]: 2 } });
    socket.drop(4404);
    expect(result.current.connection).toBe('closed');
    expect(listener).toHaveBeenLastCalledWith({ type: 'video-peers', peers: {} });
    socket.push({ type: 'signal', from: SOFIA, fromConnection: 2, data: {} });
    expect(listener).toHaveBeenLastCalledWith({ type: 'video-peers', peers: {} });
  });
});

describe('TablePage next hand', () => {
  const over = (overrides = {}) =>
    stateMessage({ stage: 'complete', currentPlayer: null, timerEndsAt: null, ...overrides });
  const quiet = () => privateMessage({ legalActions: [], minRaise: null, maxRaise: null });
  const bodyOf = (fetch, path) => {
    const call = fetch.mock.calls.find(([url]) => url.endsWith(path));
    return JSON.parse(call[1].body);
  };

  it('deals by itself by default, with no Next hand button', async () => {
    mockServices();
    await renderLive(over(), quiet());
    expect(screen.queryByRole('button', { name: 'Next hand' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Next hand: automatic' })).toBeInTheDocument();
  });

  it('waits for Next hand when the host turned the automatic deal off', async () => {
    const fetch = mockServices({ 'POST /tables/K7QX2M/next-hand': () => json(200, {}) });
    await renderLive(over({ autoNext: false }), quiet());
    fireEvent.click(screen.getByRole('button', { name: 'Next hand' }));
    await waitFor(() =>
      expect(bodyOf(fetch, '/tables/K7QX2M/next-hand')).toEqual({ playerId: ME }),
    );
  });

  it('says so while waiting between hands, and shows no button during a hand', async () => {
    mockServices();
    await renderLive(stateMessage({ autoNext: false, stage: 'waiting', handNumber: 0 }));
    expect(screen.getByText('Press Next hand when you are ready')).toBeInTheDocument();
    cleanup();
    FakeSocket.reset();
    await renderLive(stateMessage({ autoNext: false })); // a hand in progress
    expect(screen.queryByRole('button', { name: 'Next hand' })).toBeNull();
  });

  it('lets the host switch the automatic deal off and on', async () => {
    const fetch = mockServices({ 'POST /tables/K7QX2M/auto-deal': () => json(200, {}) });
    await renderLive(over(), quiet());
    fireEvent.click(screen.getByRole('button', { name: 'Next hand: automatic' }));
    await waitFor(() =>
      expect(bodyOf(fetch, '/tables/K7QX2M/auto-deal')).toEqual({
        playerId: ME,
        autoDeal: false,
      }),
    );
  });

  it('sends autoDeal true when it is already manual', async () => {
    const fetch = mockServices({ 'POST /tables/K7QX2M/auto-deal': () => json(200, {}) });
    await renderLive(over({ autoNext: false }), quiet());
    fireEvent.click(screen.getByRole('button', { name: 'Next hand: manual' }));
    await waitFor(() => expect(bodyOf(fetch, '/tables/K7QX2M/auto-deal').autoDeal).toBe(true));
  });

  it('gives the toggle to the host only, but the Next hand button to everyone', async () => {
    mockServices({ 'GET /tables/K7QX2M': () => json(200, { ...TABLE, createdBy: SOFIA }) });
    await renderLive(over({ autoNext: false }), quiet());
    expect(screen.queryByRole('button', { name: /Next hand: / })).toBeNull();
    expect(screen.getByRole('button', { name: 'Next hand' })).toBeInTheDocument();
  });

  it('shows why the server refused it', async () => {
    mockServices({
      'POST /tables/K7QX2M/next-hand': () =>
        json(409, { code: 'NOT_READY', message: 'The next hand cannot start yet' }),
    });
    await renderLive(over({ autoNext: false }), quiet());
    fireEvent.click(screen.getByRole('button', { name: 'Next hand' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The next hand cannot start yet');
    expect(screen.getByRole('button', { name: 'Next hand' })).toBeEnabled();
  });
});

describe('table helpers', () => {
  const seats = [
    { seat: 1, playerId: 'a' },
    { seat: 3, playerId: 'me' },
  ];

  it('turns the seats so I sit at the bottom', () => {
    const spots = arrangeSeats(seats, 6, 'me');
    expect(spots[0].seat.playerId).toBe('me');
    // The others fill in from my left; the empty seats come last
    expect(spots[1].seat.playerId).toBe('a');
    expect(spots.filter((s) => s.seat === null)).toHaveLength(4);
    expect(spots[5].seat).toBeNull();
    expect(arrangeSeats(seats, 6, 'nobody')[1].seat.playerId).toBe('a');
  });

  it('finds the small and big blind from the dealer', () => {
    const seat = (n, playerId, status = 'active') => ({ seat: n, playerId, status });
    // Heads-up: the dealer posts the small blind
    expect(blindPlayers([seat(0, 'a'), seat(3, 'b')], 'b')).toEqual({
      smallBlind: 'b',
      bigBlind: 'a',
    });
    // Three or more: the next two players after the dealer, skipping anyone not in the hand
    const table = [seat(0, 'a'), seat(1, 'b', 'waiting'), seat(2, 'c', 'folded'), seat(4, 'd')];
    expect(blindPlayers(table, 'd')).toEqual({ smallBlind: 'a', bigBlind: 'c' });
    expect(blindPlayers(table, 'a')).toEqual({ smallBlind: 'c', bigBlind: 'd' });
    // No hand, or no dealer at the table
    expect(blindPlayers([seat(0, 'a', 'waiting'), seat(1, 'b', 'waiting')], 'a')).toEqual({
      smallBlind: null,
      bigBlind: null,
    });
    expect(blindPlayers(table, 'nobody')).toEqual({ smallBlind: null, bigBlind: null });
  });

  it('keeps the clockwise order of the players after me', () => {
    const full = [
      { seat: 0, playerId: 'host' },
      { seat: 2, playerId: 'me' },
      { seat: 4, playerId: 'b' },
      { seat: 5, playerId: 'c' },
    ];
    const ids = arrangeSeats(full, 6, 'me').map((s) => s.seat?.playerId ?? null);
    expect(ids).toEqual(['me', 'b', 'c', 'host', null, null]);
  });

  it('keeps pot raises within the limits', () => {
    const limits = { pot: 40, toCall: 10, myBet: 0, minRaise: 20, maxRaise: 980 };
    expect(potRaise(0.5, limits)).toBe(35);
    expect(potRaise(1, limits)).toBe(60);
    expect(potRaise(0.1, limits)).toBe(20);
    expect(potRaise(100, limits)).toBe(980);
  });

  it('counts the turn timer down', () => {
    expect(secondsLeft(null)).toBeNull();
    expect(secondsLeft('2026-11-12T10:00:14.000Z', Date.parse('2026-11-12T10:00:00.500Z'))).toBe(
      14,
    );
    expect(secondsLeft('2026-11-12T10:00:00.000Z', Date.parse('2026-11-12T10:01:00.000Z'))).toBe(0);
    expect(secondsLeft('nonsense')).toBeNull();
    expect(formatClock(14)).toBe('0:14');
    expect(formatClock(75)).toBe('1:15');
  });

  it('labels seats', () => {
    const turn = { currentPlayer: 'me', myPlayerId: 'me' };
    expect(seatNote({ playerId: 'me', status: 'active' }, turn)).toBe('Your turn');
    expect(seatNote({ playerId: 'a', status: 'folded' }, turn)).toBe('Folded');
    expect(seatNote({ playerId: 'a', status: 'allin' }, turn)).toBe('All-in');
    expect(seatNote({ playerId: 'a', status: 'out' }, turn)).toBe('Out of chips');
    expect(seatNote({ playerId: 'a', status: 'waiting' }, turn)).toBe('');
  });

  it('says what a player just did, except on their turn', () => {
    const turn = { currentPlayer: 'me', myPlayerId: 'me' };
    const note = (lastAction, extra = {}) =>
      seatNote({ playerId: 'a', status: 'active', lastAction, ...extra }, turn);
    expect(note({ type: 'check', amount: 0, to: 0 })).toBe('Checked');
    expect(note({ type: 'call', amount: 25, to: 30 })).toBe('Called 25');
    expect(note({ type: 'raise', amount: 60, to: 60 })).toBe('Raised to 60');
    expect(note({ type: 'allIn', amount: 1000, to: 1000 }, { status: 'allin' })).toBe(
      'All-in 1,000',
    );
    expect(note({ type: 'fold', amount: 0, to: 0 }, { status: 'folded' })).toBe('Folded');
    expect(note(null, { status: 'allin' })).toBe('All-in');
    expect(note({ type: 'call', amount: 25, to: 30 }, { playerId: 'me' })).toBe('Your turn');
    expect(moveText(undefined)).toBe('');
  });
});
