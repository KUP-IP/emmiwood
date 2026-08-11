-- V1 policy: allow customer cancel/reschedule until appointment start.
-- (min_notice later set to 0 in 0009 — book any open future slot.)
UPDATE emmiwood_shops
SET change_cutoff_minutes = 0
WHERE id = 'emmiwood';
