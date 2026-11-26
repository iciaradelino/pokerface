// A stand-in for RTCPeerConnection, just enough for the mesh. It follows the real signaling
// rules (offer/answer, "stable" state, negotiationneeded when tracks are added), but moves no
// video: a description carries the id of the stream it sends, and the other side's `ontrack`
// receives that same stream object.
export const streams = new Map(); // streamId -> stream, shared by all fake peer connections

export function fakeStream(id, { audio = false } = {}) {
  const tracks = ['video', ...(audio ? ['audio'] : [])].map((kind, i) => ({
    kind,
    enabled: true,
    id: `${id}-t${i}`,
    stopped: false,
    stop() {
      this.stopped = true;
    },
  }));
  const stream = {
    id,
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
  };
  streams.set(id, stream);
  return stream;
}

export class FakePeerConnection {
  static all = [];

  constructor(config) {
    this.config = config;
    this.signalingState = 'stable';
    this.connectionState = 'new';
    this.senders = [];
    this.transceivers = [];
    this.closed = false;
    this.candidates = [];
    this.restarted = false;
    FakePeerConnection.all.push(this);
  }

  static reset() {
    FakePeerConnection.all = [];
    streams.clear();
  }

  getSenders() {
    return this.senders;
  }

  addTransceiver(kind, init) {
    this.transceivers.push({ kind, ...init });
    this.needsNegotiation();
  }

  // Like a browser, ask for a new negotiation only once there is no other one in progress.
  needsNegotiation() {
    queueMicrotask(() => {
      if (this.signalingState === 'stable') this.onnegotiationneeded?.();
    });
  }

  addTrack(track, stream) {
    this.senders.push({ track, stream });
    this.needsNegotiation();
  }

  removeTrack(sender) {
    this.senders = this.senders.filter((item) => item !== sender);
  }

  async setLocalDescription() {
    const type = this.signalingState === 'have-remote-offer' ? 'answer' : 'offer';
    this.localDescription = { type, sdp: this.senders[0]?.stream.id ?? '' };
    this.signalingState = type === 'offer' ? 'have-local-offer' : 'stable';
  }

  async setRemoteDescription(description) {
    if (this.failNextRemote) {
      this.failNextRemote = false;
      throw new Error('bad description');
    }
    this.remoteDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
    if (description.sdp) this.ontrack?.({ streams: [streams.get(description.sdp)] });
  }

  async addIceCandidate(candidate) {
    if (!this.remoteDescription || this.closed) throw new Error('no remote description');
    this.candidates.push(candidate);
  }

  restartIce() {
    this.restarted = true;
  }

  close() {
    this.closed = true;
    this.signalingState = 'closed';
  }

  /** Test helper: the browser reports a new connection state. */
  setState(state) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
}
