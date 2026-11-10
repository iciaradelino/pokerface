CREATE TABLE dbo.players (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_players PRIMARY KEY DEFAULT NEWID(),
  name NVARCHAR(30) NOT NULL,
  avatar NVARCHAR(7) NOT NULL CONSTRAINT DF_players_avatar DEFAULT N'#B8F23A',
  chips INT NOT NULL CONSTRAINT DF_players_chips DEFAULT 1000,
  gesture_settings NVARCHAR(MAX) NOT NULL CONSTRAINT DF_players_gesture_settings DEFAULT N'{}',
  created_at DATETIME2 NOT NULL CONSTRAINT DF_players_created_at DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL CONSTRAINT DF_players_updated_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_players_name CHECK (LEN(name) BETWEEN 1 AND 30),
  CONSTRAINT CK_players_chips CHECK (chips >= 0),
  CONSTRAINT CK_players_gesture_settings CHECK (ISJSON(gesture_settings) = 1)
);

-- One row per player per finished hand. The composite key makes saving a result
-- idempotent: a retry with the same hand_id is detected instead of counted twice.
CREATE TABLE dbo.hand_results (
  hand_id UNIQUEIDENTIFIER NOT NULL,
  player_id UNIQUEIDENTIFIER NOT NULL,
  delta INT NOT NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_hand_results_created_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_hand_results PRIMARY KEY (hand_id, player_id),
  CONSTRAINT FK_hand_results_players FOREIGN KEY (player_id)
    REFERENCES dbo.players (id) ON DELETE CASCADE
);

-- Leaderboard: highest chips first, ties broken by name.
CREATE INDEX IX_players_leaderboard ON dbo.players (chips DESC, name);
