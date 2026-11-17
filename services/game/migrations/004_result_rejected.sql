-- A result the players service refused for good (a 4xx other than 404, e.g. a delta outside its
-- limits). It is kept for inspection but no longer sent, so it cannot block the results queue.
ALTER TABLE dbo.hand_players ADD rejected_at DATETIME2 NULL;