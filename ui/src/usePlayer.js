import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from './api/http.js';
import { playersApi } from './api/playersApi.js';
import { clearPlayerId, getPlayerId } from './player.js';

/** True when a service says the saved player no longer exists. */
export const isPlayerGone = (err) =>
  err instanceof ApiError && err.status === 404 && err.message === 'Player not found';

/**
 * Loads the player saved on this device.
 * Returns { playerId, player, unavailable, startOver }:
 *   player       null until loaded
 *   unavailable  true when the players service could not be reached
 *   startOver()  forgets the player and opens "Create your player"
 * A player deleted on the server (or an old id on this device) starts over by itself.
 */
export function usePlayer() {
  const navigate = useNavigate();
  const playerId = getPlayerId();
  const [player, setPlayer] = useState(null);
  const [unavailable, setUnavailable] = useState(false);

  const startOver = useCallback(() => {
    clearPlayerId();
    navigate('/', { replace: true });
  }, [navigate]);

  useEffect(() => {
    let active = true;
    playersApi
      .get(playerId)
      .then((data) => active && setPlayer(data))
      .catch((err) => {
        if (!active) return;
        if (isPlayerGone(err)) startOver();
        else setUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, [playerId, startOver]);

  return { playerId, player, unavailable, startOver };
}
