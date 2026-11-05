CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  email TEXT,
  name TEXT,
  avatar_color TEXT,
  guest_token TEXT,
  created_at TEXT,
  UNIQUE(provider, provider_id),
  UNIQUE(guest_token)
);
