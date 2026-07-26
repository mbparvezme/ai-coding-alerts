-- AI Coding Alerts accounts backend — D1 schema.
-- Design: ../docs/superpowers/specs/2026-07-26-accounts-design.md (§5)

CREATE TABLE users (
  id                  TEXT PRIMARY KEY,        -- our account id, rides into Paddle custom_data
  github_id           INTEGER UNIQUE NOT NULL, -- stable GitHub numeric id (not username)
  email               TEXT,                    -- primary verified email from GitHub
  name                TEXT,
  username            TEXT,                    -- GitHub login/handle (mutable — display only)
  avatar_url          TEXT,
  paddle_customer_id  TEXT,                    -- set by webhook on first subscription
  marketing_consent   INTEGER NOT NULL DEFAULT 0, -- 0/1, unticked opt-in (GDPR)
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE TABLE subscriptions (
  paddle_subscription_id TEXT PRIMARY KEY,
  user_id                TEXT NOT NULL REFERENCES users(id),
  status                 TEXT NOT NULL,        -- active | past_due | canceled | paused
  plan                   TEXT NOT NULL,        -- monthly | yearly
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);

CREATE TABLE devices (                          -- was `activations`, now keyed to the account
  user_id      TEXT NOT NULL REFERENCES users(id),
  device_id    TEXT NOT NULL,
  activated_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, device_id)
);

CREATE TABLE settings_backups (                 -- the free carrot: settings sync/restore
  user_id     TEXT PRIMARY KEY REFERENCES users(id),
  blob        TEXT NOT NULL,                    -- JSON settings snapshot
  updated_at  INTEGER NOT NULL
);

-- processed_events: unchanged from v1 (event-id dedupe for webhook replay protection)
CREATE TABLE processed_events (
  event_id     TEXT PRIMARY KEY,
  processed_at INTEGER NOT NULL
);
