import sql from 'mssql';

// All SQL for tables and seats lives here, so the routes can be tested with a fake.

const MAX_CODE_ATTEMPTS = 5;
const UNIQUE_VIOLATION = 2627;

function toTable(row, seatRows) {
  return {
    id: row.id,
    smallBlind: row.small_blind,
    bigBlind: row.big_blind,
    startingStack: row.starting_stack,
    maxSeats: row.max_seats,
    paused: row.paused,
    createdBy: row.created_by.toLowerCase(),
    createdAt: row.created_at.toISOString(),
    seats: seatRows.map((seat) => ({
      seatIndex: seat.seat_index,
      playerId: seat.player_id.toLowerCase(),
      name: seat.player_name,
      stack: seat.stack,
    })),
  };
}

// Runs work(transaction) and commits, or rolls back if it throws.
async function inTransaction(pool, work) {
  const transaction = pool.transaction();
  await transaction.begin();
  try {
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback().catch(() => {}); // Already rolled back by SQL Server.
    throw error;
  }
}

export function createTablesRepository(pool) {
  async function getTable(id) {
    const tables = await pool
      .request()
      .input('id', sql.Char(6), id)
      .query(`SELECT id, small_blind, big_blind, starting_stack, max_seats, paused, created_by, created_at
              FROM dbo.tables WHERE id = @id`);
    if (!tables.recordset[0]) return null;
    const seats = await pool
      .request()
      .input('id', sql.Char(6), id)
      .query(`SELECT seat_index, player_id, player_name, stack
              FROM dbo.seats WHERE table_id = @id ORDER BY seat_index`);
    return toTable(tables.recordset[0], seats.recordset);
  }

  return {
    getTable,

    // Creates the table and seats its creator at seat 0. A new code is drawn if the first
    // one is already taken.
    async createTable({ settings, createdBy, creatorName, generateId }) {
      for (let attempt = 1; ; attempt++) {
        const id = generateId();
        try {
          await inTransaction(pool, async (transaction) => {
            await transaction
              .request()
              .input('id', sql.Char(6), id)
              .input('smallBlind', sql.Int, settings.smallBlind)
              .input('bigBlind', sql.Int, settings.bigBlind)
              .input('startingStack', sql.Int, settings.startingStack)
              .input('maxSeats', sql.TinyInt, settings.maxSeats)
              .input('createdBy', sql.UniqueIdentifier, createdBy)
              .query(`INSERT INTO dbo.tables (id, small_blind, big_blind, starting_stack, max_seats, created_by)
                      VALUES (@id, @smallBlind, @bigBlind, @startingStack, @maxSeats, @createdBy)`);
            await transaction
              .request()
              .input('id', sql.Char(6), id)
              .input('playerId', sql.UniqueIdentifier, createdBy)
              .input('name', sql.NVarChar(30), creatorName)
              .input('stack', sql.Int, settings.startingStack)
              .query(`INSERT INTO dbo.seats (table_id, seat_index, player_id, player_name, stack)
                      VALUES (@id, 0, @playerId, @name, @stack)`);
          });
          return await getTable(id);
        } catch (error) {
          const codeTaken = error.number === UNIQUE_VIOLATION && /PK_tables/.test(error.message);
          if (!codeTaken || attempt === MAX_CODE_ATTEMPTS) throw error;
        }
      }
    },

    // Seats the player at the first free seat. The table row is locked, so two players
    // joining at the same time cannot get the same seat.
    // Returns { status: 'joined' | 'already_seated', seatIndex }, { status: 'full' } or { status: 'not_found' }.
    async joinTable(id, { playerId, playerName }) {
      return inTransaction(pool, async (transaction) => {
        const tables = await transaction
          .request()
          .input('id', sql.Char(6), id)
          .query(`SELECT max_seats, starting_stack FROM dbo.tables WITH (UPDLOCK, HOLDLOCK)
                  WHERE id = @id`);
        const table = tables.recordset[0];
        if (!table) return { status: 'not_found' };

        const seats = await transaction
          .request()
          .input('id', sql.Char(6), id)
          .query('SELECT seat_index, player_id FROM dbo.seats WHERE table_id = @id');
        const mine = seats.recordset.find((seat) => seat.player_id.toLowerCase() === playerId);
        if (mine) return { status: 'already_seated', seatIndex: mine.seat_index };

        const taken = new Set(seats.recordset.map((seat) => seat.seat_index));
        let seatIndex = 0;
        while (seatIndex < table.max_seats && taken.has(seatIndex)) seatIndex++;
        if (seatIndex === table.max_seats) return { status: 'full' };

        await transaction
          .request()
          .input('id', sql.Char(6), id)
          .input('seatIndex', sql.TinyInt, seatIndex)
          .input('playerId', sql.UniqueIdentifier, playerId)
          .input('name', sql.NVarChar(30), playerName)
          .input('stack', sql.Int, table.starting_stack)
          .query(`INSERT INTO dbo.seats (table_id, seat_index, player_id, player_name, stack)
                  VALUES (@id, @seatIndex, @playerId, @name, @stack)`);
        return { status: 'joined', seatIndex };
      });
    },

    /** Number of the last finished hand at this table, or 0 if none has been played. */
    async getLastHandNumber(id) {
      const result = await pool
        .request()
        .input('id', sql.Char(6), id)
        .query('SELECT ISNULL(MAX(hand_number), 0) AS last FROM dbo.hands WHERE table_id = @id');
      return result.recordset[0].last;
    },

    // Saves a finished hand in one transaction: the hand, each player's result (sent_at NULL, so
    // the players service still has to receive it), the new stacks, and removes the seats of
    // players who left during the hand. Saving the same handId twice changes nothing, so a retry
    // after a lost response is safe.
    async saveHand(id, { handId, handNumber, result, deltas, stacks }) {
      await inTransaction(pool, (transaction) =>
        transaction
          .request()
          .input('id', sql.Char(6), id)
          .input('handId', sql.UniqueIdentifier, handId)
          .input('handNumber', sql.Int, handNumber)
          .input('result', sql.NVarChar(sql.MAX), JSON.stringify(result))
          .input('deltas', sql.NVarChar(sql.MAX), JSON.stringify(deltas))
          .input('stacks', sql.NVarChar(sql.MAX), JSON.stringify(stacks)).query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.hands WHERE id = @handId)
            BEGIN
              INSERT INTO dbo.hands (id, table_id, hand_number, result)
              VALUES (@handId, @id, @handNumber, @result);
              INSERT INTO dbo.hand_players (hand_id, player_id, delta)
              SELECT @handId, playerId, delta
              FROM OPENJSON(@deltas) WITH (playerId UNIQUEIDENTIFIER, delta INT);
            END;
            UPDATE s SET stack = j.stack
            FROM dbo.seats AS s
            JOIN OPENJSON(@stacks) WITH (playerId UNIQUEIDENTIFIER, stack INT) AS j
              ON s.player_id = j.playerId
            WHERE s.table_id = @id;
            DELETE FROM dbo.seats
            WHERE table_id = @id
              AND player_id NOT IN (
                SELECT playerId FROM OPENJSON(@stacks) WITH (playerId UNIQUEIDENTIFIER)
              );`),
      );
    },

    /** Frees a seat. Returns false if the player was not seated there. */
    async removeSeat(id, playerId) {
      const result = await pool
        .request()
        .input('id', sql.Char(6), id)
        .input('playerId', sql.UniqueIdentifier, playerId)
        .query('DELETE FROM dbo.seats WHERE table_id = @id AND player_id = @playerId');
      return result.rowsAffected[0] > 0;
    },

    /** Returns false if the table does not exist. */
    async setPaused(id, paused) {
      const result = await pool
        .request()
        .input('id', sql.Char(6), id)
        .input('paused', sql.Bit, paused)
        .query('UPDATE dbo.tables SET paused = @paused WHERE id = @id');
      return result.rowsAffected[0] > 0;
    },

    /** Deletes the table; its seats and hands go with it. Returns false if it did not exist. */
    async deleteTable(id) {
      const result = await pool
        .request()
        .input('id', sql.Char(6), id)
        .query('DELETE FROM dbo.tables WHERE id = @id');
      return result.rowsAffected[0] > 0;
    },
  };
}