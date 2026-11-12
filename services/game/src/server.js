import { createApp } from './app.js';
import { connectDatabase, migrate, checkDatabase } from './database.js';
import { createTablesRepository } from './tablesRepository.js';
import { createPlayersClient } from './playersClient.js';

let pool;
try {
  const players = createPlayersClient({ baseUrl: process.env.PLAYERS_URL });
  pool = await connectDatabase(process.env.DATABASE_URL);
  await migrate(pool);
  const app = createApp({
    checkDatabase: () => checkDatabase(pool),
    tables: createTablesRepository(pool),
    players,
    version: process.env.APP_VERSION || 'local',
    uiOrigin: process.env.UI_ORIGIN,
  });
  const server = app.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
    console.log('game service started');
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      const deadline = setTimeout(() => process.exit(1), 10_000);
      deadline.unref();
      server.close(async () => {
        await pool.close();
        process.exit(0);
      });
    });
  }
} catch (error) {
  console.error('Service startup failed:', error.code || error.message || 'configuration error');
  await pool?.close();
  process.exit(1);
}