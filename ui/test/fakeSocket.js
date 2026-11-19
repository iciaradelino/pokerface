import { act } from '@testing-library/react';

/**
 * Stand-in for the browser WebSocket. Every socket the page opens is kept in FakeSocket.all,
 * so a test can open it and push the messages the game service would send.
 */
export class FakeSocket {
  static all = [];
  static OPEN = 1;

  constructor(url) {
    this.url = url;
    this.closed = false;
    this.readyState = 0;
    this.sent = []; // what the page sent, parsed
    FakeSocket.all.push(this);
  }

  static get latest() {
    return FakeSocket.all.at(-1);
  }

  static reset() {
    FakeSocket.all = [];
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    act(() => this.onopen?.());
  }

  /** The page sends a message (the real WebSocket method). */
  send(text) {
    this.sent.push(JSON.parse(text));
  }

  /** The game service sends the page a message. */
  push(message) {
    act(() => this.onmessage?.({ data: JSON.stringify(message) }));
  }

  /** The server or network dropped the connection. 1006 is an abnormal close (no reason). */
  drop(code = 1006) {
    act(() => this.onclose?.({ code }));
  }

  close() {
    this.closed = true;
  }
}
