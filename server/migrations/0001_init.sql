CREATE TABLE IF NOT EXISTS decks (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  card_ids TEXT,
  starter_id TEXT,
  won INTEGER,
  level_reached INTEGER,
  hp_left INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS save_slots (
  owner_id TEXT,
  slot INTEGER,
  deck_id TEXT,
  updated_at TEXT,
  PRIMARY KEY (owner_id, slot)
);

CREATE TABLE IF NOT EXISTS entitlements (
  user_id TEXT PRIMARY KEY,
  sku TEXT,
  purchased_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT,
  created_at TEXT,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS replays (
  id TEXT PRIMARY KEY,
  deck_a TEXT,
  deck_b TEXT,
  seed TEXT,
  result TEXT,
  created_at TEXT
);
