CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window_start ON api_rate_limits(window_start);
CREATE INDEX IF NOT EXISTS idx_system_warnings_level ON system_warnings(level);
CREATE INDEX IF NOT EXISTS idx_system_warnings_source ON system_warnings(source);
