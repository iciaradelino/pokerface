import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { TablePage } from '../src/pages/TablePage.jsx';
import { clearPlayerId, savePlayerId } from '../src/player.js';
import {
  arrangeSeats,
  formatClock,
  potRaise,
  secondsLeft,
  seatNote,
} from '../src/table/tableView.js';
import { FakeSocket } from './fakeSocket.js';

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
        <Route path="/lobby" element={<h1>Lobby</h1>} />
        <Route path="/tables/:code" element={<h1>Waiting room</h1>} />
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
  socket.send(state);
  if (mine) socket.send(mine);
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
    expect(screen.getByRole('status')).toHaveTextContent('Connecting to the table…');
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
    socket.send(stateMessage({ stage: 'turn', currentPlayer: ME }));
    socket.send(privateMessage({ legalActions: ['fold', 'check', 'raise', 'allin'], toCall: 0 }));

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
    expect(screen.getByRole('img', { name: '9 of clubs' })).toBeInTheDocument();
  });

  it('says when the connection drops and opens a new one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockServices();
    const socket = await renderLive();

    socket.drop();
    expect(screen.getByRole('status')).toHaveTextContent('Connection lost. Reconnecting…');
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeSocket.all).toHaveLength(2);
    vi.useRealTimers();
  });

  it('ignores messages it does not understand', async () => {
    mockServices();
    const socket = await renderLive();

    socket.onmessage({ data: 'not json' });
    socket.send({ type: 'signal', from: SOFIA, to: ME, data: {} });
    socket.send(privateMessage({ playerId: SOFIA, holeCards: ['2c', '3c'] }));
    expect(screen.queryByRole('img', { name: '2 of clubs' })).toBeNull();
    expect(screen.getByRole('img', { name: 'Ace of spades' })).toBeInTheDocument();
  });

  it('sends a player who is not seated to the waiting room', async () => {
    mockServices({ 'GET /tables/K7QX2M': () => json(200, { ...TABLE, seats: [TABLE.seats[1]] }) });
    renderTable();

    expect(await screen.findByRole('heading', { name: 'Waiting room' })).toBeInTheDocument();
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
    expect(await screen.findByRole('heading', { name: 'Lobby' })).toBeInTheDocument();
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
    expect(spots[4].seat.playerId).toBe('a');
    expect(spots.filter((s) => s.seat === null)).toHaveLength(4);
    expect(arrangeSeats(seats, 6, 'nobody')[1].seat.playerId).toBe('a');
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
});
