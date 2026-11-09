import { readdir, readFile } from 'node:fs/promises';
import sql from 'mssql';

export async function connectDatabase(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const pool = new sql.ConnectionPool(connectionString);
  pool.config.connectionTimeout = 5000;
  pool.config.requestTimeout = 5000;
  pool.config.pool = { min: 0, max: 5, acquireTimeoutMillis: 5000 };
  pool.on('error', (error) => console.error('Database error:', error.code));

  // Azure SQL can take about a minute to wake up after being idle.
  const deadline = Date.now() + 90_000;
  let delay = 1000;
  while (true) {
    try {
      return await pool.connect();
    } catch (error) {
      if (Date.now() + delay >= deadline) throw error;
      console.log(`Database unavailable; retrying in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 10_000);
    }
  }
}

export async function migrate(pool) {
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.schema_migrations', N'U') IS NULL
      CREATE TABLE dbo.schema_migrations (
        name NVARCHAR(255) NOT NULL PRIMARY KEY,
        applied_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      );
  `);
  const directory = new URL('../migrations/', import.meta.url);
  const files = (await readdir(directory)).filter((file) => /^\d+.*\.sql$/.test(file)).sort();
  for (const file of files) {
    const applied = await pool.request().input('name', sql.NVarChar(255), file)
      .query('SELECT name FROM dbo.schema_migrations WHERE name = @name');
    if (applied.recordset.length) continue;

    const transaction = pool.transaction();
    await transaction.begin();
    try {
      await transaction.request().batch(await readFile(new URL(file, directory), 'utf8'));
      await transaction.request().input('name', sql.NVarChar(255), file)
        .query('INSERT INTO dbo.schema_migrations (name) VALUES (@name)');
      await transaction.commit();
      console.log(`Applied migration: ${file}`);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

export async function checkDatabase(pool) {
  const transaction = pool.transaction();
  await transaction.begin();
  try {
    const result = await transaction.request().query(`
      DECLARE @id UNIQUEIDENTIFIER = NEWID();
      INSERT INTO dbo.health_checks (id) VALUES (@id);
      SELECT id FROM dbo.health_checks WHERE id = @id;
    `);
    if (result.recordset.length !== 1) throw new Error('Database health check failed');
  } finally {
    await transaction.rollback(); // Remove the probe row, even if the check failed.
  }
}
