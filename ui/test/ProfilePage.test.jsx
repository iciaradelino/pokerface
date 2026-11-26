import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { ProfilePage, signedChips } from '../src/pages/ProfilePage.jsx';
import { TopBar } from '../src/components/TopBar.jsx';
import { clearPlayerId, getPlayerId, savePlayerId } from '../src/player.js';

const ME = 'aaaaaaaa-0000-4000-8000-000000000001';
const ALEX = {
  id: ME,
  name: 'Alex',
  avatar: '#B8F23A',
  chips: 1450,
  gestureSettings: { enabled: true, holdMs: 1000, extra: 'kept' },
};
const HISTORY = {
  since: '2026-10-03T10:00:00.000Z',
  handsPlayed: 12,
  recent: [
    { handId: 'h2', delta: -50, playedAt: '2026-11-20T18:30:00.000Z' },
    { handId: 'h1', delta: 450, playedAt: '2026-11-20T18:20:00.000Z' },
  ],
};
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

/** Fake players service: `routes` maps "METHOD /path" to a function returning a Response. */
function mockServices(routes = {}) {
  const all = {
    [`GET /players/${ME}`]: () => json(200, ALEX),
    [`GET /players/${ME}/history`]: () => json(200, HISTORY),
    'GET /leaderboard': () => json(200, BOARD),
    ...routes,
  };
  const fetch = vi.fn(async (url, init = {}) => {
    const reply = all[`${init.method ?? 'GET'} ${new URL(url).pathname}`];
    if (!reply) throw new TypeError('Failed to fetch');
    return reply(init);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function Where() {
  const { pathname, search } = useLocation();
  return <h1>At {pathname + search}</h1>;
}

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

const save = () => screen.getByRole('button', { name: 'Save changes' });

beforeEach(() => savePlayerId(ME));
afterEach(() => {
  vi.unstubAllGlobals();
  clearPlayerId();
});

describe('ProfilePage', () => {
  it('shows chips, rank, hands played and the latest hands', async () => {
    mockServices();
    renderProfile();

    expect(await screen.findByText('Playing since October 2026')).toBeInTheDocument();
    const card = screen.getByRole('complementary', { name: 'Your player' });
    expect(within(card).getByText('1,450')).toBeInTheDocument();
    expect(within(card).getByText('#2')).toBeInTheDocument();
    expect(within(card).getByText('12')).toBeInTheDocument();

    const hands = screen.getAllByRole('listitem');
    expect(hands).toHaveLength(2);
    expect(hands[0]).toHaveTextContent('Lost');
    expect(hands[0]).toHaveTextContent('−50');
    expect(hands[1]).toHaveTextContent('Won');
    expect(hands[1]).toHaveTextContent('+450');
  });

  it('says so when there are no hands yet, or the history is unavailable', async () => {
    mockServices({
      [`GET /players/${ME}/history`]: () => json(200, { ...HISTORY, handsPlayed: 0, recent: [] }),
    });
    const { unmount } = renderProfile();
    expect(await screen.findByText(/No hands yet/)).toBeInTheDocument();
    unmount();

    mockServices({ [`GET /players/${ME}/history`]: () => json(503, {}) });
    renderProfile();
    expect(await screen.findByText(/Hand history unavailable/)).toBeInTheDocument();
  });

  it('saves a new name, colour and gesture settings, keeping other settings', async () => {
    const fetch = mockServices({
      [`PUT /players/${ME}`]: (init) => json(200, { ...ALEX, ...JSON.parse(init.body) }),
    });
    renderProfile();

    const name = await screen.findByLabelText('Display name');
    expect(save()).toBeDisabled();

    fireEvent.change(name, { target: { value: '  Alexa ' } });
    fireEvent.click(screen.getByLabelText('Pink'));
    fireEvent.change(screen.getByLabelText('Hold to confirm'), { target: { value: '1500' } });
    expect(screen.getByText('1.5 s')).toBeInTheDocument();
    expect(save()).toBeEnabled();
    fireEvent.click(save());

    expect(await screen.findByRole('status')).toHaveTextContent('Changes saved');
    const put = fetch.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(put[1].body)).toEqual({
      name: 'Alexa',
      avatar: '#FF5FA2',
      gestureSettings: { enabled: true, holdMs: 1500, extra: 'kept' },
    });
    expect(save()).toBeDisabled();
    // The top bar shows the saved player straight away.
    expect(screen.getByRole('button', { name: 'Alexa: open menu' })).toBeInTheDocument();
  });

  it('turns gestures off, which also disables the hold time', async () => {
    const fetch = mockServices({
      [`PUT /players/${ME}`]: (init) => json(200, { ...ALEX, ...JSON.parse(init.body) }),
    });
    renderProfile();

    const toggle = await screen.findByRole('switch', { name: /Play with gestures/ });
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Hold to confirm')).toBeDisabled();
    fireEvent.click(save());
    await screen.findByRole('status');
    const put = fetch.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(put[1].body).gestureSettings.enabled).toBe(false);
  });

  it('checks the name before saving and shows what the service refused', async () => {
    const fetch = mockServices({
      [`PUT /players/${ME}`]: () =>
        json(400, { code: 'INVALID_INPUT', message: 'name is required and must be 1 to 30' }),
    });
    renderProfile();

    const name = await screen.findByLabelText('Display name');
    fireEvent.change(name, { target: { value: '   ' } });
    fireEvent.click(save());
    expect(screen.getByText('Enter a name so friends know who you are.')).toBeInTheDocument();
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);

    fireEvent.change(name, { target: { value: 'Al' } });
    fireEvent.click(save());
    expect(await screen.findByText('name is required and must be 1 to 30')).toBeInTheDocument();
  });

  it('keeps the changes when the service is down', async () => {
    mockServices({ [`PUT /players/${ME}`]: () => json(503, {}) });
    renderProfile();

    fireEvent.change(await screen.findByLabelText('Display name'), { target: { value: 'Al' } });
    fireEvent.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent(/changes are not saved yet/);
    expect(screen.getByLabelText('Display name')).toHaveValue('Al');
  });

  it('shows a banner when the players service cannot be reached', async () => {
    mockServices({ [`GET /players/${ME}`]: () => json(503, {}) });
    renderProfile();
    expect(await screen.findByRole('alert')).toHaveTextContent('Player service unavailable');
  });

  it('starts over when the player no longer exists', async () => {
    mockServices({
      [`GET /players/${ME}`]: () => json(404, { code: 'NOT_FOUND', message: 'Player not found' }),
    });
    renderProfile();
    expect(await screen.findByRole('heading', { name: 'At /' })).toBeInTheDocument();
    expect(getPlayerId()).toBeNull();
  });

  it('deletes the player only after confirming, then starts over', async () => {
    const fetch = mockServices({
      [`DELETE /players/${ME}`]: () => new Response(null, { status: 204 }),
    });
    renderProfile();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete player' }));
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete player' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete my player' }));

    expect(await screen.findByRole('heading', { name: 'At /' })).toBeInTheDocument();
    expect(getPlayerId()).toBeNull();
  });

  it('keeps the player when deleting fails', async () => {
    mockServices({ [`DELETE /players/${ME}`]: () => json(503, {}) });
    renderProfile();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete player' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete my player' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('was not deleted');
    expect(getPlayerId()).toBe(ME);
  });

  it('links to the gesture practice and back to the profile', async () => {
    mockServices();
    renderProfile();
    fireEvent.click(await screen.findByRole('link', { name: /Practise gestures/ }));
    expect(
      screen.getByRole('heading', { name: 'At /tutorial?next=%2Fprofile' }),
    ).toBeInTheDocument();
  });

  it('formats chip changes with a sign', () => {
    expect(signedChips(1450)).toBe('+1,450');
    expect(signedChips(-900)).toBe('−900');
    expect(signedChips(0)).toBe('0');
  });
});

describe('TopBar menu', () => {
  function renderBar(path = '/menu') {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <TopBar player={ALEX} />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  const avatar = () => screen.getByRole('button', { name: 'Alex: open menu' });

  it('opens from the avatar and goes to the profile', () => {
    renderBar();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    fireEvent.click(avatar());
    expect(avatar()).toHaveAttribute('aria-expanded', 'true');

    const menu = screen.getByRole('navigation', { name: 'Menu' });
    expect(within(menu).getByRole('link', { name: 'Main menu' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    fireEvent.click(within(menu).getByRole('link', { name: 'Profile & settings' }));
    expect(screen.getByRole('heading', { name: 'At /profile' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('closes on Escape and on a click outside', () => {
    renderBar();
    fireEvent.click(avatar());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(avatar()).toHaveFocus();

    fireEvent.click(avatar());
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
