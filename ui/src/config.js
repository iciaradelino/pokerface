// Service URLs. Vite bakes VITE_* variables into the build, so set them when building
// (CI / Static Web Apps) or in ui/.env.local for local overrides. Defaults match docker-compose.yml.
const env = import.meta.env;

function trimSlash(url) {
  return url.replace(/\/+$/, '');
}

export const config = {
  playersUrl: trimSlash(env.VITE_PLAYERS_URL || 'http://localhost:3001'),
  gameUrl: trimSlash(env.VITE_GAME_URL || 'http://localhost:3002'),
  requestTimeoutMs: 5000,
};
