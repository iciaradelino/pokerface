import { useCallback, useEffect, useRef, useState } from 'react';
import { gameApi } from '../api/gameApi.js';

const RETRY_MS = [1000, 2000, 4000, 8000];

/**
 * Close codes from the game service (services/game/src/tableSockets.js) that mean trying again
 * cannot help: 4400 malformed code or player id, 4403 not seated at this table, 4404 no such table.
 */
export const FINAL_CLOSE_CODES = new Set([4400, 4403, 4404]);

/**
 * Live table updates over the game service WebSocket (plan.md §6).
 * Returns { state, mine, connection, closeCode, send, onVideo }:
 *   state       last "state" message (same for everyone), or null before the first one
 *   mine        last "private" message (your cards and legal actions), or null
 *   connection  "connecting" | "open" | "reconnecting" | "closed"
 *   closeCode   when "closed": 4400, 4403 or 4404 (see FINAL_CLOSE_CODES)
 * If the socket drops it reconnects after 1, 2, 4 then every 8 seconds; the server sends the
 * full state again on connect, so nothing is lost. It stops for good on a FINAL_CLOSE_CODES
 * close.
 * Video uses the admitted socket list, which the server sends before relaying signals.
 * onVideo(listener) reports roster changes and incoming signals in wire order.
 */
export function useTableSocket(code, playerId) {
  const [state, setState] = useState(null);
  const [mine, setMine] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [closeCode, setCloseCode] = useState(null);
  const socketRef = useRef(null);
  const listenersRef = useRef(new Set());

  const rosterRef = useRef({});

  const send = useCallback((to, data, toConnection) => {
    const socket = socketRef.current;
    if (
      socket?.readyState === WebSocket.OPEN &&
      toConnection != null &&
      rosterRef.current[to] === toConnection
    ) {
      socket.send(JSON.stringify({ type: 'signal', to, toConnection, data }));
    }
  }, []);

  const onVideo = useCallback((listener) => {
    listenersRef.current.add(listener);
    listener({ type: 'video-peers', peers: rosterRef.current });
    return () => listenersRef.current.delete(listener);
  }, []);

  useEffect(() => {
    let socket = null;
    let retryTimer = null;
    let attempt = 0;
    let closed = false;

    function updateRoster(peers) {
      rosterRef.current = peers;
      for (const listener of listenersRef.current) listener({ type: 'video-peers', peers });
    }

    function connect() {
      const ws = new WebSocket(gameApi.socketUrl(code, playerId));
      socket = ws;
      socketRef.current = ws;
      ws.onmessage = (event) => {
        if (closed || socket !== ws) return;
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message?.type === 'state') {
          setState(message);
          setConnection('open');
          attempt = 0;
        } else if (message?.type === 'private' && message.playerId === playerId) {
          setMine(message);
        } else if (message?.type === 'video-peers' && message.peers) {
          updateRoster(message.peers);
        } else if (
          message?.type === 'signal' &&
          typeof message.from === 'string' &&
          message.fromConnection != null &&
          rosterRef.current[message.from] === message.fromConnection
        ) {
          for (const listener of listenersRef.current) listener(message);
        }
      };
      ws.onclose = (event) => {
        if (closed || socket !== ws) return;
        socket = null;
        socketRef.current = null;
        updateRoster({});
        if (FINAL_CLOSE_CODES.has(event?.code)) {
          setCloseCode(event.code);
          setConnection('closed');
          return;
        }
        setConnection('reconnecting');
        retryTimer = setTimeout(connect, RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]);
        attempt += 1;
      };
    }

    connect();
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      socket?.close();
      socketRef.current = null;
      updateRoster({});
    };
  }, [code, playerId]);

  return { state, mine, connection, closeCode, send, onVideo };
}
