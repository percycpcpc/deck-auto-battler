CREATE TABLE IF NOT EXISTS ratings (
  user_id TEXT NOT NULL,
  deck_id TEXT NOT NULL,
  season TEXT NOT NULL,
  rating INTEGER NOT NULL,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, deck_id, season)
);

CREATE TABLE IF NOT EXISTS ranked_queue (
  user_id TEXT PRIMARY KEY,
  deck_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  enqueued_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ranked_queue_match
  ON ranked_queue (enqueued_at, rating);
