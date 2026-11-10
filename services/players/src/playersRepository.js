import sql from 'mssql';

// Must match the default of players.chips in migration 002.
export const STARTING_CHIPS = 1000;

// All SQL for the players table lives here, so the routes can be tested with a fake.
function toPlayer(row) {
  return {
    id: row.id.toLowerCase(),
    name: row.name,
    avatar: row.avatar,
    chips: row.chips,
    gestureSettings: JSON.parse(row.gesture_settings),
  };
}

export function createPlayersRepository(pool) {
  const columns = 'id, name, avatar, chips, gesture_settings';

  return {
    async create({ name, avatar, gestureSettings }) {
      const result = await pool
        .request()
        .input('name', sql.NVarChar(30), name)
        .input('avatar', sql.NVarChar(7), avatar)
        .input('settings', sql.NVarChar(sql.MAX), JSON.stringify(gestureSettings))
        .query(`INSERT INTO dbo.players (name, avatar, gesture_settings)
                OUTPUT inserted.id, inserted.name, inserted.avatar, inserted.chips, inserted.gesture_settings
                VALUES (@name, @avatar, @settings)`);
      return toPlayer(result.recordset[0]);
    },

    async get(id) {
      const result = await pool
        .request()
        .input('id', sql.UniqueIdentifier, id)
        .query(`SELECT ${columns} FROM dbo.players WHERE id = @id`);
      return result.recordset[0] ? toPlayer(result.recordset[0]) : null;
    },

    // Omitted avatar or settings (undefined) keep their stored value.
    async update(id, { name, avatar, gestureSettings }) {
      const result = await pool
        .request()
        .input('id', sql.UniqueIdentifier, id)
        .input('name', sql.NVarChar(30), name)
        .input('avatar', sql.NVarChar(7), avatar ?? null)
        .input(
          'settings',
          sql.NVarChar(sql.MAX),
          gestureSettings === undefined ? null : JSON.stringify(gestureSettings),
        )
        .query(`UPDATE dbo.players
                SET name = @name,
                    avatar = COALESCE(@avatar, avatar),
                    gesture_settings = COALESCE(@settings, gesture_settings),
                    updated_at = SYSUTCDATETIME()
                OUTPUT inserted.id, inserted.name, inserted.avatar, inserted.chips, inserted.gesture_settings
                WHERE id = @id`);
      return result.recordset[0] ? toPlayer(result.recordset[0]) : null;
    },

    // Saves a hand result once per (handId, player) and returns the player, or null if unknown.
    // A repeated handId changes nothing, so the game service can safely retry. The row lock
    // makes two retries arriving together run one after the other.
    async saveResult(id, { handId, delta }) {
      const transaction = pool.transaction();
      await transaction.begin();
      try {
        const result = await transaction
          .request()
          .input('id', sql.UniqueIdentifier, id)
          .input('handId', sql.UniqueIdentifier, handId)
          .input('delta', sql.Int, delta)
          .input('startingChips', sql.BigInt, STARTING_CHIPS).query(`
            DECLARE @found INT;
            SELECT @found = COUNT(*) FROM dbo.players WITH (UPDLOCK, HOLDLOCK) WHERE id = @id;
            IF @found = 1 AND NOT EXISTS (
              SELECT 1 FROM dbo.hand_results WHERE hand_id = @handId AND player_id = @id
            )
            BEGIN
              INSERT INTO dbo.hand_results (hand_id, player_id, delta) VALUES (@handId, @id, @delta);
              -- Chips are the starting stack plus every saved delta, limited to 0..INT max.
              -- Recomputing from all results (not adjusting the old balance) means the order in
              -- which results arrive cannot change the final balance.
              UPDATE p
              SET chips = CAST(
                    CASE
                      WHEN t.total < 0 THEN 0
                      WHEN t.total > 2147483647 THEN 2147483647
                      ELSE t.total
                    END AS INT),
                  updated_at = SYSUTCDATETIME()
              FROM dbo.players AS p
              CROSS APPLY (
                SELECT @startingChips + COALESCE(SUM(CAST(r.delta AS BIGINT)), 0) AS total
                FROM dbo.hand_results AS r WHERE r.player_id = p.id
              ) AS t
              WHERE p.id = @id;
            END
            SELECT ${columns} FROM dbo.players WHERE id = @id;`);
        await transaction.commit();
        return result.recordset[0] ? toPlayer(result.recordset[0]) : null;
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
      }
    },

    // Top 10 by chips (issue #15), ties broken by name.
    async leaderboard() {
      const result = await pool.request().query(
        'SELECT TOP 10 id, name, chips FROM dbo.players ORDER BY chips DESC, name ASC',
      );
      return result.recordset.map((row) => ({
        id: row.id.toLowerCase(),
        name: row.name,
        chips: row.chips,
      }));
    },

    // Returns true if a player was deleted. Their hand_results go with them (ON DELETE CASCADE).
    async remove(id) {
      const result = await pool
        .request()
        .input('id', sql.UniqueIdentifier, id)
        .query('DELETE FROM dbo.players WHERE id = @id');
      return result.rowsAffected[0] > 0;
    },
  };
}
