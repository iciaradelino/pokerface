import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { CreatePlayerPage } from '../src/pages/CreatePlayerPage.jsx';
import { clearPlayerId, getPlayerId } from '../src/player.js';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<CreatePlayerPage />} />
        <Route path="/lobby" element={<h1>Lobby</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockFetch(impl) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const nameInput = () => screen.getByLabelText('Display name');
const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Create player & enter lobby' }));

afterEach(() => {
  vi.unstubAllGlobals();
  clearPlayerId();
});

describe('CreatePlayerPage', () => {
  it('previews the name as it is typed', () => {
    renderPage();
    expect(screen.getAllByText('Your name')).toHaveLength(2);

    fireEvent.change(nameInput(), { target: { value: 'Alex' } });
    expect(screen.getAllByText('Alex')).toHaveLength(2);
  });

  it('asks for a name before sending anything', () => {
    const fetch = mockFetch(async () => json(201, {}));
    renderPage();

    fireEvent.change(nameInput(), { target: { value: '   ' } });
    submit();

    expect(screen.getByText('Enter a name so friends know who you are.')).toBeInTheDocument();
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput()).toHaveFocus();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.change(nameInput(), { target: { value: 'A' } });
    expect(screen.queryByText('Enter a name so friends know who you are.')).toBeNull();
  });

  it('creates the player, saves the id and opens the lobby', async () => {
    const fetch = mockFetch(async () => json(201, { id: 'p-42', name: 'Alex' }));
    renderPage();

    fireEvent.change(nameInput(), { target: { value: '  Alex ' } });
    fireEvent.click(screen.getByLabelText('Pink'));
    fireEvent.click(screen.getByLabelText(/Play with gestures/));
    submit();

    expect(await screen.findByRole('heading', { name: 'Lobby' })).toBeInTheDocument();
    expect(getPlayerId()).toBe('p-42');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      name: 'Alex',
      avatar: '#FF5FA2',
      gestureSettings: { enabled: false },
    });
  });

  it('shows the service message when the name is rejected', async () => {
    mockFetch(async () => json(400, { code: 'INVALID_NAME', message: 'That name is taken.' }));
    renderPage();

    fireEvent.change(nameInput(), { target: { value: 'Alex' } });
    submit();

    expect(await screen.findByText('That name is taken.')).toBeInTheDocument();
    expect(getPlayerId()).toBeNull();
  });

  it('explains when the players service is down', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    renderPage();

    fireEvent.change(nameInput(), { target: { value: 'Alex' } });
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Player service unavailable');
    expect(screen.getByRole('button', { name: 'Create player & enter lobby' })).toBeEnabled();
  });
});
