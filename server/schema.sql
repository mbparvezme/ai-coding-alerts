-- AI Coding Alerts licensing backend — D1 schema.
-- Design: ../docs/superpowers/specs/2026-07-22-licensing-backend-design.md (§4.2)

CREATE TABLE IF NOT EXISTS licenses (
  license_key            TEXT PRIMARY KEY,
  paddle_subscription_id TEXT UNIQUE,
  paddle_customer_id     TEXT,
  paddle_transaction_id  TEXT,
  email                  TEXT,
  status                 TEXT NOT NULL,          -- active | past_due | canceled
  plan                   TEXT,                   -- monthly | yearly
  device_limit           INTEGER NOT NULL DEFAULT 3,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_licenses_txn ON licenses(paddle_transaction_id);

CREATE TABLE IF NOT EXISTS activations (
  license_key  TEXT NOT NULL REFERENCES licenses(license_key),
  device_id    TEXT NOT NULL,
  activated_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (license_key, device_id)
);

CREATE TABLE IF NOT EXISTS processed_events (
  event_id     TEXT PRIMARY KEY,
  processed_at INTEGER NOT NULL
);
