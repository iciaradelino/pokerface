import { describe, expect, it } from 'vitest';
import { STARTING_CHIPS, createPlayersRepository } from '../src/playersRepository.js';
import { fakePool } from './fakePool.js';

const ID = '9AEE445A-D786-4AE6-A1B4-EE1A32506ECE'; // SQL Server returns GUIDs in upper case
const row = (overrides = {}) => ({
  id: ID,
  name: 'Laura',
  avatar: '#B8F23A',
  chips: 1000,
  gesture_settings: '{"holdMs":900}',
  ...overrides,
});
const expected = {
  id: ID.toLowerCase(),
  name: 'Laura',
  avatar: '#B8F23A',
  chips: 1000,
  gestureSettings: { holdMs: 900 },
};

describe('create', () => {
  it('inserts the player and returns it with a lower-case id and parsed settings', async () => {
    const pool = fakePool(() => ({ recordset: [row()] }));
    const player = await createPlayersRepository(pool).create({
      name: 'Laura',
      avatar: '#B8F23A',
      gestureSettings: { holdMs: 900 },
    });
    expect(player).toEqual(expected);
    expect(pool.log[0].text).toContain('INSERT INTO dbo.players');
    expect(pool.log[0].inputs).toEqual({
      name: 'Laura',
      avatar: '#B8F23A',
      settings: '{"holdMs":900}',
    });
  });
});

describe('get', () => {
  it('returns the player when it exists', async () => {
    const pool = fakePool(() => ({ recordset: [row()] }));
    expect(await createPlayersRepository(pool).get(expected.id)).toEqual(expected);
    expect(pool.log[0].inputs.id).toBe(expected.id);
  });

  it('returns null when it does not', async () => {
    expect(await createPlayersRepository(fakePool()).get(expected.id)).toBeNull();
  });
});

describe('update', () => {
  it('sends the new values and returns the updated player', async () => {
    const pool = fakePool(() => ({ recordset: [row({ name: 'Laura G' })] }));
    const player = await createPlayersRepository(pool).update(expected.id, {
      name: 'Laura G',
      avatar: '#5B8CFF',
      gestureSettings: { holdMs: 700 },
    });
    expect(player.name).toBe('Laura G');
    expect(pool.log[0].inputs).toEqual({
      id: expected.id,
      name: 'Laura G',
      avatar: '#5B8CFF',
      settings: '{"holdMs":700}',
    });
  });

  it('sends null for an omitted avatar and settings so the stored values are kept', async () => {
    const pool = fakePool(() => ({ recordset: [row()] }));
    await createPlayersRepository(pool).update(expected.id, { name: 'Laura' });
    expect(pool.log[0].inputs.avatar).toBeNull();
    expect(pool.log[0].inputs.settings).toBeNull();
    expect(pool.log[0].text).toContain('COALESCE(@avatar, avatar)');
  });

  it('returns null for an unknown player', async () => {
    const result = await createPlayersRepository(fakePool()).update(expected.id, { name: 'X' });
    expect(result).toBeNull();
  });
});

describe('remove', () => {
  it('returns true when a row was deleted and false when none was', async () => {
    const deleted = fakePool(() => ({ recordset: [], rowsAffected: [1] }));
    expect(await createPlayersRepository(deleted).remove(expected.id)).toBe(true);
    expect(await createPlayersRepository(fakePool()).remove(expected.id)).toBe(false);
  });
});

describe('saveResult', () => {
  const result = { handId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', delta: 250 };

  it('saves in one transaction and returns the player', async () => {
    const pool = fakePool(() => ({ recordset: [row({ chips: 1250 })] }));
    const player = await createPlayersRepository(pool).saveResult(expected.id, result);
    expect(player.chips).toBe(1250);
    expect(pool.events).toEqual(['begin', 'commit']);
    expect(pool.log[0].inputs).toEqual({
      id: expected.id,
      handId: result.handId,
      delta: 250,
      startingChips: STARTING_CHIPS,
    });
  });

  it('locks the player row and rebuilds the balance from all saved results', async () => {
    const pool = fakePool(() => ({ recordset: [row()] }));
    await createPlayersRepository(pool).saveResult(expected.id, result);
    const sqlText = pool.log[0].text;
    expect(sqlText).toContain('UPDLOCK');
    expect(sqlText).toContain('NOT EXISTS');
    expect(sqlText).toContain('SUM(CAST(r.delta AS BIGINT))');
  });

  it('returns null for an unknown player', async () => {
    const pool = fakePool();
    expect(await createPlayersRepository(pool).saveResult(expected.id, result)).toBeNull();
    expect(pool.events).toEqual(['begin', 'commit']);
  });

  it('rolls back and rethrows when the database fails', async () => {
    const pool = fakePool(() => {
      throw new Error('deadlock');
    });
    await expect(createPlayersRepository(pool).saveResult(expected.id, result)).rejects.toThrow(
      'deadlock',
    );
    expect(pool.events).toEqual(['begin', 'rollback']);
  });

  it('still reports the original error when the rollback fails too', async () => {
    const pool = fakePool(
      () => {
        throw new Error('deadlock');
      },
      { rollbackFails: true },
    );
    await expect(createPlayersRepository(pool).saveResult(expected.id, result)).rejects.toThrow(
      'deadlock',
    );
  });
});

describe('leaderboard', () => {
  it('returns id, name and chips with lower-case ids', async () => {
    const pool = fakePool(() => ({
      recordset: [row({ chips: 1250 }), row({ id: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', name: 'Ana', chips: 900 })],
    }));
    const board = await createPlayersRepository(pool).leaderboard();
    expect(board).toEqual([
      { id: expected.id, name: 'Laura', chips: 1250 },
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Ana', chips: 900 },
    ]);
  });

  it('asks for the top 10 ordered by chips, then name', async () => {
    const pool = fakePool();
    await createPlayersRepository(pool).leaderboard();
    expect(pool.log[0].text).toContain('TOP 10');
    expect(pool.log[0].text).toContain('ORDER BY chips DESC, name ASC');
  });
});
