const TRASH_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS trash (
    id TEXT PRIMARY KEY,
    original_key TEXT NOT NULL,
    trash_key TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    storage_id TEXT NOT NULL DEFAULT 'r2',
    trashed_at INTEGER NOT NULL
  )
`;

const TRASH_ENTRIES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS trash_entries (
    id TEXT PRIMARY KEY,
    trash_id TEXT NOT NULL,
    path TEXT NOT NULL,
    storage_id TEXT NOT NULL DEFAULT 'r2',
    object_key TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    content_type TEXT DEFAULT '',
    created_at INTEGER NOT NULL
  )
`;

const SETTINGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`;

let _trashTableReady;
let _settingsTableReady;

export async function ensureTrashTable(env) {
  if (_trashTableReady) return;
  const stmt = env.D1.prepare(TRASH_TABLE_SQL);
  if (typeof stmt.bind === "function") {
    await stmt.bind().run();
  } else {
    await stmt.run();
  }
  try {
    await env.D1.prepare(
      "ALTER TABLE trash ADD COLUMN storage_id TEXT NOT NULL DEFAULT 'r2'",
    ).run();
  } catch (_) {}
  await env.D1.prepare(TRASH_ENTRIES_TABLE_SQL).run();
  try {
    await env.D1.prepare(
      "CREATE INDEX IF NOT EXISTS idx_trash_entries_trash_id ON trash_entries(trash_id)",
    ).run();
  } catch (_) {}
  try {
    await env.D1.prepare(
      "CREATE INDEX IF NOT EXISTS idx_trash_entries_object ON trash_entries(storage_id, object_key)",
    ).run();
  } catch (_) {}
  _trashTableReady = true;
}

export async function ensureSettingsTable(env) {
  if (_settingsTableReady) return;
  const stmt = env.D1.prepare(SETTINGS_TABLE_SQL);
  if (typeof stmt.bind === "function") {
    await stmt.bind().run();
  } else {
    await stmt.run();
  }
  _settingsTableReady = true;
}
