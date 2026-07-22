import type { Catalog } from './types';

export const EMMIWOOD_PHONE = '+16059006334';
export const EMMIWOOD_PHONE_LABEL = '(605) 900-6334';
export const EMMIWOOD_ADDRESS = '1118 S Minnesota Ave, Sioux Falls, SD 57105';
export const EMMIWOOD_PLACE_NAME = 'Emmiwood Barbers';
/** Google Maps place listing for the shop (opens the listing card, not a bare directions form). */
export const EMMIWOOD_MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${EMMIWOOD_PLACE_NAME}, ${EMMIWOOD_ADDRESS}`)}`;
/** Geocoded pin for 1118 S Minnesota Ave, Sioux Falls, SD 57105 */
export const EMMIWOOD_LAT = 43.5355407;
export const EMMIWOOD_LNG = -96.7311599;
export const EMMIWOOD_CONSENT_VERSION = 'appointment-texts-v1';

/** Google Maps Embed API when `VITE_GOOGLE_MAPS_API_KEY` is set; otherwise a keyed-less Maps embed of the pin. */
export function emmiwoodMapsEmbedSrc(): string {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  const query = encodeURIComponent(`${EMMIWOOD_PLACE_NAME}, ${EMMIWOOD_ADDRESS}`);
  if (key) {
    return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${query}&zoom=16`;
  }
  return `https://www.google.com/maps?q=${EMMIWOOD_LAT},${EMMIWOOD_LNG}&z=16&hl=en&output=embed`;
}

export const FALLBACK_CATALOG: Catalog = {
  shop: {
    id: 'emmiwood',
    name: 'Emmiwood Barbers',
    address: EMMIWOOD_ADDRESS,
    phone: EMMIWOOD_PHONE,
    timezone: 'America/Chicago',
    min_notice_minutes: 240,
    horizon_days: 30,
    change_cutoff_minutes: 720,
  },
  services: [
    { id: 'signature', name: 'Signature Haircut', description: 'A tailored cut or fade, neckline cleanup, and finished style.', price_cents: 3500, duration_minutes: 40, buffer_minutes: 10, active: 1, sort_order: 1 },
    { id: 'hair-beard', name: 'Haircut + Beard Detail', description: 'A full haircut with beard shaping, clean lines, and one balanced finish.', price_cents: 5000, duration_minutes: 55, buffer_minutes: 10, active: 1, sort_order: 2 },
    { id: 'beard', name: 'Beard Sculpt', description: 'Shape, weight control, clean lines, and a conditioning finish.', price_cents: 2500, duration_minutes: 25, buffer_minutes: 5, active: 1, sort_order: 3 },
    { id: 'lineup', name: 'Lineup & Cleanup', description: 'A precise edge-up and neckline cleanup between full cuts.', price_cents: 1500, duration_minutes: 15, buffer_minutes: 5, active: 1, sort_order: 4 },
    { id: 'young', name: 'Young Gentleman’s Cut', description: 'A patient, polished cut for guests age twelve and under.', price_cents: 3000, duration_minutes: 30, buffer_minutes: 10, active: 1, sort_order: 5 },
  ],
  barbers: [
    { id: 'barro', name: 'Barro', bio: 'Craft-led cuts, calm consultation, and a finish designed for the way your hair actually moves.', active: 1, sort_order: 1 },
    { id: 'john', name: 'John', bio: 'Focused morning appointments with clean structure and understated detail.', active: 1, sort_order: 2 },
  ],
  eligibility: ['barro', 'john'].flatMap((barber_id) => ['signature', 'hair-beard', 'beard', 'lineup', 'young'].map((service_id) => ({ id: `${barber_id}--${service_id}`, barber_id, service_id }))),
};

export const SERVICE_FIT: Record<string, string> = {
  signature: 'Best for a complete reset, fade, taper, or maintained shape.',
  'hair-beard': 'Best when the haircut and beard need to read as one finished look.',
  beard: 'Best for shape, weight control, and sharper lines without a haircut.',
  lineup: 'Best for extending a cut between full appointments.',
  young: 'Best for younger guests who need a patient, considered appointment.',
};

export const BARBER_DETAILS: Record<string, { schedule: string; specialty: string; fit: string }> = {
  barro: {
    schedule: 'Monday–Saturday',
    specialty: 'Texture, fades, beard balance, and cuts built to grow out clean.',
    fit: 'Choose Barro when you want a consultative appointment and a tailored finish.',
  },
  john: {
    schedule: 'Monday, Wednesday, Friday · mornings',
    specialty: 'Classic structure, clean silhouettes, and efficient morning appointments.',
    fit: 'Choose John for a focused appointment and a crisp, understated result.',
  },
};

export const money = (cents: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(cents / 100);
