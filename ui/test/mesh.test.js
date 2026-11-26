import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ICE_SERVERS, createMesh } from '../video/mesh.js';
import { FakePeerConnection, fakeStream } from './fakePeerConnection.js';

beforeEach(() => FakePeerConnection.reset());

function makeMesh(selfId, overrides = {}) {
  const sent = [];
  const onChange = vi.fn();
  const mesh = createMesh({
    selfId,
    send: (to, data) => sent.push({ to, data }),
    onChange,
    PeerConnection: FakePeerConnection,
    ...overrides,
  });
  return { mesh, sent, onChange };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Two players whose signals reach each other, as the game service relay will do. */
function twoPlayers() {
  const meshes = {};
  const make = (id) => {
    const onChange = vi.fn();
    const mesh = createMesh({
      selfId: id,
      send: (to, data) => queueMicrotask(() => meshes[to]?.handleSignal(id, data)),
      onChange,
      PeerConnection: FakePeerConnection,
    });
    meshes[id] = mesh;
    return { mesh, onChange };
  };
  return { a: make('aaa'), b: make('bbb') };
}

describe('connecting two players', () => {
  it('each ends up with the other one’s video', async () => {
    const { a, b } = twoPlayers();
    a.mesh.setLocalStream(fakeStream('stream-a'));
    b.mesh.setLocalStream(fakeStream('stream-b'));
    a.mesh.setPeers({ aaa: 1, bbb: 2 });
    b.mesh.setPeers({ aaa: 1, bbb: 2 });

    await vi.waitFor(() => {
      expect(a.mesh.remotes().bbb.stream?.id).toBe('stream-b');
      expect(b.mesh.remotes().aaa.stream?.id).toBe('stream-a');
    });
    expect(a.onChange).toHaveBeenCalled();
  });

  it('a player with no camera still sees the others', async () => {
    const { a, b } = twoPlayers();
    b.mesh.setLocalStream(fakeStream('stream-b'));
    a.mesh.setPeers({ bbb: 2 }); // a has no camera
    b.mesh.setPeers({ aaa: 1 });

    await vi.waitFor(() => expect(a.mesh.remotes().bbb.stream?.id).toBe('stream-b'));
    expect(b.mesh.remotes().aaa.stream).toBeNull();
    expect(FakePeerConnection.all[0].transceivers).toEqual([
      { kind: 'video', direction: 'recvonly' },
      { kind: 'audio', direction: 'recvonly' },
    ]);
  });

  it('shares the camera that is turned on after connecting', async () => {
    const { a, b } = twoPlayers();
    a.mesh.setPeers({ bbb: 2 });
    b.mesh.setPeers({ aaa: 1 });
    await flush(); // the first negotiation finishes with no camera
    a.mesh.setLocalStream(fakeStream('late'));

    await vi.waitFor(() => expect(b.mesh.remotes().aaa.stream?.id).toBe('late'));
  });

  it('does not add the same track twice', () => {
    const { mesh } = makeMesh('aaa');
    const stream = fakeStream('s');
    mesh.setPeers({ bbb: 2 });
    mesh.setLocalStream(stream);
    mesh.setLocalStream(stream);
    expect(FakePeerConnection.all[0].senders).toHaveLength(1);
  });

  it('stops sending when the camera is turned off', () => {
    const { mesh } = makeMesh('aaa');
    mesh.setPeers({ bbb: 2 });
    mesh.setLocalStream(fakeStream('s'));
    mesh.setLocalStream(null);
    expect(FakePeerConnection.all[0].senders).toHaveLength(0);
  });
});

describe('who is connected', () => {
  it('opens one connection per other player and never one to itself', () => {
    const { mesh } = makeMesh('aaa');
    mesh.setPeers({ aaa: 1, bbb: 2, ccc: 3 });
    expect(FakePeerConnection.all).toHaveLength(2);
    expect(Object.keys(mesh.remotes()).sort()).toEqual(['bbb', 'ccc']);
  });

  it('keeps the existing connection when the list repeats a player', () => {
    const { mesh } = makeMesh('aaa');
    mesh.setPeers({ bbb: 2 });
    mesh.setPeers({ bbb: 2, ccc: 3 });
    expect(FakePeerConnection.all).toHaveLength(2);
  });

  it('closes the connection of a player who left', () => {
    const { mesh } = makeMesh('aaa');
    mesh.setPeers({ bbb: 2, ccc: 3 });
    mesh.setPeers({ bbb: 2 });
    expect(FakePeerConnection.all.map((pc) => pc.closed)).toEqual([false, true]);
    expect(Object.keys(mesh.remotes())).toEqual(['bbb']);
  });

  it('closes everything on close()', () => {
    const { mesh } = makeMesh('aaa');
    mesh.setPeers({ bbb: 2, ccc: 3 });
    mesh.close();
    expect(FakePeerConnection.all.every((pc) => pc.closed)).toBe(true);
    expect(mesh.remotes()).toEqual({});
  });

  it('uses public STUN only, without TURN', () => {
    const { mesh } = makeMesh('aaa');
    mesh.setPeers({ bbb: 2 });
    expect(FakePeerConnection.all[0].config.iceServers).toEqual(DEFAULT_ICE_SERVERS);
    expect(JSON.stringify(DEFAULT_ICE_SERVERS)).not.toContain('turn:');
  });
});

describe('signals', () => {
  it('relays my ICE candidates to the right player', () => {
    const { mesh, sent } = makeMesh('aaa');
    mesh.setPeers({ bbb: 2 });
    FakePeerConnection.all[0].onicecandidate({ candidate: { candidate: 'c1' } });
    FakePeerConnection.all[0].onicecandidate({ candidate: null }); // end of candidates
    expect(sent).toEqual([{ to: 'bbb', data: { candidate: { candidate: 'c1' } } }]);
  });

  it('buffers ICE that arrives before the remote description', async () => {
    const { mesh } = makeMesh('bbb');
    mesh.setPeers({ aaa: 1 });
    const pc = FakePeerConnection.all[0];
    await mesh.handleSignal('aaa', { candidate: { candidate: 'c2' } });
    expect(pc.candidates).toEqual([]);
    await mesh.handleSignal('aaa', { description: { type: 'offer', sdp: '' } });
    expect(pc.candidates).toEqual([{ candidate: 'c2' }]);
  });

  it('ignores an offer until the server lists that peer', async () => {
    const { mesh, sent } = makeMesh('aaa');
    await mesh.handleSignal('bbb', { description: { type: 'offer', sdp: '' } });
    expect(FakePeerConnection.all).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('does not answer someone who is not at the table', async () => {
    const { mesh, sent } = makeMesh('me');
    mesh.setLocalStream(fakeStream('mine', { audio: true }));
    mesh.setPeers({ me: 1, sofia: 2 });
    await flush();
    const before = sent.length; // my offer to sofia
    await mesh.handleSignal('stranger', { description: { type: 'offer', sdp: 'x' } });
    await mesh.handleSignal('stranger', { candidate: { candidate: 'c' } });
    expect(Object.keys(mesh.remotes())).toEqual(['sofia']);
    expect(FakePeerConnection.all).toHaveLength(1);
    expect(sent).toHaveLength(before);
  });

  it('stops answering a player after they leave the table', async () => {
    const { mesh, sent } = makeMesh('me');
    mesh.setPeers({ me: 1, sofia: 2 });
    mesh.setPeers({ me: 1 });
    await flush();
    const before = sent.length;
    await mesh.handleSignal('sofia', { description: { type: 'offer', sdp: '' } });
    expect(Object.keys(mesh.remotes())).toEqual([]);
    expect(sent).toHaveLength(before);
  });

  it.each(['a', 'b'])('negotiates again after player %s reconnects', async (reconnecting) => {
    const { a, b } = twoPlayers();
    a.mesh.setLocalStream(fakeStream('stream-a'));
    b.mesh.setLocalStream(fakeStream('stream-b'));
    a.mesh.setPeers({ aaa: 1, bbb: 2 });
    b.mesh.setPeers({ aaa: 1, bbb: 2 });
    await flush();

    const roster = reconnecting === 'a' ? { aaa: 3, bbb: 2 } : { aaa: 1, bbb: 3 };
    (reconnecting === 'a' ? a : b).mesh.setPeers({});
    a.mesh.setPeers(roster);
    b.mesh.setPeers(roster);
    await vi.waitFor(() => {
      expect(a.mesh.remotes().bbb.stream?.id).toBe('stream-b');
      expect(b.mesh.remotes().aaa.stream?.id).toBe('stream-a');
    });
    expect(FakePeerConnection.all.slice(0, 2).every((pc) => pc.closed)).toBe(true);
  });

  it('ignores signals from itself or without content', async () => {
    const { mesh } = makeMesh('aaa');
    await mesh.handleSignal('aaa', { candidate: {} });
    await mesh.handleSignal('bbb', null);
    await mesh.handleSignal(undefined, { candidate: {} });
    await mesh.handleSignal('bbb', {});
    expect(FakePeerConnection.all).toHaveLength(0);
  });

  it('survives a description the browser rejects', async () => {
    const { mesh, sent } = makeMesh('aaa');
    mesh.setPeers({ bbb: 2 });
    await flush();
    const before = sent.length; // my own offer
    FakePeerConnection.all[0].failNextRemote = true;
    await expect(
      mesh.handleSignal('bbb', { description: { type: 'offer', sdp: '' } }),
    ).resolves.toBeUndefined();
    expect(sent).toHaveLength(before);
  });
});

describe('both players offering at once', () => {
  async function collide(selfId, remoteId) {
    const { mesh, sent } = makeMesh(selfId);
    mesh.setPeers({ [remoteId]: 1 });
    await flush(); // I make my offer
    const pc = FakePeerConnection.all[0];
    expect(pc.signalingState).toBe('have-local-offer');
    await mesh.handleSignal(remoteId, { description: { type: 'offer', sdp: '' } });
    return { pc, sent };
  }

  it('the polite player (higher id) accepts theirs and answers', async () => {
    const { pc, sent } = await collide('bbb', 'aaa');
    expect(pc.signalingState).toBe('stable');
    expect(sent.map((item) => item.data.description.type)).toEqual(['offer', 'answer']);
  });

  it('the impolite player (lower id) ignores theirs and keeps its own', async () => {
    const { pc, sent } = await collide('aaa', 'bbb');
    expect(pc.signalingState).toBe('have-local-offer');
    expect(sent.map((item) => item.data.description.type)).toEqual(['offer']);
  });

  it('the impolite player also ignores candidates that belong to the ignored offer', async () => {
    const { mesh } = makeMesh('aaa');
    mesh.setPeers({ bbb: 2 });
    await flush();
    const pc = FakePeerConnection.all[0];
    await mesh.handleSignal('bbb', { description: { type: 'offer', sdp: '' } });
    pc.signalingState = 'closed'; // makes the next addIceCandidate throw
    await expect(
      mesh.handleSignal('bbb', { candidate: { candidate: 'x' } }),
    ).resolves.toBeUndefined();
  });
});

describe('connection state', () => {
  it('reports the state and tries again when the connection fails', () => {
    const { mesh, onChange } = makeMesh('aaa');
    mesh.setPeers({ bbb: 2 });
    const pc = FakePeerConnection.all[0];
    pc.setState('connected');
    expect(mesh.remotes().bbb.state).toBe('connected');
    pc.setState('failed');
    expect(mesh.remotes().bbb.state).toBe('failed');
    expect(pc.restarted).toBe(true);
    expect(onChange).toHaveBeenCalled();
  });

  it('does not break when negotiation fails to start', async () => {
    const { mesh } = makeMesh('aaa');
    mesh.setPeers({ bbb: 2 });
    const pc = FakePeerConnection.all[0];
    pc.setLocalDescription = async () => {
      throw new Error('nope');
    };
    await expect(pc.onnegotiationneeded()).resolves.toBeUndefined();
  });
});
