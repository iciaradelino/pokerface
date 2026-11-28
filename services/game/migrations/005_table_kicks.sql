-- Players the creator removed from a table. They cannot join it again until the creator lets
-- them back in, which deletes the row. Deleting the table deletes its rows too.
CREATE TABLE dbo.table_kicks (
  table_id CHAR(6) NOT NULL,
  player_id UNIQUEIDENTIFIER NOT NULL,
  player_name NVARCHAR(30) NOT NULL,
  kicked_at DATETIME2 NOT NULL CONSTRAINT DF_table_kicks_kicked_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_table_kicks PRIMARY KEY (table_id, player_id),
  CONSTRAINT FK_table_kicks_tables FOREIGN KEY (table_id) REFERENCES dbo.tables (id) ON DELETE CASCADE
);