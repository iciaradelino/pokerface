-- Saving a result sums every delta of one player. The primary key starts with hand_id, so
-- without this index that sum scans the whole table and locks other players' rows, which made
-- simultaneous saves deadlock. With it, each save only reads its own player's rows.
CREATE INDEX IX_hand_results_player ON dbo.hand_results (player_id) INCLUDE (delta);
