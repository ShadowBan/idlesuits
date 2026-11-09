-- Accounts, sessions, and failed sign-ins (for a short lockout).
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pass TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player',
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  -- SHA-256 of the session token: the token itself is only ever in the player's cookie.
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE sign_in_failures (
  email TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX sign_in_failures_email ON sign_in_failures(email, at);
