-- Shop hours 2026-10-03:
-- Open 7:30 AM–7:30 PM every day.
-- Monday–Thursday appointments 7:30–noon and 4:00–7:30; walk-ins noon–4.
-- Friday, Saturday, and Sunday are walk-in only (no online appointments).

-- Morning windows that still start at 9:00 and end at noon.
UPDATE emmiwood_availability
SET start_minute = 450
WHERE weekday BETWEEN 1 AND 4
  AND start_minute = 540
  AND end_minute = 720;

-- Afternoon windows: 5:00–7:00 after 0007, or 2:00–7:00 if 0007 was not applied.
UPDATE emmiwood_availability
SET start_minute = 960, end_minute = 1170
WHERE weekday BETWEEN 1 AND 4
  AND end_minute = 1140
  AND start_minute IN (840, 1020);

DELETE FROM emmiwood_availability
WHERE weekday IN (0, 5, 6);
