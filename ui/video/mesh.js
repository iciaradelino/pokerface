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
  const peers = new Map(); // playerId -> { pc, polite, makingOffer, ignoreOffer, stream, state }
  let localStream = null;

  function createPeer(remoteId) {
    const pc = new PeerConnection({ iceServers });
    // "Perfect negotiation": both sides may offer at once, and the polite one backs off.
    // Comparing ids gives both sides the same answer without talking to each other.
    const peer = {
      pc,
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
        send(remoteId, { description: pc.localDescription });
      } catch {
        // Failed to start negotiating: the next change (or a retry) will try again.
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) send(remoteId, { candidate });
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
    else {
      // Still see and hear them with no camera or microphone.
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }
    peers.set(remoteId, peer);
    return peer;
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
    peer.pc.close();
    peers.delete(remoteId);
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

    /** The other players at the table. Connects to new ones and drops those who left. */
    setPeers(ids) {
      const wanted = new Set(ids.filter((id) => id !== selfId));
      for (const id of [...peers.keys()]) if (!wanted.has(id)) removePeer(id);
      for (const id of wanted) if (!peers.has(id)) createPeer(id);
      onChange();
    },

    /** A "signal" message from another player: { description } or { candidate }. */
    async handleSignal(from, data) {
      if (from === selfId || typeof from !== 'string') return;
      if (!data?.description && !data?.candidate) return;
      const peer = peers.get(from) ?? createPeer(from);
      const { pc } = peer;
      try {
        if (data.description) {
          const collision =
            data.description.type === 'offer' &&
            (peer.makingOffer || pc.signalingState !== 'stable');
          peer.ignoreOffer = !peer.polite && collision;
          if (peer.ignoreOffer) return;
          await pc.setRemoteDescription(data.description);
          if (data.description.type === 'offer') {
            await pc.setLocalDescription();
            send(from, { description: pc.localDescription });
          }
        } else if (data.candidate) {
          try {
            await pc.addIceCandidate(data.candidate);
          } catch (error) {
            if (!peer.ignoreOffer) throw error; // candidates for an offer we ignored are expected to fail
          }
        }
      } catch {
        // A malformed or late signal from one player must not break the others.
      }
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
