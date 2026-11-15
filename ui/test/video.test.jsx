import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderHook, render, screen, waitFor } from '@testing-library/react';
import { CAMERA_CONSTRAINTS, cameraProblem, useVideo } from '../video/useVideo.js';
import { VideoTile, videoNotice } from '../video/VideoTile.jsx';
import { FakePeerConnection, fakeStream } from './fakePeerConnection.js';

function stubCamera(getUserMedia) {
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
}

beforeEach(() => {
  FakePeerConnection.reset();
  vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
});

afterEach(() => vi.unstubAllGlobals());

/** A signal source the test can push into, like the game service WebSocket. */
function signalSource() {
  const listeners = new Set();
  return {
    onSignal: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    push: (from, data) => act(() => listeners.forEach((listener) => listener(from, data))),
    count: () => listeners.size,
  };
}

function setup({ peerIds = ['me', 'you'], getUserMedia } = {}) {
  const source = signalSource();
  const send = vi.fn();
  if (getUserMedia) stubCamera(getUserMedia);
  const view = renderHook(
    (props) => useVideo({ playerId: 'me', peerIds, send, onSignal: source.onSignal, ...props }),
    { initialProps: {} },
  );
  return { ...view, source, send };
}

describe('cameraProblem', () => {
  it('tells a refusal from a missing camera', () => {
    expect(cameraProblem({ name: 'NotAllowedError' })).toBe('denied');
    expect(cameraProblem({ name: 'SecurityError' })).toBe('denied');
    expect(cameraProblem({ name: 'NotFoundError' })).toBe('unavailable');
    expect(cameraProblem({ name: 'NotReadableError' })).toBe('unavailable');
    expect(cameraProblem(undefined)).toBe('unavailable');
  });
});

describe('useVideo camera', () => {
  it('asks for a small video stream with a microphone, then reports it on', async () => {
    const stream = fakeStream('mine', { audio: true });
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const { result } = setup({ getUserMedia });
    expect(result.current.camera).toBe('asking');
    await waitFor(() => expect(result.current.camera).toBe('on'));
    expect(getUserMedia).toHaveBeenCalledWith(CAMERA_CONSTRAINTS);
    expect(CAMERA_CONSTRAINTS.audio).toMatchObject({ echoCancellation: true });
    expect(result.current.local).toBe(stream);
    expect(result.current.hasMic).toBe(true);
  });

  it('falls back to the camera alone when the microphone cannot be opened', async () => {
    const stream = fakeStream('mine');
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce({ name: 'NotFoundError' })
      .mockResolvedValue(stream);
    const { result } = setup({ getUserMedia });
    await waitFor(() => expect(result.current.camera).toBe('on'));
    expect(getUserMedia).toHaveBeenLastCalledWith({
      video: CAMERA_CONSTRAINTS.video,
      audio: false,
    });
    expect(result.current.hasMic).toBe(false);
  });

  it('mutes and unmutes my microphone without turning off the camera', async () => {
    const stream = fakeStream('mine', { audio: true });
    const { result } = setup({ getUserMedia: vi.fn().mockResolvedValue(stream) });
    await waitFor(() => expect(result.current.camera).toBe('on'));
    const [video, audio] = stream.getTracks();
    expect(result.current.micOn).toBe(true);
    act(() => result.current.toggleMic());
    expect(result.current.micOn).toBe(false);
    expect(audio.enabled).toBe(false);
    expect(video.enabled).toBe(true);
    act(() => result.current.toggleMic());
    expect(audio.enabled).toBe(true);
  });

  it('shares my camera with the other players', async () => {
    const stream = fakeStream('mine');
    const { result } = setup({ getUserMedia: vi.fn().mockResolvedValue(stream) });
    await waitFor(() => expect(result.current.camera).toBe('on'));
    expect(FakePeerConnection.all).toHaveLength(1); // one for "you", none for me
    expect(FakePeerConnection.all[0].senders[0].stream).toBe(stream);
  });

  it('reports a blocked camera', async () => {
    const { result } = setup({
      getUserMedia: vi.fn().mockRejectedValue({ name: 'NotAllowedError' }),
    });
    await waitFor(() => expect(result.current.camera).toBe('denied'));
    expect(result.current.local).toBeNull();
  });

  it('reports a missing camera', async () => {
    const { result } = setup({
      getUserMedia: vi.fn().mockRejectedValue({ name: 'NotFoundError' }),
    });
    await waitFor(() => expect(result.current.camera).toBe('unavailable'));
  });

  it('reports a browser without camera support', async () => {
    vi.stubGlobal('navigator', {});
    const { result } = setup();
    await waitFor(() => expect(result.current.camera).toBe('unavailable'));
  });

  it('asks again on retry', async () => {
    const stream = fakeStream('mine');
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce({ name: 'NotAllowedError' }) // camera and microphone
      .mockRejectedValueOnce({ name: 'NotAllowedError' }) // the camera alone
      .mockResolvedValue(stream);
    const { result } = setup({ getUserMedia });
    await waitFor(() => expect(result.current.camera).toBe('denied'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.camera).toBe('on'));
    expect(getUserMedia).toHaveBeenCalledTimes(3);
  });

  it('turns the camera off when leaving the table', async () => {
    const stream = fakeStream('mine');
    const { result, unmount } = setup({ getUserMedia: vi.fn().mockResolvedValue(stream) });
    await waitFor(() => expect(result.current.camera).toBe('on'));
    unmount();
    expect(stream.getTracks().every((track) => track.stopped)).toBe(true);
    expect(FakePeerConnection.all.every((pc) => pc.closed)).toBe(true);
  });

  it('turns the camera off if the player left before it was allowed', async () => {
    const stream = fakeStream('mine');
    let allow;
    const getUserMedia = vi.fn(() => new Promise((resolve) => (allow = resolve)));
    const { unmount } = setup({ getUserMedia });
    unmount();
    await act(async () => allow(stream));
    expect(stream.getTracks().every((track) => track.stopped)).toBe(true);
  });
});

describe('useVideo players', () => {
  it('connects to the players who sit down and drops those who leave', async () => {
    const { rerender } = setup({ getUserMedia: vi.fn().mockResolvedValue(fakeStream('mine')) });
    await waitFor(() => expect(FakePeerConnection.all).toHaveLength(1));
    rerender({ peerIds: ['me', 'you', 'third'] });
    expect(FakePeerConnection.all).toHaveLength(2);
    rerender({ peerIds: ['me', 'third'] });
    expect(FakePeerConnection.all.map((pc) => pc.closed)).toEqual([true, false]);
  });

  it('does not reconnect when the same players arrive in another order', () => {
    const { rerender } = setup({ getUserMedia: vi.fn().mockReturnValue(new Promise(() => {})) });
    rerender({ peerIds: ['you', 'me', 'you'] });
    expect(FakePeerConnection.all).toHaveLength(1);
  });

  it('sends my signals through the table socket', async () => {
    const { send } = setup({ getUserMedia: vi.fn().mockResolvedValue(fakeStream('mine')) });
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(send.mock.calls[0][0]).toBe('you');
    expect(send.mock.calls[0][1].description.type).toBe('offer');
  });

  it('feeds incoming signals to the connection and shows their video', async () => {
    const { result, source } = setup({
      getUserMedia: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    const theirs = fakeStream('theirs');
    source.push('you', { description: { type: 'offer', sdp: 'theirs' } });
    await waitFor(() => expect(result.current.remotes.you?.stream).toBe(theirs));
  });

  it('stops listening for signals when it unmounts', () => {
    const { source, unmount } = setup({
      getUserMedia: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    expect(source.count()).toBe(1);
    unmount();
    expect(source.count()).toBe(0);
  });
});

describe('videoNotice', () => {
  it('describes my camera problems', () => {
    expect(videoNotice({ isMe: true, camera: 'asking' })).toBe('Allow the camera…');
    expect(videoNotice({ isMe: true, camera: 'denied' })).toBe('Camera blocked');
    expect(videoNotice({ isMe: true, camera: 'unavailable' })).toBe('No camera');
    expect(videoNotice({ isMe: true, camera: 'on', stream: {} })).toBeNull();
  });

  it('describes the other players’ video', () => {
    expect(videoNotice({ stream: null, state: 'connecting' })).toBe('Connecting video…');
    expect(videoNotice({ stream: null, state: 'failed' })).toBe('Video unavailable');
    expect(videoNotice({ stream: {}, state: 'connected' })).toBeNull();
  });
});

describe('VideoTile', () => {
  it('plays a stream and mutes only my own', () => {
    const { rerender } = render(<VideoTile stream={fakeStream('s')} isMe camera="on" />);
    const mine = screen.getByLabelText('Your camera');
    expect(mine.muted).toBe(true);
    expect(mine.srcObject.id).toBe('s');
    expect(mine).toHaveClass('video-tile__video--me');
    rerender(<VideoTile stream={fakeStream('t')} state="connected" />);
    const theirs = screen.getByLabelText('Player camera');
    expect(theirs.muted).toBe(false);
    expect(theirs).not.toHaveClass('video-tile__video--me');
  });

  it('can play another player’s picture without their sound', () => {
    render(<VideoTile stream={fakeStream('s')} state="connected" silent />);
    expect(screen.getByLabelText('Player camera').muted).toBe(true);
  });

  it('shows the fallback and a notice until there is a picture', () => {
    render(
      <VideoTile stream={null} state="connecting">
        <span>silhouette</span>
      </VideoTile>,
    );
    expect(screen.getByText('silhouette')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Connecting video…');
  });

  it('offers to try again when my camera is blocked', () => {
    const onRetry = vi.fn();
    render(<VideoTile stream={null} isMe camera="denied" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('does not offer to retry for another player', () => {
    render(<VideoTile stream={null} state="failed" onRetry={() => {}} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
