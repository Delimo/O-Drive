CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_path_access_attempts_last_attempt ON path_access_attempts(last_attempt);
CREATE INDEX IF NOT EXISTS idx_file_tasks_finished_at ON file_tasks(finished_at);
