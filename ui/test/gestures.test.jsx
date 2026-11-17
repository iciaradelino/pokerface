import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { GESTURE_CAMERA, useGestures } from '../gestures/useGestures.js';
import { GesturePanel, GestureRing, gestureMessage } from '../gestures/GesturePanel.jsx';
import { TablePage } from '../src/pages/TablePage.jsx';
import { clearPlayerId, savePlayerId } from '../src/player.js';
import { FakeSocket } from './fakeSocket.js';
import { fakeStream } from './fakePeerConnection.js';
import { MY_TURN, hand } from './gestureHands.js';

// MediaPipe is replaced by a "camera" that always sees fake.hands.
const fake = vi.hoisted(() => ({ hands: [], load: null }));
vi.mock('../gestures/recognizer.js', () => ({
  loadGestureRecognizer: () => fake.load(),
  createFrameReader: () => ({ recognize: () => fake.hands }),
}));

let clock = 0;
let queued = [];

/** Runs animation frames for `ms` milliseconds, one every 50 ms. */
function runFrames(ms) {
  act(() => {
    for (let t = 0; t < ms; t += 50) {
      clock += 50;
      const due = queued;
      queued = [];
      due.forEach((callback) => callback());
    }
  });
}

function stubCamera(getUserMedia = vi.fn(async () => fakeStream('camera'))) {
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  return getUserMedia;
}

beforeEach(() => {
  clock = 0;
  queued = [];
  fake.hands = [];
  fake.load = vi.fn(async () => ({}));
  vi.stubGlobal('requestAnimationFrame', (callback) => queued.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useGestures', () => {
  function setup(props = {}) {
    return renderHook((p) => useGestures({ enabled: true, turn: MY_TURN, ...p }), {
      initialProps: props,
    });
  }

  it('stays off, without the camera, when gestures are disabled', () => {
    const getUserMedia = stubCamera();
    const { result } = setup({ enabled: false });
    expect(result.current.status).toBe('off');
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('opens the camera, then fires a held gesture with its progress', async () => {
    const getUserMedia = stubCamera();
    const onFire = vi.fn();
    const onProgress = vi.fn();
    const { result, unmount } = setup({ onFire, onProgress });
    expect(result.current.status).toBe('starting');
    await waitFor(() => expect(result.current.status).toBe('on'));
    expect(getUserMedia).toHaveBeenCalledWith(GESTURE_CAMERA);

    fake.hands = [hand('Thumb_Up')];
    runFrames(550); // the hold starts on the first frame, 50 ms in
    expect(result.current).toMatchObject({ action: 'call' });
    expect(result.current.progress).toBeGreaterThan(0.3);
    expect(onProgress).toHaveBeenCalledWith('call', 0.5);
    expect(onFire).not.toHaveBeenCalled();

    runFrames(600);
    expect(onFire).toHaveBeenCalledWith('call', undefined);
    expect(result.current.cooling).toBe(true);
    expect(onProgress).toHaveBeenLastCalledWith(null, 0);

    const stream = result.current.stream;
    unmount();
    expect(stream.getTracks()[0].stopped).toBe(true);
  });

  it('reports the raise amount and fires the raise', async () => {
    stubCamera();
    const onFire = vi.fn();
    const onRaiseAmount = vi.fn();
    const { result } = setup({ onFire, onRaiseAmount });
    await waitFor(() => expect(result.current.status).toBe('on'));

    fake.hands = [hand('Open_Palm', { y: 0.525 })];
    runFrames(200);
    expect(result.current).toMatchObject({ raising: true, raiseAmount: 500 });
    expect(onRaiseAmount).toHaveBeenCalledWith(500);

    fake.hands = [hand('Closed_Fist', { curled: true })];
    runFrames(700);
    expect(onFire).toHaveBeenCalledWith('raise', 500);
  });

  it('does not fire when it is not my turn', async () => {
    stubCamera();
    const onFire = vi.fn();
    const { result } = setup({ onFire, turn: null });
    await waitFor(() => expect(result.current.status).toBe('on'));
    fake.hands = [hand('Thumb_Up')];
    runFrames(2000);
    expect(onFire).not.toHaveBeenCalled();
    expect(result.current.action).toBeNull();
  });

  it('reuses a camera it is given and leaves it open', async () => {
    const getUserMedia = stubCamera();
    const stream = fakeStream('tiles');
    const { result, unmount } = setup({ stream });
    await waitFor(() => expect(result.current.status).toBe('on'));
    expect(result.current.stream).toBe(stream);
    expect(getUserMedia).not.toHaveBeenCalled();
    unmount();
    expect(stream.getTracks()[0].stopped).toBe(false);
  });

  it('closes the camera if gestures were turned off before it was allowed', async () => {
    const stream = fakeStream('camera');
    let allow;
    stubCamera(vi.fn(() => new Promise((resolve) => (allow = resolve))));
    const { result, rerender } = setup();
    rerender({ enabled: false });
    expect(result.current.status).toBe('off');
    await act(async () => allow(stream));
    expect(stream.getTracks().every((track) => track.stopped)).toBe(true);
    expect(result.current.status).toBe('off');
    expect(fake.load).not.toHaveBeenCalled();
  });

  it('closes the camera if the player left the table before it was allowed', async () => {
    const stream = fakeStream('camera');
    let allow;
    stubCamera(vi.fn(() => new Promise((resolve) => (allow = resolve))));
    const { unmount } = setup();
    unmount();
    await act(async () => allow(stream));
    expect(stream.getTracks().every((track) => track.stopped)).toBe(true);
    expect(fake.load).not.toHaveBeenCalled();
  });

  it('explains a blocked camera and can ask again', async () => {
    const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    const getUserMedia = stubCamera(vi.fn().mockRejectedValueOnce(denied));
    getUserMedia.mockResolvedValue(fakeStream('camera'));
    const { result } = setup();
    await waitFor(() =>
      expect(result.current).toMatchObject({ status: 'error', problem: 'denied' }),
    );

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('on'));
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('says when there is no camera at all', async () => {
    vi.stubGlobal('navigator', {});
    const { result } = setup();
    await waitFor(() =>
      expect(result.current).toMatchObject({ status: 'error', problem: 'unavailable' }),
    );
  });

  it('closes the camera when gesture recognition cannot load', async () => {
    stubCamera();
    fake.load = vi.fn(async () => {
      throw new Error('offline');
    });
    const { result } = setup();
    await waitFor(() =>
      expect(result.current).toMatchObject({ status: 'error', problem: 'model' }),
    );
    const stream = await navigator.mediaDevices.getUserMedia.mock.results[0].value;
    expect(stream.getTracks()[0].stopped).toBe(true);
  });
});

describe('GesturePanel', () => {
  const base = { status: 'on', stream: null, action: null, progress: 0, raising: false };

  it('tells the player what to do', () => {
    const say = (g, myTurn = true) => gestureMessage({ ...base, ...g }, { myTurn });
    expect(say({ status: 'off' })).toMatch(/Gestures are off/);
    expect(say({ status: 'starting' })).toMatch(/Starting the camera/);
    expect(say({ status: 'error', problem: 'denied' })).toMatch(/Camera blocked/);
    expect(say({ status: 'error', problem: 'unavailable' })).toMatch(/No camera found/);
    expect(say({ status: 'error', problem: 'model' })).toMatch(/could not load/);
    expect(say({}, false)).toBe('Gestures work on your turn.');
    expect(say({ cooling: true })).toBe('Got it.');
    expect(say({ action: 'allin' })).toBe('Hold for All-in…');
    expect(say({ raising: true, raiseAmount: 1500 })).toBe(
      'Raise to 1,500. Close your fist to confirm.',
    );
    expect(say({})).toBe('Show a gesture.');
  });

  it('draws the hold progress as a ring', () => {
    render(<GestureRing action="fold" progress={0.42} />);
    const ring = screen.getByRole('progressbar', { name: 'Holding Fold' });
    expect(ring).toHaveAttribute('aria-valuenow', '42');
  });

  it('shows my camera, the ring, the raise and the guide while on', () => {
    const stream = fakeStream('camera');
    const onToggle = vi.fn();
    render(
      <GesturePanel
        gestures={{
          ...base,
          stream,
          action: 'raise',
          progress: 0.5,
          raising: true,
          raiseAmount: 80,
        }}
        myTurn
        onToggle={onToggle}
        error="Not your turn"
      />,
    );
    expect(screen.getByLabelText('Your camera').srcObject).toBe(stream);
    expect(screen.getByRole('progressbar', { name: 'Holding Raise' })).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Not your turn');
    expect(screen.getByText(/Thumbs up, hold 1 s/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Turn off gestures' }));
    expect(onToggle).toHaveBeenCalled();
  });

  it('offers to try again after a camera problem, and to turn gestures on', () => {
    const retry = vi.fn();
    const { rerender } = render(
      <GesturePanel gestures={{ ...base, status: 'error', problem: 'denied', retry }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
    expect(screen.queryByLabelText('Your camera')).toBeNull();

    rerender(<GesturePanel gestures={{ ...base, status: 'off' }} />);
    expect(screen.getByRole('button', { name: 'Turn on gestures' })).toBeInTheDocument();
    expect(screen.queryByText(/Thumbs up/)).toBeNull();
  });
});

describe('gestures at the table', () => {
  const ME = 'aaaaaaaa-0000-4000-8000-000000000001';
  const SOFIA = 'bbbbbbbb-0000-4000-8000-000000000002';
  const TABLE = {
    id: 'K7QX2M',
    smallBlind: 5,
    bigBlind: 10,
    startingStack: 1000,
    maxSeats: 6,
    createdBy: ME,
    seats: [
      { seatIndex: 0, playerId: ME, name: 'Alex', stack: 1000 },
      { seatIndex: 1, playerId: SOFIA, name: 'Sofía', stack: 1000 },
    ],
  };
  const STATE = {
    type: 'state',
    handNumber: 3,
    stage: 'flop',
    board: ['Kh', '9s', '9d'],
    pots: [{ amount: 40, eligible: [ME, SOFIA] }],
    dealer: SOFIA,
    currentPlayer: ME,
    timerEndsAt: null,
    seats: [
      { seat: 0, playerId: ME, name: 'Alex', stack: 980, bet: 0, status: 'active' },
      { seat: 1, playerId: SOFIA, name: 'Sofía', stack: 970, bet: 10, status: 'active' },
    ],
    result: null,
  };
  const PRIVATE = {
    type: 'private',
    playerId: ME,
    holeCards: ['As', 'Kd'],
    legalActions: ['fold', 'call', 'raise', 'allin'],
    toCall: 10,
    minRaise: 20,
    maxRaise: 980,
  };

  const json = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  function mockServices({ gestureSettings = { enabled: true }, action } = {}) {
    const routes = {
      [`GET /players/${ME}`]: () =>
        json(200, { id: ME, name: 'Alex', avatar: '#B8F23A', chips: 1000, gestureSettings }),
      'GET /tables/K7QX2M': () => json(200, TABLE),
      'POST /tables/K7QX2M/actions': action ?? (() => json(200, {})),
    };
    const fetch = vi.fn(async (url, init = {}) => {
      const reply = routes[`${init.method ?? 'GET'} ${new URL(url).pathname}`];
      if (!reply) throw new TypeError('Failed to fetch');
      return reply();
    });
    vi.stubGlobal('fetch', fetch);
    return fetch;
  }

  async function renderLive() {
    render(
      <MemoryRouter initialEntries={['/tables/K7QX2M/play']}>
        <Routes>
          <Route path="/tables/:code/play" element={<TablePage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByLabelText(/^You, /);
    const socket = FakeSocket.latest;
    socket.open();
    socket.send(STATE);
    socket.send(PRIVATE);
  }

  const actionBodies = (fetch) =>
    fetch.mock.calls
      .filter(([url]) => url.endsWith('/actions'))
      .map(([, init]) => JSON.parse(init.body));

  beforeEach(() => {
    savePlayerId(ME);
    FakeSocket.reset();
    vi.stubGlobal('WebSocket', FakeSocket);
  });
  afterEach(() => clearPlayerId());

  it('calls with a thumbs up held on my turn', async () => {
    stubCamera();
    const fetch = mockServices();
    await renderLive();
    await screen.findByText('Show a gesture.');

    fake.hands = [hand('Thumb_Up')];
    runFrames(1100);
    await waitFor(() => expect(actionBodies(fetch)).toEqual([{ playerId: ME, action: 'call' }]));
  });

  it('raises to the amount picked with the palm', async () => {
    stubCamera();
    const fetch = mockServices();
    await renderLive();
    await screen.findByText('Show a gesture.');

    fake.hands = [hand('Open_Palm', { y: 0.525 })];
    runFrames(200);
    expect(screen.getByText(/Close your fist to confirm/)).toHaveTextContent('Raise to 500');
    fake.hands = [hand('Closed_Fist', { curled: true })];
    runFrames(700);
    await waitFor(() =>
      expect(actionBodies(fetch)).toEqual([{ playerId: ME, action: 'raise', amount: 500 }]),
    );
  });

  it('shows why the server refused a gesture', async () => {
    stubCamera();
    mockServices({ action: () => json(409, { message: 'Not your turn' }) });
    await renderLive();
    await screen.findByText('Show a gesture.');

    fake.hands = [hand('Thumb_Down')];
    runFrames(1100);
    expect(await screen.findByRole('alert')).toHaveTextContent('Not your turn');
  });

  it('keeps the camera off when the profile turned gestures off, until switched on', async () => {
    const getUserMedia = stubCamera();
    mockServices({ gestureSettings: { enabled: false } });
    await renderLive();
    expect(await screen.findByText('Gestures are off. Use the buttons.')).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Turn on gestures' }));
    await screen.findByText('Show a gesture.');
    expect(getUserMedia).toHaveBeenCalled();
  });
});
