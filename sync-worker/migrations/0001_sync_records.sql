CREATE TABLE IF NOT EXISTS sync_records (
  owner_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  schema_version INTEGER NOT NULL DEFAULT 1,
  client_updated_at TEXT,
  server_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  server_revision INTEGER NOT NULL DEFAULT 1,
  last_changed_device_id TEXT,
  PRIMARY KEY (owner_id, record_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_records_owner_revision
  ON sync_records (owner_id, server_revision);

CREATE INDEX IF NOT EXISTS idx_sync_records_owner_type
  ON sync_records (owner_id, record_type);

CREATE TABLE IF NOT EXISTS sync_clients (
  owner_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  label TEXT,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_user_agent TEXT,
  PRIMARY KEY (owner_id, device_id)
);

CREATE TABLE IF NOT EXISTS sync_meta (
  owner_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (owner_id, key)
);
