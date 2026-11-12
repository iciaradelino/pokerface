-- A private table. The id is the join code players share (e.g. K7QX2M), so the UI can
-- use it directly in /tables/:id. The settings match what the poker engine accepts.
CREATE TABLE dbo.tables (
  id CHAR(6) NOT NULL CONSTRAINT PK_tables PRIMARY KEY,
  small_blind INT NOT NULL CONSTRAINT DF_tables_small_blind DEFAULT 5,
  big_blind INT NOT NULL CONSTRAINT DF_tables_big_blind DEFAULT 10,
  starting_stack INT NOT NULL CONSTRAINT DF_tables_starting_stack DEFAULT 1000,
  max_seats TINYINT NOT NULL CONSTRAINT DF_tables_max_seats DEFAULT 6,
  created_by UNIQUEIDENTIFIER NOT NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_tables_created_at DEFAULT SYSUTCDATETIME(),
  -- Binary collation: the default one is case-insensitive and would accept 'k7qx2m'.
  CONSTRAINT CK_tables_id CHECK (
    LEN(id) = 6 AND id COLLATE Latin1_General_BIN2 NOT LIKE '%[^A-Z0-9]%'
  ),
  CONSTRAINT CK_tables_blinds CHECK (small_blind > 0 AND small_blind <= big_blind),
  CONSTRAINT CK_tables_starting_stack CHECK (starting_stack >= big_blind),
  CONSTRAINT CK_tables_max_seats CHECK (max_seats BETWEEN 2 AND 6)
);

-- Who sits where, with the chips they have at this table. player_id comes from the
-- players service: there is no foreign key across services. The name is copied at join
-- time so a running table does not need the players service. stack is updated after
-- every hand, so a restart does not reset anyone's chips.
CREATE TABLE dbo.seats (
  table_id CHAR(6) NOT NULL,
  seat_index TINYINT NOT NULL,
  player_id UNIQUEIDENTIFIER NOT NULL,
  player_name NVARCHAR(30) NOT NULL,
  stack INT NOT NULL,
  joined_at DATETIME2 NOT NULL CONSTRAINT DF_seats_joined_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_seats PRIMARY KEY (table_id, seat_index),
  CONSTRAINT UQ_seats_player UNIQUE (table_id, player_id),
  CONSTRAINT FK_seats_tables FOREIGN KEY (table_id)
    REFERENCES dbo.tables (id) ON DELETE CASCADE,
  CONSTRAINT CK_seats_seat_index CHECK (seat_index BETWEEN 0 AND 5),
  CONSTRAINT CK_seats_stack CHECK (stack >= 0)
);

-- One row per finished hand. Hands in progress live only in memory. id is the handId
-- sent to the players service. result keeps what the players saw at showdown (board,
-- revealed cards, winners) as JSON.
CREATE TABLE dbo.hands (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_hands PRIMARY KEY,
  table_id CHAR(6) NOT NULL,
  hand_number INT NOT NULL,
  result NVARCHAR(MAX) NOT NULL,
  finished_at DATETIME2 NOT NULL CONSTRAINT DF_hands_finished_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_hands_table_number UNIQUE (table_id, hand_number),
  CONSTRAINT FK_hands_tables FOREIGN KEY (table_id)
    REFERENCES dbo.tables (id) ON DELETE CASCADE,
  CONSTRAINT CK_hands_hand_number CHECK (hand_number > 0),
  CONSTRAINT CK_hands_result CHECK (ISJSON(result) = 1)
);

-- One row per player per finished hand: the chips they won or lost. Each row is one call
-- to POST /players/:id/results { handId, delta }. sent_at stays NULL until the players
-- service has saved it; unsent rows are retried after the next hand. The players service
-- ignores a handId it has already saved, so a retry never counts twice.
CREATE TABLE dbo.hand_players (
  hand_id UNIQUEIDENTIFIER NOT NULL,
  player_id UNIQUEIDENTIFIER NOT NULL,
  delta INT NOT NULL,
  sent_at DATETIME2 NULL,
  CONSTRAINT PK_hand_players PRIMARY KEY (hand_id, player_id),
  CONSTRAINT FK_hand_players_hands FOREIGN KEY (hand_id)
    REFERENCES dbo.hands (id) ON DELETE CASCADE
);

-- Finds the results still to be sent to the players service.
CREATE INDEX IX_hand_players_unsent ON dbo.hand_players (hand_id)
  INCLUDE (player_id, delta)
  WHERE sent_at IS NULL;