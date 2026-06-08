CREATE TABLE IF NOT EXISTS trash (
  id TEXT PRIMARY KEY,
  original_key TEXT NOT NULL,
  trash_key TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  storage_id TEXT NOT NULL DEFAULT 'r2',
  trashed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trash_trashed_at ON trash(trashed_at);
CREATE INDEX IF NOT EXISTS idx_trash_original_key ON trash(original_key);
