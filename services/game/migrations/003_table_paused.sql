-- The creator can pause a table: the hand being played finishes, but no new hand starts until
-- they resume. Stored so a restart keeps the table paused.
ALTER TABLE dbo.tables ADD paused BIT NOT NULL CONSTRAINT DF_tables_paused DEFAULT 0;