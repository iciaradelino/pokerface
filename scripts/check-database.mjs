// Run inside each service container with its own DATABASE_URL, never as sa.
import assert from 'node:assert/strict';
import { connectDatabase, migrate, checkDatabase } from './src/database.js';

const pool = await connectDatabase(process.env.DATABASE_URL);
try {
  const before = await pool.request().query('SELECT COUNT(*) AS count FROM dbo.schema_migrations');
  await migrate(pool);
  await migrate(pool);
  const after = await pool.request().query('SELECT COUNT(*) AS count FROM dbo.schema_migrations');
  assert.equal(after.recordset[0].count, before.recordset[0].count);
  assert.ok(after.recordset[0].count >= 1, 'Startup migration must have been applied');
  await Promise.all([checkDatabase(pool), checkDatabase(pool)]);
  const rows = await pool.request().query('SELECT COUNT(*) AS count FROM dbo.health_checks');
  assert.equal(rows.recordset[0].count, 0, 'Health probes must not leave rows behind');
  const isolation = await pool.request().query(`
    SELECT DB_NAME() AS ownDatabase,
      HAS_DBACCESS(CASE WHEN DB_NAME() = 'players' THEN 'game' ELSE 'players' END) AS otherAccess
  `);
  assert.equal(isolation.recordset[0].otherAccess, 0, 'Service must not access the other database');
  console.log(`${isolation.recordset[0].ownDatabase}: migrations idempotent, concurrent probes rolled back, other database inaccessible`);
} finally {
  await pool.close();
}
