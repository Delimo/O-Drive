const initializedCoreTables = new WeakSet();

export const CORE_TABLE_SQL = [
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    details TEXT,
    ip TEXT,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    ip TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS login_alerts (
    key TEXT PRIMARY KEY,
    last_alert INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS kv_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS api_rate_limits (
    key TEXT PRIMARY KEY,
    request_count INTEGER NOT NULL DEFAULT 0,
    window_start INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS download_bursts (
    key TEXT PRIMARY KEY,
    request_count INTEGER NOT NULL DEFAULT 0,
    window_start INTEGER NOT NULL DEFAULT 0,
    last_alert INTEGER NOT NULL DEFAULT 0,
    blocked_until INTEGER NOT NULL DEFAULT 0,
    sample_paths TEXT NOT NULL DEFAULT '[]'
  )`,
  `CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    url TEXT NOT NULL,
    ok INTEGER NOT NULL DEFAULT 0,
    status INTEGER NOT NULL DEFAULT 0,
    error TEXT DEFAULT '',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS system_warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
];

export const CORE_MIGRATION_SQL = [
  `ALTER TABLE download_bursts ADD COLUMN blocked_until INTEGER NOT NULL DEFAULT 0`,
];

export const SHARE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS share_links (
    token TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    name TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    content_type TEXT DEFAULT '',
    allow_preview INTEGER NOT NULL DEFAULT 1,
    allow_download INTEGER NOT NULL DEFAULT 1,
    expires_at INTEGER NOT NULL DEFAULT 0,
    max_downloads INTEGER NOT NULL DEFAULT 0,
    download_count INTEGER NOT NULL DEFAULT 0,
    password_salt TEXT DEFAULT '',
    password_hash TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    last_accessed_at INTEGER NOT NULL DEFAULT 0
  )
`;

export const SHARE_MIGRATION_SQL = [
  `ALTER TABLE share_links ADD COLUMN password_salt TEXT DEFAULT ''`,
  `ALTER TABLE share_links ADD COLUMN password_hash TEXT DEFAULT ''`,
];

export const PROTECTED_PATH_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS path_passwords (
    path TEXT PRIMARY KEY,
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    note TEXT DEFAULT '',
    show_name INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  )
`;

export const PROTECTED_ATTEMPTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS path_access_attempts (
    path TEXT NOT NULL,
    ip TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (path, ip)
  )
`;

export async function runStatement(statement) {
  if (typeof statement.bind === 'function') return statement.bind().run();
  return statement.run();
}

export async function runSchemaStatements(env, statements, migrations = []) {
  if (!env?.D1) return;
  for (const sql of statements) {
    await runStatement(env.D1.prepare(sql));
  }
  for (const sql of migrations) {
    try {
      await runStatement(env.D1.prepare(sql));
    } catch (_) {}
  }
}

export async function ensureCoreTables(env) {
  if (!env?.D1 || initializedCoreTables.has(env)) return;
  await runSchemaStatements(env, CORE_TABLE_SQL, CORE_MIGRATION_SQL);
  initializedCoreTables.add(env);
}

export async function ensureShareTable(env) {
  await runSchemaStatements(env, [SHARE_TABLE_SQL], SHARE_MIGRATION_SQL);
}

export async function ensureProtectedTables(env) {
  await runSchemaStatements(env, [PROTECTED_PATH_TABLE_SQL, PROTECTED_ATTEMPTS_TABLE_SQL]);
}
