ALTER TABLE notifications ADD COLUMN severity TEXT NOT NULL DEFAULT 'info';

CREATE INDEX IF NOT EXISTS idx_notifications_severity_created_at
  ON notifications(severity, created_at);

CREATE INDEX IF NOT EXISTS idx_notifications_event_created_at
  ON notifications(event, created_at);
