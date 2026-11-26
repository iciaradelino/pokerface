// Peer-to-peer video for one table: one RTCPeerConnection per other player (a "mesh").
// Fine for up to 6 players (README). Public STUN only, no TURN (plan.md §2), so two players
// behind strict NATs may not connect. The tile then shows "Video unavailable".
//
// This file knows nothing about React or the WebSocket. The caller gives it `send(to, data)`
// for outgoing signals and calls `handleSignal(from, data)` for incoming ones, so it can be
// tested with fakes and the transport can change without touching it.

export const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

/**
 * @param {object}   options
 * @param {string}   options.selfId        my player id
 * @param {Function} options.send          (toPlayerId, data) => void, relays a signal
 * @param {Function} [options.onChange]    called whenever a remote stream or state changes
 * @param {object[]} [options.iceServers]
 * @param {Function} [options.PeerConnection] RTCPeerConnection, replaceable in tests
 */
export function createMesh({
  selfId,
  send,
  onChange = () => {},
  iceServers = DEFAULT_ICE_SERVERS,
  PeerConnection = globalThis.RTCPeerConnection,
}) {
  const peers = new Map();
  let localStream = null;

  function createPeer(remoteId, connectionId) {
    const pc = new PeerConnection({ iceServers });
    // "Perfect negotiation": both sides may offer at once, and the polite one backs off.
    // Comparing ids gives both sides the same answer without talking to each other.
    const peer = {
      pc,
      connectionId,
      incoming: Promise.resolve(),
      pendingCandidates: [],
      polite: selfId > remoteId,
      makingOffer: false,
      ignoreOffer: false,
      stream: null,
      state: 'connecting',
    };

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        sendToPeer(remoteId, peer, { description: pc.localDescription });
      } catch {
        // Failed to start negotiating: the next change (or a retry) will try again.
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) sendToPeer(remoteId, peer, { candidate });
    };
    pc.ontrack = ({ streams }) => {
      peer.stream = streams[0] ?? null;
      onChange();
    };
    pc.onconnectionstatechange = () => {
      peer.state = pc.connectionState;
      if (pc.connectionState === 'failed') pc.restartIce?.();
      onChange();
    };

    if (localStream) addLocalTracks(peer);
    // Still receive both media kinds when my camera or microphone is missing.
    for (const kind of ['video', 'audio']) {
      if (!localStream?.getTracks().some((track) => track.kind === kind)) {
        pc.addTransceiver(kind, { direction: 'recvonly' });
      }
    }
    peers.set(remoteId, peer);
    return peer;
  }

  function sendToPeer(id, peer, data) {
    if (peers.get(id) === peer) send(id, data, peer.connectionId);
  }

  function addLocalTracks({ pc }) {
    const already = new Set(pc.getSenders().map((sender) => sender.track));
    for (const track of localStream.getTracks()) {
      if (!already.has(track)) pc.addTrack(track, localStream);
    }
  }

  function removePeer(remoteId) {
    const peer = peers.get(remoteId);
    if (!peer) return;
    peers.delete(remoteId);
    peer.pc.close();
  }

  async function receive(from, peer, data) {
    if (peers.get(from) !== peer) return;
    const { pc } = peer;
    try {
      if (data.description) {
        const collision =
          data.description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) {
          peer.pendingCandidates = [];
          return;
        }
        await pc.setRemoteDescription(data.description);
        for (const candidate of peer.pendingCandidates.splice(0)) {
          await addCandidate(pc, candidate);
        }
        if (data.description.type === 'offer') {
          await pc.setLocalDescription();
          sendToPeer(from, peer, { description: pc.localDescription });
        }
      } else if (!peer.ignoreOffer) {
        if (pc.remoteDescription) await addCandidate(pc, data.candidate);
        else if (peer.pendingCandidates.length < 50) peer.pendingCandidates.push(data.candidate);
      }
    } catch {
      // A malformed or late description must not break this connection.
    }
  }

  async function addCandidate(pc, candidate) {
    try {
      await pc.addIceCandidate(candidate);
    } catch {
      // A candidate can belong to an offer replaced during a collision.
    }
  }

  return {
    /** My camera, or null when there is none (or it was turned off). */
    setLocalStream(stream) {
      localStream = stream;
      for (const peer of peers.values()) {
        if (stream) addLocalTracks(peer);
        else {
          for (const sender of peer.pc.getSenders()) if (sender.track) peer.pc.removeTrack(sender);
        }
      }
    },

    /** Admitted video sockets, keyed by player id. A reconnect replaces only that peer. */
    setPeers(roster) {
      for (const [id, peer] of peers) {
        if (roster[id] !== peer.connectionId) removePeer(id);
      }
      for (const [id, connectionId] of Object.entries(roster)) {
        if (id !== selfId && !peers.has(id)) createPeer(id, connectionId);
      }
      onChange();
    },

    /** Process a peer's descriptions and ICE candidates in the order they arrived. */
    handleSignal(from, data) {
      const peer = peers.get(from);
      if (!peer || (!data?.description && !data?.candidate)) return;
      peer.incoming = peer.incoming.then(() => receive(from, peer, data));
      return peer.incoming;
    },

    /** Who I can currently see: { [playerId]: { stream, state } }. */
    remotes() {
      return Object.fromEntries(
        [...peers].map(([id, { stream, state }]) => [id, { stream, state }]),
      );
    },

    close() {
      for (const id of [...peers.keys()]) removePeer(id);
    },
  };
}
