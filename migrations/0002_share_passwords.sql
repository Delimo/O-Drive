ALTER TABLE share_links ADD COLUMN password_salt TEXT DEFAULT '';
ALTER TABLE share_links ADD COLUMN password_hash TEXT DEFAULT '';
