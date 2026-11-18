import { connectDatabase } from '../services/game/src/database.js';

const server = process.env.SQL_HOST;
const adminPassword = process.env.SQL_ADMIN_PASSWORD;

for (const [service, password] of [
  ['players', process.env.PLAYERS_DB_PASSWORD],
  ['game', process.env.GAME_DB_PASSWORD],
]) {
  const database = `sdd-3a-g5-${service}-db`;
  const user = `${service}_app`;
  const config = { server, database, options: { encrypt: true, trustServerCertificate: false } };
  try {
    const admin = await connectDatabase({ ...config, user: 'pokerface_admin', password: adminPassword });
    try {
      await admin.request().input('password', password).query(`
        IF USER_ID(N'${user}') IS NULL
        BEGIN
          DECLARE @sql NVARCHAR(400) =
            N'CREATE USER [${user}] WITH PASSWORD = ' + QUOTENAME(@password, NCHAR(39));
          EXEC sp_executesql @sql;
        END;
        IF IS_ROLEMEMBER(N'db_owner', N'${user}') <> 1
          ALTER ROLE db_owner ADD MEMBER [${user}];
      `);
    } finally {
      await admin.close();
    }

    const app = await connectDatabase({ ...config, user, password });
    try {
      await app.request().query('SELECT 1');
    } finally {
      await app.close();
    }
    console.log(`${database}: app login verified`);
  } catch (error) {
    console.error(`${database}: SQL setup failed (${error.code || 'unknown'}/${error.number || '-'})`);
    process.exitCode = 1;
    break;
  }
}
