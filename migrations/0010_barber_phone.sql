-- Nullable barber SMS destination for operational staff notices (assigned chair only).
-- No uniqueness constraint: intentional dual-use with admin phones is allowed for testing.
ALTER TABLE emmiwood_barbers ADD COLUMN phone TEXT;
