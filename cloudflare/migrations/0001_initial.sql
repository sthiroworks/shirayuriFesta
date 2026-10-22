CREATE TABLE IF NOT EXISTS app_meta (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  initialized INTEGER NOT NULL DEFAULT 0 CHECK (initialized IN (0, 1)),
  settings_json TEXT NOT NULL DEFAULT '{"enabled":true,"category":"古園服","siblings":1,"perSibling":4}',
  inventory_json TEXT NOT NULL DEFAULT '{"salesByProduct":{},"remainingByProduct":{},"adjustments":[]}',
  last_request_id TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO app_meta (singleton_id) VALUES (1);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY NOT NULL,
  data_json TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY NOT NULL,
  recorded_at TEXT NOT NULL,
  data_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS transactions_recorded_at_idx ON transactions(recorded_at);

CREATE TABLE IF NOT EXISTS change_log (
  revision INTEGER PRIMARY KEY NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
