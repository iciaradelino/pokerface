import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { GestureTutorial, nextPath, tutorialDone } from '../gestures/GestureTutorial.jsx';
import { WaitingRoomPage } from '../src/pages/WaitingRoomPage.jsx';
import { clearPlayerId, savePlayerId } from '../src/player.js';
import { FakeSocket } from './fakeSocket.js';
import { fakeStream } from './fakePeerConnection.js';
import { hand } from './gestureHands.js';

// MediaPipe is replaced by a "camera" that sees fake.hands.
const fake = vi.hoisted(() => ({ hands: [] }));
vi.mock('../gestures/recognizer.js', () => ({
  loadGestureRecognizer: async () => ({}),
  createFrameReader: () => ({ recognize: () => fake.hands }),
}));

const ME = 'aaaaaaaa-0000-4000-8000-000000000001';
let clock = 0;
let queued = [];
let camera;

/** One animation frame, 50 ms apart, for each set of hands. */
function frames(...handsPerFrame) {
  act(() => {
    for (const hands of handsPerFrame) {
      fake.hands = hands;
      clock += 50;
      const due = queued;
      queued = [];
      due.forEach((callback) => callback());
    }
  });
}

/** Shows the same hands for `ms` milliseconds. */
const hold = (hands, ms) => frames(...Array.from({ length: ms / 50 }, () => hands));
/** Waits out the pause after a gesture fires, with no hand in view. */
const rest = () => hold([], 1500);
const knock = (tipY) => [hand('Closed_Fist', { curled: true, tipY })];

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  clock = 0;
  queued = [];
  fake.hands = [];
  localStorage.clear();
  savePlayerId(ME);
  camera = fakeStream('camera');
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => camera) } });
  vi.stubGlobal('requestAnimationFrame', (callback) => queued.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      json(200, { id: ME, name: 'Alex', avatar: '#B8F23A', chips: 1000, gestureSettings: {} }),
    ),
  );
});

afterEach(() => {
  clearPlayerId();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderTutorial(url = '/tutorial?next=%2Ftables%2FK7QX2M') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/tutorial" element={<GestureTutorial />} />
        <Route path="/tables/:code" element={<p>Table lobby</p>} />
        <Route path="/menu" element={<p>Main menu</p>} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText('Show a gesture.');
}

// How many are learned, from the bar under the title; and the gesture being practised now.
const learned = () =>
  screen.getByRole('progressbar', { name: 'Gestures learned' }).getAttribute('aria-valuenow');
const practising = () => screen.getByRole('heading', { level: 2 });
const badgeOf = (name) =>
  within(screen.getByRole('region', { name: 'All gestures' }))
    .getByText(name, { selector: '.tutorial__item-name' })
    .closest('li');

describe('gesture tutorial', () => {
  it('walks through every gesture and says when each one is recognised', async () => {
    await renderTutorial();
    expect(screen.getByText('0 of 5 learned')).toBeInTheDocument();
    expect(practising()).toHaveTextContent('Check');
    expect(badgeOf('Check')).toHaveTextContent('Now');

    frames(knock(0.4), knock(0.5), knock(0.4), knock(0.5), knock(0.4));
    expect(screen.getByRole('status')).toHaveTextContent('✓ Check recognised.');
    expect(practising()).toHaveTextContent('Call');
    expect(badgeOf('Check')).toHaveTextContent('Learned');
    expect(learned()).toBe('1');
    rest();

    hold([hand('Thumb_Up')], 1100);
    expect(screen.getByRole('status')).toHaveTextContent('✓ Call recognised.');
    rest();

    hold([hand('Thumb_Down')], 1100);
    rest();

    hold([hand('Open_Palm', { y: 0.525 })], 200);
    expect(screen.getAllByText('Raise 510').length).toBeGreaterThan(0); // the ring's label
    hold([hand('Closed_Fist', { curled: true })], 700);
    expect(screen.getByRole('status')).toHaveTextContent('✓ Raise to 510 recognised.');
    rest();

    expect(tutorialDone()).toBe(false);
    hold([hand('ILoveYou')], 1100);

    expect(await screen.findByRole('heading', { name: /You’re ready/ })).toBeInTheDocument();
    expect(tutorialDone()).toBe(true);
    expect(camera.getTracks()[0].stopped).toBe(true); // camera off once it is done
    fireEvent.click(screen.getByRole('link', { name: 'Continue' }));
    expect(screen.getByText('Table lobby')).toBeInTheDocument();
  });

  it('says which gesture it saw when it is not the one asked for', async () => {
    await renderTutorial();
    hold([hand('Thumb_Down')], 1100);
    expect(screen.getByRole('status')).toHaveTextContent('That was Fold. Try Check.');
    expect(learned()).toBe('0');
  });

  it('shows when a hand is tracked and how long is left to hold', async () => {
    await renderTutorial();
    expect(screen.getByText('No hand in view')).toBeInTheDocument();
    hold([hand('Thumb_Up')], 550);
    expect(screen.getByText('Hand tracked')).toBeInTheDocument();
    expect(
      screen.getByText('Thumbs up', { selector: '.tutorial__hold-title' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Keep holding… 0\.[4-5] s$/)).toBeInTheDocument();
  });

  it('moves on to the next gesture and comes back to the skipped one at the end', async () => {
    await renderTutorial();
    fireEvent.click(screen.getByRole('button', { name: 'Next gesture' }));
    expect(practising()).toHaveTextContent('Call');
    expect(badgeOf('Check')).toHaveTextContent('Next');

    for (const name of ['Call', 'Fold', 'Raise']) {
      expect(practising()).toHaveTextContent(name);
      fireEvent.click(screen.getByRole('button', { name: 'Next gesture' }));
    }
    expect(practising()).toHaveTextContent('All-in');
    fireEvent.click(screen.getByRole('button', { name: 'Next gesture' }));
    expect(practising()).toHaveTextContent('Check');
  });

  it('uses the hold time from the profile in the explanation', async () => {
    fetch.mockImplementation(async () =>
      json(200, {
        id: ME,
        name: 'Alex',
        avatar: '#B8F23A',
        chips: 1000,
        gestureSettings: { holdMs: 1500 },
      }),
    );
    await renderTutorial();
    fireEvent.click(screen.getByRole('button', { name: 'Next gesture' }));
    // The hold time keeps "1.5 s" on one line with a no-break space.
    expect(
      await screen.findByText('Show a thumbs up and hold it for 1.5 s to match the bet.', {
        normalizer: (text) => text,
      }),
    ).toBeInTheDocument();
  });

  it('can be skipped, back to where the player came from', async () => {
    await renderTutorial();
    fireEvent.click(screen.getByRole('link', { name: 'Skip for now' }));
    expect(screen.getByText('Table lobby')).toBeInTheDocument();
    expect(camera.getTracks()[0].stopped).toBe(true);
    expect(tutorialDone()).toBe(false);
  });

  it('explains a blocked camera and can ask again', async () => {
    const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(denied);
    render(
      <MemoryRouter initialEntries={['/tutorial']}>
        <Routes>
          <Route path="/tutorial" element={<GestureTutorial />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Camera blocked/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Show a gesture.');
  });

  it('only goes back to a waiting room, or else the lobby', () => {
    expect(nextPath('/tables/K7QX2M')).toBe('/tables/K7QX2M');
    expect(nextPath('/tables/k7qx2m')).toBe('/tables/K7QX2M');
    // Every way of writing another site that browsers or React Router would follow.
    for (const value of [
      'https://example.com',
      '//example.com',
      '/\\example.com',
      '/\t/example.com',
      '/\n/example.com',
      '/..//example.com',
      '/.//example.com',
      '/%2F%2Fexample.com',
      '/%5Cexample.com',
      'javascript:alert(1)',
      '/tables/K7QX2M//example.com',
      '/tables/../..//example.com',
      '/tables/K7QX2M?next=//example.com',
      '/tables/K7QX2M#//example.com',
      ' /tables/K7QX2M',
    ]) {
      expect(nextPath(value), value).toBe('/menu');
    }
    // Other pages of the app are not needed here either.
    expect(nextPath('/tables/K7QX2M/play')).toBe('/menu');
    expect(nextPath('/menu')).toBe('/menu');
    expect(nextPath('/lobby')).toBe('/menu');
    expect(nextPath(null)).toBe('/menu');
  });

  it('never gives React Router a link to another site', () => {
    const external = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i; // how React Router spots one
    for (const value of ['/..//example.com', '/.//example.com', '/\\/example.com', '///x']) {
      expect(nextPath(value)).not.toMatch(external);
    }
  });

  it('does not leave the app from a crafted Skip link', async () => {
    await renderTutorial('/tutorial?next=%2F%5Cexample.com');
    expect(screen.getByRole('link', { name: 'Skip for now' })).toHaveAttribute('href', '/menu');
  });

  it('does not leave the app from a Skip link with dots in it', async () => {
    await renderTutorial('/tutorial?next=%2F..%2F%2Fexample.com');
    const skip = screen.getByRole('link', { name: 'Skip for now' });
    expect(skip).toHaveAttribute('href', '/menu');
    fireEvent.click(skip);
    expect(screen.getByText('Main menu')).toBeInTheDocument();
  });
});

describe('gesture practice in the waiting room', () => {
  function renderRoom() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const path = new URL(url).pathname;
        if (path.startsWith('/players/')) {
          return json(200, { id: ME, name: 'Alex', avatar: '#B8F23A', chips: 1000 });
        }
        return json(200, {
          table: {
            id: 'K7QX2M',
            smallBlind: 5,
            bigBlind: 10,
            startingStack: 1000,
            maxSeats: 6,
            createdBy: ME,
            paused: true,
            seats: [{ seatIndex: 0, playerId: ME, name: 'Alex', stack: 1000 }],
          },
        });
      }),
    );
    render(
      <MemoryRouter initialEntries={['/tables/K7QX2M']}>
        <Routes>
          <Route path="/tables/:code" element={<WaitingRoomPage pollMs={60_000} />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('practises and returns without opening another socket or joining again', async () => {
    renderRoom();
    const practice = await screen.findByRole('button', { name: 'Practise gestures' });
    expect(screen.getByText(/New to gestures\?/)).toBeInTheDocument();
    const socket = FakeSocket.latest;
    fireEvent.click(practice);
    expect(screen.getByRole('heading', { name: 'Table lobby' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Check' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your camera', { selector: 'video' }).srcObject).toBe(camera);
    fireEvent.click(screen.getByRole('button', { name: 'Exit practice' }));
    expect(screen.getByRole('list', { name: 'Seats' })).toBeInTheDocument();
    expect(FakeSocket.all).toEqual([socket]);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/join'))).toHaveLength(1);
    expect(socket.closed).toBe(false);
  });

  it('returns to the lobby on the last gesture and confirms completion inline', async () => {
    renderRoom();
    fireEvent.click(await screen.findByRole('button', { name: 'Practise gestures' }));
    await screen.findByText('No hand in view');
    const socket = FakeSocket.latest;

    frames(knock(0.4), knock(0.5), knock(0.4), knock(0.5), knock(0.4));
    rest();
    hold([hand('Thumb_Up')], 1100);
    rest();
    hold([hand('Thumb_Down')], 1100);
    rest();
    hold([hand('Open_Palm', { y: 0.525 })], 200);
    hold([hand('Closed_Fist', { curled: true })], 700);
    rest();
    hold([hand('ILoveYou')], 1100);

    expect(screen.getByRole('list', { name: 'Seats' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Gestures' })).getByRole('status'),
    ).toHaveTextContent('All five gestures learned.');
    expect(screen.getByRole('button', { name: 'Practise gestures' })).toHaveFocus();
    expect(screen.queryByRole('heading', { name: /You’re ready/ })).toBeNull();
    expect(tutorialDone()).toBe(true);
    expect(FakeSocket.all).toEqual([socket]);
    expect(camera.getTracks()[0].stopped).toBe(false);
  });

  it('words it as a refresher once the tutorial is done', async () => {
    localStorage.setItem('pokerface.gestureTutorialDone', 'yes');
    renderRoom();
    expect(await screen.findByText('Want a refresher before the game?')).toBeInTheDocument();
  });
});
