CREATE TABLE IF NOT EXISTS idempotency_keys (
  cache_key   text        PRIMARY KEY,
  user_id     text        NOT NULL,
  status_code integer     NOT NULL,
  response    jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idempotency_keys_expires_at_idx
  ON idempotency_keys (expires_at);
