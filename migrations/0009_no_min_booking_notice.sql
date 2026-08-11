-- V1: no minimum booking notice. Any open future slot is bookable
-- (walk-in guests can lock the next chair while they wait).
UPDATE emmiwood_shops
SET min_notice_minutes = 0
WHERE id = 'emmiwood';
