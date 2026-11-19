import { useCallback, useEffect, useRef, useState } from 'react';
import { gameApi } from '../api/gameApi.js';

const RETRY_MS = [1000, 2000, 4000, 8000];
const MAX_PENDING_SIGNALS = 50;

/**
 * Close codes from the game service (services/game/src/tableSockets.js) that mean trying again
 * cannot help: 4400 malformed code or player id, 4403 not seated at this table, 4404 no such table.
 */
export const FINAL_CLOSE_CODES = new Set([4400, 4403, 4404]);

/**
 * Live table updates over the game service WebSocket (plan.md §6).
 * Returns { state, mine, connection, closeCode, send, onSignal }:
 *   state       last "state" message (same for everyone), or null before the first one
 *   mine        last "private" message (your cards and legal actions), or null
 *   connection  "connecting" | "open" | "reconnecting" | "closed"
 *   closeCode   when "closed": 4400, 4403 or 4404 (see FINAL_CLOSE_CODES)
 * If the socket drops it reconnects after 1, 2, 4 then every 8 seconds; the server sends the
 * full state again on connect, so nothing is lost. It stops for good on a FINAL_CLOSE_CODES
 * close.
 * Also for video (ui/video/): `send(to, data)` sends a "signal" to another player at the table
 * (kept and sent once the socket opens, if it is not open yet) and `onSignal(listener)` calls listener(from, data) for
 * each signal that arrives and returns an unsubscribe function. Both keep the same identity
 * for the whole visit, as useVideo needs.
 */
export function useTableSocket(code, playerId) {
  const [state, setState] = useState(null);
  const [mine, setMine] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [closeCode, setCloseCode] = useState(null);
  const socketRef = useRef(null);
  const listenersRef = useRef(new Set());

  const pendingRef = useRef([]); // signals made before the socket opened

  const send = useCallback((to, data) => {
    const text = JSON.stringify({ type: 'signal', to, data });
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(text);
    // The seats arrive over HTTP before the socket opens, so the first offers are made too
    // early. Keep them (a few) and send them on open instead of losing the call.
    else if (pendingRef.current.length < MAX_PENDING_SIGNALS) pendingRef.current.push(text);
  }, []);

  const onSignal = useCallback((listener) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  useEffect(() => {
    let socket = null;
    let retryTimer = null;
    let attempt = 0;
    let closed = false;

    function connect() {
      socket = new WebSocket(gameApi.socketUrl(code, playerId));
      socketRef.current = socket;
      socket.onopen = () => {
        attempt = 0;
        for (const text of pendingRef.current.splice(0)) socket.send(text);
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
        else if (message?.type === 'signal' && typeof message.from === 'string') {
          for (const listener of listenersRef.current) listener(message.from, message.data);
        }
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
      socketRef.current = null;
    };
  }, [code, playerId]);

  return { state, mine, connection, closeCode, send, onSignal };
}
