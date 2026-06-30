const initializedCoreTables = new WeakSet();
const initializedShareTable = new WeakSet();
const initializedProtectedTables = new WeakSet();

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
    actor TEXT DEFAULT '',
    status TEXT DEFAULT '',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    target_path TEXT DEFAULT '',
    error_code TEXT DEFAULT '',
    metadata TEXT DEFAULT '',
    timestamp INTEGER NOT NULL DEFAULT 0
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
    payload TEXT NOT NULL DEFAULT '{}',
    endpoint_config TEXT NOT NULL DEFAULT '{}',
    retry_of INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS system_warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    message TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'warning',
    acknowledged_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS trash (
    id TEXT PRIMARY KEY,
    original_key TEXT NOT NULL,
    trash_key TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    storage_id TEXT NOT NULL DEFAULT 'r2',
    trashed_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS trash_entries (
    id TEXT PRIMARY KEY,
    trash_id TEXT NOT NULL,
    path TEXT NOT NULL,
    storage_id TEXT NOT NULL DEFAULT 'r2',
    object_key TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    content_type TEXT DEFAULT '',
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS file_tasks (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL DEFAULT '{}',
    result TEXT NOT NULL DEFAULT '{}',
    error TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    finished_at INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS storage_usage (
    storage_id TEXT NOT NULL DEFAULT 'r2',
    object_key TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (storage_id, object_key)
  )`,
  `CREATE TABLE IF NOT EXISTS storage_objects (
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
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    path TEXT DEFAULT '',
    read INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
];

export const CORE_MIGRATION_SQL = [
  `ALTER TABLE download_bursts ADD COLUMN blocked_until INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE logs ADD COLUMN actor TEXT DEFAULT ''`,
  `ALTER TABLE logs ADD COLUMN status TEXT DEFAULT ''`,
  `ALTER TABLE logs ADD COLUMN duration_ms INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE logs ADD COLUMN target_path TEXT DEFAULT ''`,
  `ALTER TABLE logs ADD COLUMN error_code TEXT DEFAULT ''`,
  `ALTER TABLE logs ADD COLUMN metadata TEXT DEFAULT ''`,
  `ALTER TABLE trash ADD COLUMN storage_id TEXT NOT NULL DEFAULT 'r2'`,
  `ALTER TABLE system_warnings ADD COLUMN level TEXT NOT NULL DEFAULT 'warning'`,
  `ALTER TABLE system_warnings ADD COLUMN acknowledged_at INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE webhook_deliveries ADD COLUMN payload TEXT NOT NULL DEFAULT '{}'`,
  `ALTER TABLE webhook_deliveries ADD COLUMN endpoint_config TEXT NOT NULL DEFAULT '{}'`,
  `ALTER TABLE webhook_deliveries ADD COLUMN retry_of INTEGER NOT NULL DEFAULT 0`,
  `CREATE INDEX IF NOT EXISTS idx_trash_trashed_at ON trash(trashed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_trash_original_key ON trash(original_key)`,
  `CREATE INDEX IF NOT EXISTS idx_trash_entries_trash_id ON trash_entries(trash_id)`,
  `CREATE INDEX IF NOT EXISTS idx_trash_entries_object ON trash_entries(storage_id, object_key)`,
  `CREATE INDEX IF NOT EXISTS idx_logs_action_ip_timestamp ON logs(action, ip, timestamp)`,
  `CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event_created_at ON webhook_deliveries(event, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_file_tasks_status_created_at ON file_tasks(status, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_system_warnings_created_at ON system_warnings(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)`,
  `CREATE INDEX IF NOT EXISTS idx_path_access_attempts_last_attempt ON path_access_attempts(last_attempt)`,
  `CREATE INDEX IF NOT EXISTS idx_file_tasks_finished_at ON file_tasks(finished_at)`,
  `CREATE INDEX IF NOT EXISTS idx_storage_objects_hash ON storage_objects(storage_id, sha256, size)`,
  `ALTER TABLE notifications ADD COLUMN severity TEXT NOT NULL DEFAULT 'info'`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_severity_created_at ON notifications(severity, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_event_created_at ON notifications(event, created_at)`,
];

export const SHARE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS share_links (
    token TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    name TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    content_type TEXT DEFAULT '',
    target_type TEXT NOT NULL DEFAULT 'file',
    allow_preview INTEGER NOT NULL DEFAULT 1,
    allow_download INTEGER NOT NULL DEFAULT 1,
    expires_at INTEGER NOT NULL DEFAULT 0,
    max_downloads INTEGER NOT NULL DEFAULT 0,
    download_count INTEGER NOT NULL DEFAULT 0,
    password_salt TEXT DEFAULT '',
    password_hash TEXT DEFAULT '',
    expired_notified_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_accessed_at INTEGER NOT NULL DEFAULT 0,
    last_access_ip TEXT DEFAULT ''
  )
`;

export const SHARE_MIGRATION_SQL = [
  `ALTER TABLE share_links ADD COLUMN name TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE share_links ADD COLUMN size INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE share_links ADD COLUMN content_type TEXT DEFAULT ''`,
  `ALTER TABLE share_links ADD COLUMN target_type TEXT NOT NULL DEFAULT 'file'`,
  `ALTER TABLE share_links ADD COLUMN allow_preview INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE share_links ADD COLUMN allow_download INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE share_links ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE share_links ADD COLUMN max_downloads INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE share_links ADD COLUMN download_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE share_links ADD COLUMN password_salt TEXT DEFAULT ''`,
  `ALTER TABLE share_links ADD COLUMN password_hash TEXT DEFAULT ''`,
  `ALTER TABLE share_links ADD COLUMN expired_notified_at INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE share_links ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE share_links ADD COLUMN last_accessed_at INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE share_links ADD COLUMN last_access_ip TEXT DEFAULT ''`,
  `CREATE INDEX IF NOT EXISTS idx_share_links_created_at ON share_links(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_share_links_expires_at ON share_links(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_share_links_path ON share_links(path)`,
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
  if (typeof statement.bind === "function") return statement.bind().run();
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
  if (!env?.D1 || initializedShareTable.has(env)) return;
  await runSchemaStatements(env, [SHARE_TABLE_SQL], SHARE_MIGRATION_SQL);
  initializedShareTable.add(env);
}

export async function ensureProtectedTables(env) {
  if (!env?.D1 || initializedProtectedTables.has(env)) return;
  await runSchemaStatements(env, [
    PROTECTED_PATH_TABLE_SQL,
    PROTECTED_ATTEMPTS_TABLE_SQL,
  ]);
  initializedProtectedTables.add(env);
}
