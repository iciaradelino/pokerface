import { act } from '@testing-library/react';

/**
 * Stand-in for the browser WebSocket. Every socket the page opens is kept in FakeSocket.all,
 * so a test can open it and push the messages the game service would send.
 */
export class FakeSocket {
  static all = [];

  constructor(url) {
    this.url = url;
    this.closed = false;
    FakeSocket.all.push(this);
  }

  static get latest() {
    return FakeSocket.all.at(-1);
  }

  static reset() {
    FakeSocket.all = [];
  }

  open() {
    act(() => this.onopen?.());
  }

  send(message) {
    act(() => this.onmessage?.({ data: JSON.stringify(message) }));
  }

  /** The server or network dropped the connection. */
  drop() {
    act(() => this.onclose?.());
  }

  close() {
    this.closed = true;
  }
}
