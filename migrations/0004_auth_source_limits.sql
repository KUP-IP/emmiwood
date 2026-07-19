CREATE TABLE IF NOT EXISTS emmiwood_auth_rate_limits (
  source_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (source_hash, window_start)
);

CREATE INDEX IF NOT EXISTS idx_emmiwood_auth_rate_limits_window
  ON emmiwood_auth_rate_limits(window_start);
