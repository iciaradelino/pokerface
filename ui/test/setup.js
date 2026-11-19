import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { FakePeerConnection } from './fakePeerConnection.js';

// jsdom has no WebRTC: the table page connects video through this stand-in.
beforeEach(() => {
  FakePeerConnection.reset();
  vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
});

afterEach(() => cleanup());
