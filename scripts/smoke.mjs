import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const targets = [
  ['players', process.env.PLAYERS_BASE_URL || `http://localhost:${process.env.PLAYERS_PORT || 3001}`],
  ['game', process.env.GAME_BASE_URL || `http://localhost:${process.env.GAME_PORT || 3002}`],
];
for (const [name, baseUrl] of targets) {
  const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200, `${name} /health must return 200`);
  const health = await response.json();
  assert.equal(health.status, 'ok');
  assert.equal(health.db, 'ok');
  assert.equal(health.version, process.env.APP_VERSION || 'local');
  console.log(`${name}: HTTP 200, database read/write OK, version ${health.version}`);
}
const uiUrl = process.env.UI_BASE_URL || `http://localhost:${process.env.UI_PORT || 5173}`;
const page = await fetch(uiUrl, { signal: AbortSignal.timeout(10_000) });
assert.equal(page.status, 200, 'UI must return 200');
assert.match(await page.text(), /<title>Pokerface<\/title>/);
console.log('UI: HTTP 200, Pokerface page served');
