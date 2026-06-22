const FILE_INDEX_SQL = `
  CREATE TABLE IF NOT EXISTS file_index (
    path TEXT PRIMARY KEY,
    storage_id TEXT NOT NULL DEFAULT 'r2',
    object_key TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    parent TEXT NOT NULL,
    kind TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    content_type TEXT DEFAULT '',
    uploaded_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  )
`;

const UPSERT_SQL = `INSERT INTO file_index (path, storage_id, object_key, name, parent, kind, size, content_type, uploaded_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(path) DO UPDATE SET
    storage_id = excluded.storage_id,
    object_key = excluded.object_key,
    name = excluded.name,
    parent = excluded.parent,
    kind = excluded.kind,
    size = excluded.size,
    content_type = excluded.content_type,
    uploaded_at = excluded.uploaded_at,
    updated_at = excluded.updated_at`;

export { UPSERT_SQL };

async function runStatement(statement) {
  if (typeof statement.bind === "function") return statement.bind().run();
  return statement.run();
}

let _fileIndexReady;

async function _ensureFileIndexTable(env) {
  try {
    await runStatement(env.D1.prepare(FILE_INDEX_SQL));
    try {
      await runStatement(
        env.D1.prepare(
          "ALTER TABLE file_index ADD COLUMN storage_id TEXT NOT NULL DEFAULT 'r2'",
        ),
      );
    } catch (_) {}
    try {
      await runStatement(
        env.D1.prepare(
          "ALTER TABLE file_index ADD COLUMN object_key TEXT NOT NULL DEFAULT ''",
        ),
      );
    } catch (_) {}
    try {
      await runStatement(
        env.D1.prepare(
          "CREATE INDEX IF NOT EXISTS idx_file_index_storage_id ON file_index(storage_id)",
        ),
      );
    } catch (_) {}
    try {
      await runStatement(
        env.D1.prepare(
          "CREATE INDEX IF NOT EXISTS idx_file_index_parent ON file_index(parent)",
        ),
      );
    } catch (_) {}
    try {
      await runStatement(
        env.D1.prepare(
          "CREATE INDEX IF NOT EXISTS idx_file_index_object ON file_index(storage_id, object_key)",
        ),
      );
    } catch (_) {}
    return true;
  } catch (_) {
    console.warn("[file-index] Failed to ensure file_index table");
    return false;
  }
}

export async function ensureFileIndexTable(env) {
  if (!env?.D1) return false;
  if (_fileIndexReady) return true;
  _fileIndexReady = _ensureFileIndexTable(env).catch((err) => {
    _fileIndexReady = null;
    throw err;
  });
  return _fileIndexReady;
}

export async function ensureStorageUsageTable(env) {
  try {
    await env.D1.prepare(
      `CREATE TABLE IF NOT EXISTS storage_usage (
        storage_id TEXT NOT NULL DEFAULT 'r2',
        object_key TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (storage_id, object_key)
      )`,
    ).run();
  } catch (_) {
    console.warn("[file-index] Failed to ensure storage_usage table");
  }
}
