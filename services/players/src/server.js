import { createApp } from './app.js';
import { connectDatabase, migrate, checkDatabase } from './database.js';
import { createPlayersRepository } from './playersRepository.js';

let pool;
try {
  pool = await connectDatabase(process.env.DATABASE_URL);
  await migrate(pool);
  const app = createApp({
    checkDatabase: () => checkDatabase(pool),
    players: createPlayersRepository(pool),
    version: process.env.APP_VERSION || 'local',
    uiOrigin: process.env.UI_ORIGIN,
  });
  const server = app.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
    console.log('players service started');
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
  console.error('Service startup failed:', error.code || 'configuration error');
  await pool?.close();
  process.exit(1);
}
