import { useEffect, useState } from 'react';
import { gameApi } from '../api/gameApi.js';

const RETRY_MS = [1000, 2000, 4000, 8000];

/**
 * Close codes from the game service (services/game/src/tableSockets.js) that mean trying again
 * cannot help: 4400 malformed code or player id, 4403 not seated at this table, 4404 no such table.
 */
export const FINAL_CLOSE_CODES = new Set([4400, 4403, 4404]);

/**
 * Live table updates over the game service WebSocket (plan.md §6).
 * Returns { state, mine, connection, closeCode }:
 *   state       last "state" message (same for everyone), or null before the first one
 *   mine        last "private" message (your cards and legal actions), or null
 *   connection  "connecting" | "open" | "reconnecting" | "closed"
 *   closeCode   when "closed": 4400, 4403 or 4404 (see FINAL_CLOSE_CODES)
 * If the socket drops it reconnects after 1, 2, 4 then every 8 seconds; the server sends the
 * full state again on connect, so nothing is lost. It stops for good on a FINAL_CLOSE_CODES
 * close. "signal" messages are for video (Laura).
 */
export function useTableSocket(code, playerId) {
  const [state, setState] = useState(null);
  const [mine, setMine] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [closeCode, setCloseCode] = useState(null);

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
      socket.onclose = (event) => {
        if (closed) return;
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
    };
  }, [code, playerId]);

  return { state, mine, connection, closeCode };
}
