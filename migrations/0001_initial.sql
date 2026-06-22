CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS logs (
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
);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS login_alerts (
  key TEXT PRIMARY KEY,
  last_alert INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS kv_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS download_bursts (
  key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL DEFAULT 0,
  last_alert INTEGER NOT NULL DEFAULT 0,
  blocked_until INTEGER NOT NULL DEFAULT 0,
  sample_paths TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  url TEXT NOT NULL,
  ok INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 0,
  error TEXT DEFAULT '',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS system_warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'warning',
  acknowledged_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

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

CREATE TABLE IF NOT EXISTS file_tasks (
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
);

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
);

CREATE INDEX IF NOT EXISTS idx_file_index_name ON file_index(name);
CREATE INDEX IF NOT EXISTS idx_file_index_parent ON file_index(parent);
CREATE INDEX IF NOT EXISTS idx_file_index_kind ON file_index(kind);
CREATE INDEX IF NOT EXISTS idx_file_index_uploaded_at ON file_index(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_file_index_storage_id ON file_index(storage_id);
CREATE INDEX IF NOT EXISTS idx_file_index_object ON file_index(storage_id, object_key);

CREATE INDEX IF NOT EXISTS idx_trash_trashed_at ON trash(trashed_at);
CREATE INDEX IF NOT EXISTS idx_trash_original_key ON trash(original_key);

CREATE INDEX IF NOT EXISTS idx_logs_action_ip_timestamp ON logs(action, ip, timestamp);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event_created_at ON webhook_deliveries(event, created_at);
CREATE INDEX IF NOT EXISTS idx_file_tasks_status_created_at ON file_tasks(status, created_at);

CREATE TABLE IF NOT EXISTS path_passwords (
  path TEXT PRIMARY KEY,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  note TEXT DEFAULT '',
  show_name INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS path_access_attempts (
  path TEXT NOT NULL,
  ip TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (path, ip)
);

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
  expired_notified_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_accessed_at INTEGER NOT NULL DEFAULT 0,
  last_access_ip TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_share_links_created_at ON share_links(created_at);
CREATE INDEX IF NOT EXISTS idx_share_links_expires_at ON share_links(expires_at);
CREATE INDEX IF NOT EXISTS idx_share_links_path ON share_links(path);
