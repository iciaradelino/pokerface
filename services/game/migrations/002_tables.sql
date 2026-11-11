-- A private table. The id is the short code players share to join (e.g. K7QX2M),
-- so the UI can use it directly in /tables/:id.
CREATE TABLE dbo.tables (
  id CHAR(6) NOT NULL CONSTRAINT PK_tables PRIMARY KEY,
  small_blind INT NOT NULL CONSTRAINT DF_tables_small_blind DEFAULT 5,
  big_blind INT NOT NULL CONSTRAINT DF_tables_big_blind DEFAULT 10,
  max_seats TINYINT NOT NULL CONSTRAINT DF_tables_max_seats DEFAULT 6,
  created_by UNIQUEIDENTIFIER NOT NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_tables_created_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_tables_id CHECK (id NOT LIKE '%[^A-Z0-9]%'),
  CONSTRAINT CK_tables_blinds CHECK (small_blind > 0 AND small_blind <= big_blind),
  CONSTRAINT CK_tables_max_seats CHECK (max_seats BETWEEN 2 AND 6)
);

-- Who sits where. player_id comes from the players service; there is no foreign key
-- across services. The name is copied at join time so a running table does not need
-- the players service.
CREATE TABLE dbo.seats (
  table_id CHAR(6) NOT NULL,
  seat_index TINYINT NOT NULL,
  player_id UNIQUEIDENTIFIER NOT NULL,
  player_name NVARCHAR(30) NOT NULL,
  joined_at DATETIME2 NOT NULL CONSTRAINT DF_seats_joined_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_seats PRIMARY KEY (table_id, seat_index),
  CONSTRAINT UQ_seats_player UNIQUE (table_id, player_id),
  CONSTRAINT FK_seats_tables FOREIGN KEY (table_id)
    REFERENCES dbo.tables (id) ON DELETE CASCADE,
  CONSTRAINT CK_seats_seat_index CHECK (seat_index BETWEEN 0 AND 5)
);

-- One row per finished hand. id is the handId sent to the players service, so a retried
-- result is recognised there. results_sent_at stays NULL until players has saved the
-- result; those hands are retried after the next hand.
CREATE TABLE dbo.hands (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_hands PRIMARY KEY DEFAULT NEWID(),
  table_id CHAR(6) NOT NULL,
  hand_number INT NOT NULL,
  result NVARCHAR(MAX) NOT NULL,
  finished_at DATETIME2 NOT NULL CONSTRAINT DF_hands_finished_at DEFAULT SYSUTCDATETIME(),
  results_sent_at DATETIME2 NULL,
  CONSTRAINT UQ_hands_table_number UNIQUE (table_id, hand_number),
  CONSTRAINT FK_hands_tables FOREIGN KEY (table_id)
    REFERENCES dbo.tables (id) ON DELETE CASCADE,
  CONSTRAINT CK_hands_hand_number CHECK (hand_number > 0),
  CONSTRAINT CK_hands_result CHECK (ISJSON(result) = 1)
);

-- Finds hands whose results still have to be sent to the players service.
CREATE INDEX IX_hands_unsent ON dbo.hands (table_id) WHERE results_sent_at IS NULL;