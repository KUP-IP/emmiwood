import {
  BookingError,
  claimBuckets,
  reserveAppointment,
  cancelAppointment as cancelBooking,
  rescheduleAppointment as rescheduleBooking,
} from './emmiwood-booking.js';
import { appointmentSmsStatements } from './emmiwood-notifications.js';

export const SHOP_ID = 'emmiwood';
export const SHOP_TIME_ZONE = 'America/Chicago';
export const APPOINTMENT_WINDOWS = [[540, 720], [840, 1140]];
export const FIVE_MINUTES = 300;
const MANAGE_COOKIE = 'emmiwood_manage_session';


function cookieValue(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return '';
}

export function manageSessionCookie(rawToken, env = {}) {
  const secure = env.ENVIRONMENT === 'production' ? '; Secure' : '';
  return `${MANAGE_COOKIE}=${encodeURIComponent(rawToken)}; Path=/api/emmiwood/appointments; Max-Age=7200; HttpOnly; SameSite=Strict${secure}`;
}

export function clearManageSessionCookie(env = {}) {
  const secure = env.ENVIRONMENT === 'production' ? '; Secure' : '';
  return `${MANAGE_COOKIE}=; Path=/api/emmiwood/appointments; Max-Age=0; HttpOnly; SameSite=Strict${secure}`;
}

export function manageTokenFromRequest(request) {
  const value = cookieValue(request, MANAGE_COOKIE);
  if (!value) throw new EmmiwoodError('token_required', 'Open your private appointment link to continue.', 401);
  return value;
}

export class EmmiwoodError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}


export function requireSameOrigin(request, env = {}) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const requestOrigin = new URL(request.url).origin;
  const allowed = new Set([requestOrigin, env.CORS_ORIGIN, env.EMMIWOOD_PUBLIC_ORIGIN].filter(Boolean).map(String));
  if (!allowed.has(origin)) throw new EmmiwoodError('forbidden_origin', 'This request origin is not allowed.', 403);
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function errorResponse(error) {
  if (error instanceof EmmiwoodError || error instanceof BookingError) return json({ ok: false, error: error.message, code: error.code }, error.status);
  console.error('emmiwood', error);
  return json({ ok: false, error: 'Something went wrong. Please try again.' }, 500);
}

export function slotFits(startMinute, claimMinutes) {
  return APPOINTMENT_WINDOWS.some(([start, end]) => startMinute >= start && startMinute + claimMinutes <= end);
}

export function token(bytes = 24) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  throw new EmmiwoodError('invalid_phone', 'Enter a valid 10-digit mobile number.', 422);
}

export function validateDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new EmmiwoodError('invalid_date', 'Choose a valid date.', 422);
  return date;
}

export function zonedEpoch(date, minute, timeZone = SHOP_TIME_ZONE) {
  const [year, month, day] = validateDate(date).split('-').map(Number);
  const target = Date.UTC(year, month - 1, day, Math.floor(minute / 60), minute % 60, 0) / 1000;
  let guess = target;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess * 1000)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), 0) / 1000;
    guess += target - represented;
  }
  return guess;
}

export function localDateParts(epoch, timeZone = SHOP_TIME_ZONE) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(epoch * 1000)).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday), minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

function shiftDate(date, days) {
  const [year, month, day] = validateDate(date).split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

function rows(result) { return result?.results || []; }

const SEED = {
  shop: ['emmiwood', 'Emmiwood Barbers', '1118 S Minnesota Ave, Sioux Falls, SD 57105', '+16059006334', SHOP_TIME_ZONE, 240, 30, 720],
  barbers: [
    ['barro', 'Barro', 'Craft-led cuts, calm consultation, and a finish designed for the way your hair actually moves.', 1],
    ['john', 'John', 'Focused morning appointments with clean structure and understated detail.', 2],
  ],
  services: [
    ['signature', 'Signature Haircut', 'A tailored cut or fade, neckline cleanup, and finished style.', 3500, 40, 10, 1],
    ['hair-beard', 'Haircut + Beard Detail', 'A full haircut with beard shaping, clean lines, and one balanced finish.', 5000, 55, 10, 2],
    ['beard', 'Beard Sculpt', 'Shape, weight control, clean lines, and a conditioning finish.', 2500, 25, 5, 3],
    ['lineup', 'Lineup & Cleanup', 'A precise edge-up and neckline cleanup between full cuts.', 1500, 15, 5, 4],
    ['young', 'Young Gentleman’s Cut', 'A patient, polished cut for younger clients.', 3000, 30, 10, 5],
  ],
};

export async function bootstrap(env) {
  if (!env?.DB) throw new EmmiwoodError('database_unavailable', 'The booking database is unavailable.', 503);
  try {
    const existing = await env.DB.prepare('SELECT id FROM emmiwood_shops WHERE id=?').bind(SHOP_ID).first();
    if (existing) return { repaired: false };

    const statements = [
      env.DB.prepare('INSERT OR IGNORE INTO emmiwood_shops(id,name,address,phone,timezone,min_notice_minutes,horizon_days,change_cutoff_minutes) VALUES(?,?,?,?,?,?,?,?)').bind(...SEED.shop),
      env.DB.prepare("INSERT OR IGNORE INTO emmiwood_admins(id,shop_id,email,role) VALUES('admin-isaiah',?,'isaiah@kup.solutions','owner')").bind(SHOP_ID),
      ...SEED.barbers.map(([id, name, bio, sort]) => env.DB.prepare('INSERT OR IGNORE INTO emmiwood_barbers(id,shop_id,name,bio,sort_order) VALUES(?,?,?,?,?)').bind(id, SHOP_ID, name, bio, sort)),
      ...SEED.services.map(([id, name, description, price, duration, buffer, sort]) => env.DB.prepare('INSERT OR IGNORE INTO emmiwood_services(id,shop_id,name,description,price_cents,duration_minutes,buffer_minutes,sort_order) VALUES(?,?,?,?,?,?,?,?)').bind(id, SHOP_ID, name, description, price, duration, buffer, sort)),
    ];
    await env.DB.batch(statements);
    await env.DB.prepare("INSERT OR IGNORE INTO emmiwood_barber_services(barber_id,service_id) SELECT b.id,s.id FROM emmiwood_barbers b CROSS JOIN emmiwood_services s WHERE b.shop_id=? AND s.shop_id=?").bind(SHOP_ID, SHOP_ID).run();
    await env.DB.batch([
      ...[1, 2, 3, 4, 5, 6].flatMap((day) => APPOINTMENT_WINDOWS.map(([start, end], index) => env.DB.prepare('INSERT OR IGNORE INTO emmiwood_availability(id,barber_id,weekday,start_minute,end_minute) VALUES(?,?,?,?,?)').bind(`barro-${day}-${index ? 'pm' : 'am'}`, 'barro', day, start, end))),
      ...[1, 3, 5].map((day) => env.DB.prepare('INSERT OR IGNORE INTO emmiwood_availability(id,barber_id,weekday,start_minute,end_minute) VALUES(?,?,?,?,?)').bind(`john-${day}`, 'john', day, 540, 720)),
    ]);
    return { repaired: true };
  } catch (error) {
    if (/no such table/i.test(String(error))) throw new EmmiwoodError('migration_required', 'Local booking tables are missing. Run npm run db:migrate:local.', 503);
    throw error;
  }
}

export async function catalog(env) {
  await bootstrap(env);
  const [shop, services, barbers, eligibility] = await Promise.all([
    env.DB.prepare('SELECT * FROM emmiwood_shops WHERE id=?').bind(SHOP_ID).first(),
    env.DB.prepare('SELECT * FROM emmiwood_services WHERE shop_id=? AND active=1 ORDER BY sort_order').bind(SHOP_ID).all(),
    env.DB.prepare('SELECT * FROM emmiwood_barbers WHERE shop_id=? AND active=1 ORDER BY sort_order').bind(SHOP_ID).all(),
    env.DB.prepare('SELECT barber_id,service_id FROM emmiwood_barber_services').all(),
  ]);
  return { shop, services: rows(services), barbers: rows(barbers), eligibility: rows(eligibility) };
}

async function shopPolicy(env) {
  return env.DB.prepare('SELECT * FROM emmiwood_shops WHERE id=?').bind(SHOP_ID).first();
}

export async function slots(env, { serviceId, date, barberId = 'first', now = Math.floor(Date.now() / 1000), excludeAppointmentId = null }) {
  await bootstrap(env);
  validateDate(date);
  const policy = await shopPolicy(env);
  const service = await env.DB.prepare('SELECT * FROM emmiwood_services WHERE id=? AND shop_id=? AND active=1').bind(serviceId, SHOP_ID).first();
  if (!service) throw new EmmiwoodError('service_not_found', 'Choose an available service.', 404);
  const day = localDateParts(zonedEpoch(date, 720)).weekday;
  if (day === 0) return [];
  const earliest = now + policy.min_notice_minutes * 60;
  const horizonDate = localDateParts(now + policy.horizon_days * 86400).date;
  if (date > horizonDate) throw new EmmiwoodError('outside_horizon', `Appointments open ${policy.horizon_days} days ahead.`, 422);
  const availableBarbers = await env.DB.prepare(`SELECT b.id,b.name,a.start_minute,a.end_minute
    FROM emmiwood_barbers b JOIN emmiwood_barber_services bs ON bs.barber_id=b.id
    JOIN emmiwood_availability a ON a.barber_id=b.id AND a.weekday=? AND a.active=1
    WHERE b.shop_id=? AND b.active=1 AND bs.service_id=? AND (?='first' OR b.id=?) ORDER BY b.sort_order`).bind(day, SHOP_ID, serviceId, barberId, barberId).all();
  const dayStart = zonedEpoch(date, 0);
  const dayEnd = zonedEpoch(shiftDate(date, 1), 0);
  const [claimsResult, exceptionsResult] = await Promise.all([
    env.DB.prepare('SELECT barber_id,bucket_start,appointment_id FROM emmiwood_time_claims WHERE bucket_start>=? AND bucket_start<? AND (? IS NULL OR appointment_id<>?)').bind(dayStart, dayEnd, excludeAppointmentId, excludeAppointmentId).all(),
    env.DB.prepare("SELECT barber_id,start_minute,end_minute FROM emmiwood_exceptions WHERE shop_id=? AND date=? AND kind IN ('closed','blocked')").bind(SHOP_ID, date).all(),
  ]);
  const claimedBuckets = new Set(rows(claimsResult).map((claim) => `${claim.barber_id}:${claim.bucket_start}`));
  const exceptions = rows(exceptionsResult);
  const output = [];
  for (const barber of rows(availableBarbers)) {
    const claimMinutes = service.duration_minutes + service.buffer_minutes;
    for (let minute = barber.start_minute; minute + claimMinutes <= barber.end_minute; minute += 5) {
      if (!slotFits(minute, claimMinutes)) continue;
      const start = zonedEpoch(date, minute);
      if (start < earliest) continue;
      const claimEnd = start + claimMinutes * 60;
      let conflict = false;
      for (let bucket = start; bucket < claimEnd; bucket += FIVE_MINUTES) {
        if (claimedBuckets.has(`${barber.id}:${bucket}`)) {
          conflict = true;
          break;
        }
      }
      const blocked = exceptions.some((exception) =>
        (exception.barber_id == null || exception.barber_id === barber.id)
        && exception.start_minute < minute + claimMinutes
        && exception.end_minute > minute);
      if (!conflict && !blocked) output.push({ start, barberId: barber.id, barberName: barber.name });
    }
  }
  const unique = new Map();
  for (const slot of output.sort((a, b) => a.start - b.start || a.barberName.localeCompare(b.barberName))) {
    const key = barberId === 'first' ? slot.start : `${slot.barberId}-${slot.start}`;
    if (!unique.has(key)) unique.set(key, slot);
  }
  return [...unique.values()];
}

export async function book(env, input, adminId = null) {
  await bootstrap(env);
  const service = await env.DB.prepare('SELECT * FROM emmiwood_services WHERE id=? AND active=1').bind(input.serviceId).first();
  if (!service) throw new EmmiwoodError('service_not_found', 'Service is unavailable.', 404);
  const available = await slots(env, { serviceId: input.serviceId, date: input.date, barberId: input.barberId || 'first', now: input.now });
  const chosen = available.find((slot) => slot.start === Number(input.start) && (!input.barberId || input.barberId === 'first' || slot.barberId === input.barberId));
  if (!chosen) throw new EmmiwoodError('slot_taken', 'That time is no longer available. Choose another.', 409);
  if (!String(input.name || '').trim()) throw new EmmiwoodError('customer_required', 'Enter your name.', 422);
  const phone = normalizePhone(input.phone);
  const id = crypto.randomUUID();
  const customerId = crypto.randomUUID();
  const manageToken = token();
  const end = chosen.start + service.duration_minutes * 60;
  const claimEnd = end + service.buffer_minutes * 60;
  const smsConsent = Boolean(input.smsConsent);
  const notificationNow = Number(input.now ?? Math.floor(Date.now() / 1000));
  const extraStatements = [
    env.DB.prepare("INSERT INTO emmiwood_events(id,shop_id,appointment_id,admin_id,event_type,detail_json) VALUES(?,?,?,?, 'booked',?)").bind(crypto.randomUUID(), SHOP_ID, id, adminId, JSON.stringify({ start: chosen.start, barberId: chosen.barberId })),
    ...appointmentSmsStatements(env, {
      shopId: SHOP_ID,
      appointmentId: id,
      recipient: phone,
      smsConsent,
      event: 'booked',
      startAt: chosen.start,
      serviceName: service.name,
      barberName: chosen.barberName,
      now: notificationNow,
    }),
  ];
  await reserveAppointment(env.DB, {
    id, shopId: SHOP_ID, barberId: chosen.barberId, serviceId: input.serviceId, service,
    startAt: chosen.start, endAt: end, claimEndAt: claimEnd, manageTokenHash: await hash(manageToken),
    manageTokenExpiresAt: chosen.start + 7 * 86400,
    notes: input.notes || '', adminId, extraStatements,
    customer: {
      id: customerId,
      name: String(input.name).trim(),
      phone,
      email: input.email?.trim(),
      smsConsent,
      smsConsentVersion: smsConsent ? String(input.smsConsentVersion || 'appointment-texts-v1') : null,
      smsConsentAt: smsConsent ? Math.floor(Date.now() / 1000) : null,
    },
  });
  return { id, manageToken, start: chosen.start, barberName: chosen.barberName, serviceName: service.name };
}

const MANAGE_SELECT = `SELECT a.*,c.name customer_name,c.phone,c.email,c.sms_consent,b.name barber_name,s.name service_name,s.price_cents,s.duration_minutes,s.buffer_minutes
  FROM emmiwood_appointments a JOIN emmiwood_customers c ON c.id=a.customer_id JOIN emmiwood_barbers b ON b.id=a.barber_id JOIN emmiwood_services s ON s.id=a.service_id`;

export async function managedAppointment(env, manageToken) {
  const appointment = await env.DB.prepare(`${MANAGE_SELECT} WHERE a.manage_token_hash=? AND (a.manage_token_expires_at IS NULL OR a.manage_token_expires_at>?)`).bind(await hash(manageToken || ''), Math.floor(Date.now() / 1000)).first();
  if (!appointment) throw new EmmiwoodError('appointment_not_found', 'This appointment link is invalid or expired.', 404);
  return appointment;
}

export async function cancelAppointment(env, manageToken, adminId = null, now = Math.floor(Date.now() / 1000)) {
  const appointment = await managedAppointment(env, manageToken);
  if (appointment.status !== 'booked') throw new EmmiwoodError('not_changeable', 'This appointment is no longer active.', 409);
  const policy = await shopPolicy(env);
  if (!adminId && appointment.start_at - now < policy.change_cutoff_minutes * 60) throw new EmmiwoodError('change_cutoff', 'Online changes close 12 hours before your appointment. Call the shop for help.', 422);
  const extraStatements = [
    env.DB.prepare("INSERT INTO emmiwood_events(id,shop_id,appointment_id,admin_id,event_type) VALUES(?,?,?,?, 'cancelled')").bind(crypto.randomUUID(), SHOP_ID, appointment.id, adminId),
    ...appointmentSmsStatements(env, {
      shopId: SHOP_ID,
      appointmentId: appointment.id,
      recipient: appointment.phone,
      smsConsent: Boolean(appointment.sms_consent),
      event: 'cancelled',
      startAt: appointment.start_at,
      serviceName: appointment.service_name,
      barberName: appointment.barber_name,
      now,
    }),
  ];
  await cancelBooking(env.DB, { appointmentId: appointment.id, startAt: appointment.start_at, now, changeCutoffMinutes: policy.change_cutoff_minutes, isAdmin: Boolean(adminId), extraStatements });
  return { ok: true };
}

export async function rescheduleAppointment(env, manageToken, input, adminId = null, now = Math.floor(Date.now() / 1000)) {
  const appointment = await managedAppointment(env, manageToken);
  if (appointment.status !== 'booked') throw new EmmiwoodError('not_changeable', 'This appointment is no longer active.', 409);
  const policy = await shopPolicy(env);
  if (!adminId && appointment.start_at - now < policy.change_cutoff_minutes * 60) throw new EmmiwoodError('change_cutoff', 'Online changes close 12 hours before your appointment. Call the shop for help.', 422);
  const serviceId = input.serviceId || appointment.service_id;
  const available = await slots(env, { serviceId, date: input.date, barberId: input.barberId || appointment.barber_id, now, excludeAppointmentId: appointment.id });
  const chosen = available.find((slot) => slot.start === Number(input.start));
  if (!chosen) throw new EmmiwoodError('slot_taken', 'That new time is unavailable. Your original appointment is unchanged.', 409);
  const service = await env.DB.prepare('SELECT * FROM emmiwood_services WHERE id=?').bind(serviceId).first();
  const end = chosen.start + service.duration_minutes * 60;
  const claimEnd = end + service.buffer_minutes * 60;
  await rescheduleBooking(env.DB, {
    appointmentId: appointment.id, barberId: chosen.barberId, serviceId, service,
    startAt: chosen.start, endAt: end, claimEndAt: claimEnd, now,
    isAdmin: Boolean(adminId), changeCutoffMinutes: policy.change_cutoff_minutes,
    extraStatements: [
      env.DB.prepare("INSERT INTO emmiwood_events(id,shop_id,appointment_id,admin_id,event_type,detail_json) VALUES(?,?,?,?, 'rescheduled',?)").bind(crypto.randomUUID(), SHOP_ID, appointment.id, adminId, JSON.stringify({ from: appointment.start_at, to: chosen.start })),
      ...appointmentSmsStatements(env, {
        shopId: SHOP_ID,
        appointmentId: appointment.id,
        recipient: appointment.phone,
        smsConsent: Boolean(appointment.sms_consent),
        event: 'rescheduled',
        startAt: chosen.start,
        previousStartAt: appointment.start_at,
        serviceName: service.name,
        barberName: chosen.barberName,
        now,
      }),
    ],
  });
  return managedAppointment(env, manageToken);
}
