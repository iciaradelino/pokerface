import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkDatabase, connectDatabase, migrate } from '../src/database.js';
import { fakePool } from './fakePool.js';

// Replace the real driver so no SQL Server is needed. `state.connect` decides each attempt.
const state = vi.hoisted(() => ({ connect: undefined, instances: [] }));
vi.mock('mssql', () => {
  class ConnectionPool {
    constructor(connectionString) {
      this.connectionString = connectionString;
      this.config = {};
      state.instances.push(this);
    }
    on(_event, handler) {
      this.errorHandler = handler;
    }
    connect() {
      return state.connect();
    }
  }
  return { default: { ConnectionPool, NVarChar: (length) => ({ length }) } };
});

beforeEach(() => {
  state.instances.length = 0;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('connectDatabase', () => {
  it('refuses to start without a connection string', async () => {
    await expect(connectDatabase(undefined)).rejects.toThrow('DATABASE_URL is required');
  });

  it('returns the connected pool and sets short timeouts', async () => {
    state.connect = vi.fn().mockResolvedValue('connected-pool');
    expect(await connectDatabase('Server=db')).toBe('connected-pool');
    const [pool] = state.instances;
    expect(pool.connectionString).toBe('Server=db');
    expect(pool.config.connectionTimeout).toBe(5000);
    expect(pool.config.requestTimeout).toBe(5000);
    expect(pool.config.pool.max).toBe(5);
  });

  it('logs only the error code when the pool reports an error', async () => {
    state.connect = vi.fn().mockResolvedValue('connected-pool');
    await connectDatabase('Server=db');
    state.instances[0].errorHandler({ code: 'ESOCKET', message: 'private details' });
    expect(console.error).toHaveBeenCalledWith('Database error:', 'ESOCKET');
  });

  it('retries while the database wakes up, then succeeds', async () => {
    vi.useFakeTimers();
    state.connect = vi
      .fn()
      .mockRejectedValueOnce(new Error('40613'))
      .mockRejectedValueOnce(new Error('40613'))
      .mockResolvedValue('connected-pool');
    const connecting = connectDatabase('Server=db');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await connecting).toBe('connected-pool');
    expect(state.connect).toHaveBeenCalledTimes(3);
  });

  it('gives up with the last error after about 90 seconds', async () => {
    vi.useFakeTimers();
    state.connect = vi.fn().mockRejectedValue(new Error('database is paused'));
    const connecting = connectDatabase('Server=db');
    const failure = expect(connecting).rejects.toThrow('database is paused');
    await vi.advanceTimersByTimeAsync(120_000);
    await failure;
    expect(state.connect.mock.calls.length).toBeGreaterThan(5);
  });
});

describe('migrate', () => {
  const migrationFiles = [
    '001_health.sql',
    '002_players.sql',
    '003_hand_results_player_index.sql',
  ];

  // Answers the "already applied?" lookups and records what was run and recorded.
  function migrationPool({ applied = [], failOnBatch } = {}) {
    let batches = 0;
    const pool = fakePool((text, inputs) => {
      if (text.includes('SELECT name FROM dbo.schema_migrations')) {
        return { recordset: applied.includes(inputs.name) ? [{ name: inputs.name }] : [] };
      }
      if (text.includes('schema_migrations')) return { recordset: [] };
      batches += 1; // only the migration files themselves reach this line
      if (batches === failOnBatch) throw new Error('syntax error');
      return { recordset: [] };
    });
    pool.recorded = () =>
      pool.log.filter((entry) => entry.text.includes('INSERT INTO dbo.schema_migrations'))
        .map((entry) => entry.inputs.name);
    pool.batches = () => pool.log.filter((entry) => entry.batch);
    return pool;
  }

  it('creates the tracking table and applies every migration in order', async () => {
    const pool = migrationPool();
    await migrate(pool);
    expect(pool.log[0].text).toContain('CREATE TABLE dbo.schema_migrations');
    expect(pool.recorded()).toEqual(migrationFiles);
    expect(pool.batches()).toHaveLength(migrationFiles.length);
    expect(pool.events).toEqual(['begin', 'commit', 'begin', 'commit', 'begin', 'commit']);
  });

  it('skips migrations that were already applied', async () => {
    const pool = migrationPool({ applied: migrationFiles.slice(0, 2) });
    await migrate(pool);
    expect(pool.recorded()).toEqual([migrationFiles[2]]);
    expect(pool.batches()).toHaveLength(1);
  });

  it('applies nothing when everything is up to date', async () => {
    const pool = migrationPool({ applied: migrationFiles });
    await migrate(pool);
    expect(pool.batches()).toHaveLength(0);
    expect(pool.events).toEqual([]);
  });

  it('rolls back a failing migration, does not record it and stops', async () => {
    const pool = migrationPool({ failOnBatch: 2 });
    await expect(migrate(pool)).rejects.toThrow('syntax error');
    expect(pool.recorded()).toEqual([migrationFiles[0]]);
    expect(pool.events).toEqual(['begin', 'commit', 'begin', 'rollback']);
  });
});

describe('checkDatabase', () => {
  it('passes when the probe row can be written and read, and always rolls back', async () => {
    const pool = fakePool(() => ({ recordset: [{ id: 'x' }] }));
    await expect(checkDatabase(pool)).resolves.toBeUndefined();
    expect(pool.events).toEqual(['begin', 'rollback']);
  });

  it('fails when the probe row cannot be read back, and still rolls back', async () => {
    const pool = fakePool(() => ({ recordset: [] }));
    await expect(checkDatabase(pool)).rejects.toThrow('Database health check failed');
    expect(pool.events).toEqual(['begin', 'rollback']);
  });

  it('fails when the query errors, and still rolls back', async () => {
    const pool = fakePool(() => {
      throw new Error('connection lost');
    });
    await expect(checkDatabase(pool)).rejects.toThrow('connection lost');
    expect(pool.events).toEqual(['begin', 'rollback']);
  });
});
