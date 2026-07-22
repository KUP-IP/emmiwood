-- SMS-only v1 admin auth: allowlisted E.164 phones (email retained for display/audit only).
ALTER TABLE emmiwood_admins ADD COLUMN phone TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_emmiwood_admins_shop_phone
  ON emmiwood_admins(shop_id, phone)
  WHERE phone IS NOT NULL AND TRIM(phone) != '';

-- Synthetic allowlist for preview/tests. Replace with the operator's real E.164 before production SMS auth.
UPDATE emmiwood_admins
SET phone = '+16055550199'
WHERE id = 'admin-isaiah' AND (phone IS NULL OR TRIM(phone) = '');
