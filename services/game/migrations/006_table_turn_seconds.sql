-- How long each player has to act at this table, chosen by the creator. Existing tables keep
-- the previous fixed two minutes.
ALTER TABLE dbo.tables ADD turn_seconds SMALLINT NOT NULL
  CONSTRAINT DF_tables_turn_seconds DEFAULT 120
  CONSTRAINT CK_tables_turn_seconds CHECK (turn_seconds BETWEEN 15 AND 300);