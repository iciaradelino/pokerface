import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { GestureTutorial, nextPath, tutorialDone } from '../gestures/GestureTutorial.jsx';
import { WaitingRoomPage } from '../src/pages/WaitingRoomPage.jsx';
import { clearPlayerId, savePlayerId } from '../src/player.js';
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
        <Route path="/tables/:code" element={<p>Waiting room</p>} />
        <Route path="/lobby" element={<p>Lobby</p>} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText('Show a gesture.');
}

// The step list is labelled by its "n of 5 done" heading.
const steps = () => screen.getByRole('region', { name: /of 5 done/ });

describe('gesture tutorial', () => {
  it('walks through every gesture and says when each one is recognised', async () => {
    await renderTutorial();
    expect(within(steps()).getByRole('heading')).toHaveTextContent('0 of 5 done');
    expect(screen.getByText(/^Now:/)).toHaveTextContent('Check');

    frames(knock(0.4), knock(0.5), knock(0.4), knock(0.5), knock(0.4));
    expect(screen.getByRole('status')).toHaveTextContent('✓ Check recognised.');
    expect(screen.getByText(/^Now:/)).toHaveTextContent('Call');
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
    expect(screen.getByText('Waiting room')).toBeInTheDocument();
  });

  it('says which gesture it saw when it is not the one asked for', async () => {
    await renderTutorial();
    hold([hand('Thumb_Down')], 1100);
    expect(screen.getByRole('status')).toHaveTextContent('That was Fold. Try Check.');
    expect(within(steps()).getByRole('heading')).toHaveTextContent('0 of 5 done');
  });

  it('can be skipped, back to where the player came from', async () => {
    await renderTutorial();
    fireEvent.click(screen.getByRole('link', { name: 'Skip the tutorial' }));
    expect(screen.getByText('Waiting room')).toBeInTheDocument();
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
      expect(nextPath(value), value).toBe('/lobby');
    }
    // Other pages of the app are not needed here either.
    expect(nextPath('/tables/K7QX2M/play')).toBe('/lobby');
    expect(nextPath('/lobby')).toBe('/lobby');
    expect(nextPath(null)).toBe('/lobby');
  });

  it('never gives React Router a link to another site', () => {
    const external = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i; // how React Router spots one
    for (const value of ['/..//example.com', '/.//example.com', '/\\/example.com', '///x']) {
      expect(nextPath(value)).not.toMatch(external);
    }
  });

  it('does not leave the app from a crafted Skip link', async () => {
    await renderTutorial('/tutorial?next=%2F%5Cexample.com');
    expect(screen.getByRole('link', { name: 'Skip the tutorial' })).toHaveAttribute(
      'href',
      '/lobby',
    );
  });

  it('does not leave the app from a Skip link with dots in it', async () => {
    await renderTutorial('/tutorial?next=%2F..%2F%2Fexample.com');
    const skip = screen.getByRole('link', { name: 'Skip the tutorial' });
    expect(skip).toHaveAttribute('href', '/lobby');
    fireEvent.click(skip);
    expect(screen.getByText('Lobby')).toBeInTheDocument();
  });
});

describe('waiting room link to the tutorial', () => {
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

  it('offers the tutorial and comes back to the same table', async () => {
    renderRoom();
    const link = await screen.findByRole('link', { name: 'Practise gestures' });
    expect(link).toHaveAttribute('href', '/tutorial?next=%2Ftables%2FK7QX2M');
    expect(screen.getByText(/New to gestures\?/)).toBeInTheDocument();
  });

  it('words it as a refresher once the tutorial is done', async () => {
    localStorage.setItem('pokerface.gestureTutorialDone', 'yes');
    renderRoom();
    expect(await screen.findByText('Want a refresher before the game?')).toBeInTheDocument();
  });
});
