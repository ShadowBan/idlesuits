-- The pit boss's tuning the server reads as it decides rounds: one row of JSON.
CREATE TABLE tuning (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
