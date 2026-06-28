CREATE TABLE IF NOT EXISTS storage_objects (
  id TEXT PRIMARY KEY,
  storage_id TEXT NOT NULL DEFAULT 'r2',
  object_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  content_type TEXT DEFAULT '',
  ref_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (storage_id, sha256, size),
  UNIQUE (storage_id, object_key)
);

CREATE INDEX IF NOT EXISTS idx_storage_objects_hash
  ON storage_objects(storage_id, sha256, size);
