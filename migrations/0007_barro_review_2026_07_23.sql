-- Barro walkthrough 2026-07-23: menu prices, names, durations, appointment windows.
-- Target day: appointments 9–noon, walk-ins noon–5, appointments 5–7.

UPDATE emmiwood_services
SET
  name = 'Signature Haircut',
  description = 'A tailored cut or fade, neckline cleanup, and finished style.',
  price_cents = 3500,
  duration_minutes = 35,
  buffer_minutes = 5
WHERE id = 'signature' AND shop_id = 'emmiwood';

UPDATE emmiwood_services
SET
  name = 'Haircut + Beard Detail',
  description = 'A full haircut with beard shaping, clean lines, and one balanced finish. Hot towel available as a $5 add-on.',
  price_cents = 4000,
  duration_minutes = 55,
  buffer_minutes = 5
WHERE id = 'hair-beard' AND shop_id = 'emmiwood';

UPDATE emmiwood_services
SET
  name = 'Beard Sculpt',
  description = 'Shape, weight control, clean lines, and a conditioning finish.',
  price_cents = 2000,
  duration_minutes = 20,
  buffer_minutes = 5
WHERE id = 'beard' AND shop_id = 'emmiwood';

UPDATE emmiwood_services
SET
  name = 'Lineup & Cleanup',
  description = 'A precise edge-up and neckline cleanup between full cuts.',
  price_cents = 2000,
  duration_minutes = 20,
  buffer_minutes = 5
WHERE id = 'lineup' AND shop_id = 'emmiwood';

UPDATE emmiwood_services
SET
  name = 'Kids Cut',
  description = 'A patient, polished cut for guests age twelve and under.',
  price_cents = 2800,
  duration_minutes = 25,
  buffer_minutes = 5
WHERE id = 'young' AND shop_id = 'emmiwood';

-- Barro afternoon appointment window: was 2–7 (840–1140), now 5–7 (1020–1140)
UPDATE emmiwood_availability
SET start_minute = 1020, end_minute = 1140
WHERE barber_id = 'barro' AND start_minute = 840 AND end_minute = 1140;
