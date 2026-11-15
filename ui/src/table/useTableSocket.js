import { useEffect, useState } from 'react';
import { gameApi } from '../api/gameApi.js';

const RETRY_MS = [1000, 2000, 4000, 8000];

/**
 * Live table updates over the game service WebSocket (plan.md §6).
 * Returns { state, mine, connection }:
 *   state       last "state" message (same for everyone), or null before the first one
 *   mine        last "private" message (your cards and legal actions), or null
 *   connection  "connecting" | "open" | "reconnecting"
 * If the socket drops it reconnects after 1, 2, 4 then every 8 seconds; the server sends the
 * full state again on connect, so nothing is lost. "signal" messages are for video (Laura).
 */
export function useTableSocket(code, playerId) {
  const [state, setState] = useState(null);
  const [mine, setMine] = useState(null);
  const [connection, setConnection] = useState('connecting');

  useEffect(() => {
    let socket = null;
    let retryTimer = null;
    let attempt = 0;
    let closed = false;

    function connect() {
      socket = new WebSocket(gameApi.socketUrl(code, playerId));
      socket.onopen = () => {
        attempt = 0;
        setConnection('open');
      };
      socket.onmessage = (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return; // Not JSON: ignore rather than break the table.
        }
        if (message?.type === 'state') setState(message);
        else if (message?.type === 'private' && message.playerId === playerId) setMine(message);
      };
      socket.onclose = () => {
        if (closed) return;
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
    };
  }, [code, playerId]);

  return { state, mine, connection };
}
