CREATE TABLE IF NOT EXISTS trash_entries (
  id TEXT PRIMARY KEY,
  trash_id TEXT NOT NULL,
  path TEXT NOT NULL,
  storage_id TEXT NOT NULL DEFAULT 'r2',
  object_key TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  content_type TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trash_entries_trash_id
  ON trash_entries(trash_id);

CREATE INDEX IF NOT EXISTS idx_trash_entries_object
  ON trash_entries(storage_id, object_key);
