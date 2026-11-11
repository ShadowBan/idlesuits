-- The leaderboards: each member's best on each board, this week and all-time.
CREATE TABLE scores (
  board TEXT NOT NULL,      -- 'win', 'x', 'net' or 'tokens'
  period TEXT NOT NULL,     -- a week ('w2026-11-09', its Monday) or 'all'
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  value TEXT NOT NULL,      -- the amount, as a string so any size survives
  sort REAL NOT NULL,       -- what orders the board (a huge amount by its logarithm)
  detail TEXT,              -- what it was: the round and the game
  at INTEGER NOT NULL,
  PRIMARY KEY (board, period, user_id)
);
CREATE INDEX scores_rank ON scores (board, period, sort DESC);
