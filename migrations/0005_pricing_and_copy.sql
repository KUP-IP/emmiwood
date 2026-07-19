-- Align Emmiwood's live catalog with the approved $35 standard haircut and revised service language.
UPDATE emmiwood_services SET price_cents=3500, description='A tailored cut or fade, neckline cleanup, and finished style.' WHERE id='signature' AND shop_id='emmiwood';
UPDATE emmiwood_services SET price_cents=5000, description='A full haircut with beard shaping, clean lines, and one balanced finish.' WHERE id='hair-beard' AND shop_id='emmiwood';
UPDATE emmiwood_services SET price_cents=2500, description='Shape, weight control, clean lines, and a conditioning finish.' WHERE id='beard' AND shop_id='emmiwood';
UPDATE emmiwood_services SET price_cents=1500, description='A precise edge-up and neckline cleanup between full cuts.' WHERE id='lineup' AND shop_id='emmiwood';
UPDATE emmiwood_services SET price_cents=3000, description='A patient, polished cut for guests age twelve and under.' WHERE id='young' AND shop_id='emmiwood';
