import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const password = () => `Pf-${randomBytes(24).toString('base64url')}9!`;
const contents = [
  `MSSQL_SA_PASSWORD=${password()}`,
  `PLAYERS_DB_PASSWORD=${password()}`,
  `GAME_DB_PASSWORD=${password()}`,
  'PLAYERS_PORT=3001',
  'GAME_PORT=3002',
  'UI_PORT=5173',
  'APP_VERSION=local',
  '',
].join('\n');

try {
  await writeFile(fileURLToPath(new URL('../.env', import.meta.url)), contents, {
    flag: 'wx',
    mode: 0o600,
  });
  console.log('Created .env with random local database passwords. Keep this file private.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env already exists; kept the existing credentials.');
}
