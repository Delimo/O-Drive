ALTER TABLE webhook_deliveries ADD COLUMN payload TEXT NOT NULL DEFAULT '{}';
ALTER TABLE webhook_deliveries ADD COLUMN endpoint_config TEXT NOT NULL DEFAULT '{}';
ALTER TABLE webhook_deliveries ADD COLUMN retry_of INTEGER NOT NULL DEFAULT 0;
