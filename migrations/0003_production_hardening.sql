-- Emmiwood production hardening: authentication abuse controls, consent provenance,
-- and observable notification delivery state. Additive only.

ALTER TABLE emmiwood_login_challenges ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE emmiwood_login_challenges ADD COLUMN locked_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_emmiwood_login_challenges_admin_created
  ON emmiwood_login_challenges(admin_id, created_at DESC);

ALTER TABLE emmiwood_customers ADD COLUMN sms_consent_version TEXT;
ALTER TABLE emmiwood_customers ADD COLUMN sms_consent_at INTEGER;

ALTER TABLE emmiwood_appointments ADD COLUMN manage_token_expires_at INTEGER;

ALTER TABLE emmiwood_notification_outbox ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE emmiwood_notification_outbox ADD COLUMN last_attempt_at INTEGER;
ALTER TABLE emmiwood_notification_outbox ADD COLUMN provider_message_id TEXT;
CREATE INDEX IF NOT EXISTS idx_emmiwood_notification_outbox_delivery
  ON emmiwood_notification_outbox(status, available_at, attempt_count);
