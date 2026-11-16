import { createApp } from './app.js';
import { connectDatabase, migrate, checkDatabase } from './database.js';
import { createTablesRepository } from './tablesRepository.js';
import { createPlayersClient } from './playersClient.js';
import { createLiveTables } from './liveTables.js';
import { attachTableSockets } from './tableSockets.js';
import { createResultsSender } from './resultsSender.js';

let pool;
try {
  const players = createPlayersClient({ baseUrl: process.env.PLAYERS_URL });
  pool = await connectDatabase(process.env.DATABASE_URL);
  await migrate(pool);
  const tables = createTablesRepository(pool);
  const results = createResultsSender({ tables, players });
  let sockets = null; // Created once the HTTP server exists; live tables report changes to it.
  const live = createLiveTables({
    tables,
    onChange: (id, game, extra) => sockets?.broadcast(id, game, extra),
    onRemove: (id) => sockets?.closeTable(id),
    onHandSaved: () => results.sendPending(),
  });
  const app = createApp({
    checkDatabase: () => checkDatabase(pool),
    tables,
    live,
    players,
    version: process.env.APP_VERSION || 'local',
    uiOrigin: process.env.UI_ORIGIN,
  });
  const server = app.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
    console.log('game service started');
  });
  sockets = attachTableSockets({ server, live, uiOrigin: process.env.UI_ORIGIN });
  results.start(); // Sends anything left over from before a restart, then checks every minute.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      const deadline = setTimeout(() => process.exit(1), 10_000);
      deadline.unref();
      results.stop();
      sockets.close();
      live.close();
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