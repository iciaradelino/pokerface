import sql from 'mssql';

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
