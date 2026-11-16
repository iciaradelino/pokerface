import { WebSocketServer } from 'ws';
import { privateState, publicState } from './engine/index.js';
import { isUuid, normalizeTableId } from './validation.js';

// Close codes the UI can read to stop reconnecting (4000-4999 are free for applications).
export const CLOSE = Object.freeze({
  BAD_REQUEST: 4400, // malformed table code or playerId
  NOT_SEATED: 4403, // not at this table, or just left it
  NOT_FOUND: 4404, // no such table, or it was deleted
});

const PATH = /^\/tables\/([^/]+)\/ws$/;
export const HEARTBEAT_MS = 30_000;
const MAX_MESSAGE_BYTES = 64 * 1024; // An SDP offer is a few KB.

/**
 * Live table updates over WebSockets, on the same HTTP server as the API:
 *   ws(s)://<game>/tables/:id/ws?playerId=<uuid>
 *
 * Only the UI's origin may connect (CORS does not cover WebSockets). Only players seated at the
 * table get its updates: on connect they receive the "state" message and their own "private"
 * one, and again after every change. Several connections of the same player (two tabs) all get
 * them. The only message a client may send is a video "signal", which is relayed to the player
 * `to` at the same table with `from` set by the server.
 */
export function attachTableSockets({
  server,
  live,
  uiOrigin,
  heartbeatMs = HEARTBEAT_MS,
  logger = console.log,
}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const rooms = new Map(); // table id -> Set of { socket, playerId }

  const logLine = (path, status, started) =>
    logger(JSON.stringify({
      level: 'info',
      event: 'request',
      method: 'GET',
      path,
      status,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
    }));

  const sendJson = (socket, message) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  };

  function join(tableId, connection) {
    if (!rooms.has(tableId)) rooms.set(tableId, new Set());
    rooms.get(tableId).add(connection);
  }

  function leave(tableId, connection) {
    const room = rooms.get(tableId);
    room?.delete(connection);
    if (room?.size === 0) rooms.delete(tableId);
  }

  // Relays a video signal to every connection of `to` at the same table.
  function relay(tableId, from, raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message?.type !== 'signal' || !isUuid(message.to) || message.data === undefined) return;
    const to = message.to.toLowerCase();
    for (const connection of rooms.get(tableId) ?? []) {
      if (connection.playerId === to) {
        sendJson(connection.socket, { type: 'signal', from, to, data: message.data });
      }
    }
  }

  async function accept(socket, request, tableId, playerId, path, started) {
    const refuse = (code, reason) => {
      socket.close(code, reason);
      logLine(path, code, started);
    };
    if (!tableId || !isUuid(playerId)) return refuse(CLOSE.BAD_REQUEST, 'Invalid table code or playerId');

    const connection = { socket, playerId: playerId.toLowerCase(), alive: true };
    join(tableId, connection); // Joined before reading the state, so no update is missed.
    socket.on('close', () => leave(tableId, connection));
    socket.on('pong', () => { connection.alive = true; });
    socket.on('message', (data) => relay(tableId, connection.playerId, data.toString()));

    let game;
    try {
      game = await live.get(tableId);
    } catch {
      leave(tableId, connection);
      return refuse(1011, 'Tables unavailable');
    }
    if (!game) {
      leave(tableId, connection);
      return refuse(CLOSE.NOT_FOUND, 'Table not found');
    }
    if (!game.seats.some((seat) => seat?.id === connection.playerId)) {
      leave(tableId, connection);
      return refuse(CLOSE.NOT_SEATED, 'You are not at this table');
    }
    const view = await live.view(tableId, connection.playerId);
    sendJson(socket, view.state);
    sendJson(socket, view.private);
    logLine(path, 101, started);
  }

  function onUpgrade(request, socket, head) {
    const started = performance.now();
    const url = new URL(request.url, 'http://localhost');
    const match = PATH.exec(url.pathname);
    if (!match) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return logLine(url.pathname, 404, started);
    }
    if (request.headers.origin !== uiOrigin) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return logLine(url.pathname, 403, started);
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      accept(ws, request, normalizeTableId(match[1]), url.searchParams.get('playerId'), url.pathname, started)
        .catch(() => ws.close(1011, 'Tables unavailable'));
    });
  }
  server.on('upgrade', onUpgrade);

  // Ping every connection; one that did not answer the previous ping is dead.
  const heartbeat = setInterval(() => {
    for (const room of rooms.values()) {
      for (const connection of room) {
        if (!connection.alive) {
          connection.socket.terminate();
          continue;
        }
        connection.alive = false;
        connection.socket.ping();
      }
    }
  }, heartbeatMs);
  heartbeat.unref();

  return {
    /** Sends the new state to everyone at the table, and closes the sockets of players who left. */
    broadcast(tableId, game, { timerEndsAt = null } = {}) {
      const room = rooms.get(tableId);
      if (!room) return;
      const state = publicState(game, { timerEndsAt });
      const seated = new Set(game.seats.filter((seat) => seat !== null).map((seat) => seat.id));
      for (const connection of [...room]) {
        if (!seated.has(connection.playerId)) {
          leave(tableId, connection);
          connection.socket.close(CLOSE.NOT_SEATED, 'You left the table');
          continue;
        }
        sendJson(connection.socket, state);
        sendJson(connection.socket, privateState(game, connection.playerId));
      }
    },

    /** Closes every socket of a deleted table. */
    closeTable(tableId) {
      for (const connection of rooms.get(tableId) ?? []) {
        connection.socket.close(CLOSE.NOT_FOUND, 'The table was deleted');
      }
      rooms.delete(tableId);
    },

    /** Number of open connections at a table (for tests). */
    count: (tableId) => rooms.get(tableId)?.size ?? 0,

    close() {
      server.off('upgrade', onUpgrade);
      clearInterval(heartbeat);
      for (const room of rooms.values()) for (const { socket } of room) socket.terminate();
      rooms.clear();
      wss.close();
    },
  };
}