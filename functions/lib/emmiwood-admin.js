import { EmmiwoodError, SHOP_ID, book, bootstrap, hash, requireSameOrigin, slots, token, validateDate } from './emmiwood-core.js';
import { cancelAppointment as cancelBooking, rescheduleAppointment as rescheduleBooking } from './emmiwood-booking.js';
import {
  NOTIFICATION_PROVIDER_MOCK,
  appointmentSmsStatements,
  deliverNotification,
  notificationProvider,
  notificationStatement,
} from './emmiwood-notifications.js';

const EDIT_ROLES = ['owner', 'manager', 'staff'];
const RESOURCE = {
  barbers: { table: 'emmiwood_barbers', fields: ['name', 'bio', 'active', 'sort_order'], required: ['name'] },
  services: { table: 'emmiwood_services', fields: ['name', 'description', 'price_cents', 'duration_minutes', 'buffer_minutes', 'active', 'sort_order'], required: ['name', 'price_cents', 'duration_minutes'] },
  availability: { table: 'emmiwood_availability', fields: ['barber_id', 'weekday', 'start_minute', 'end_minute', 'active'], required: ['barber_id', 'weekday', 'start_minute', 'end_minute'] },
  blocks: { table: 'emmiwood_exceptions', fields: ['barber_id', 'date', 'start_minute', 'end_minute', 'kind', 'note'], required: ['date', 'kind'] },
  eligibility: { table: 'emmiwood_barber_services', fields: ['barber_id', 'service_id'], required: ['barber_id', 'service_id'] },
};

const rows = (result) => result?.results || [];
const now = () => Math.floor(Date.now() / 1000);
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export function authRequestLimit(env = {}) {
  const configured = Number(env.EMMIWOOD_AUTH_REQUEST_LIMIT);
  if (Number.isFinite(configured) && configured > 0) return Math.min(Math.floor(configured), 100);
  return env.ENVIRONMENT === 'production' ? 5 : 50;
}


export function authSourceLimit(env = {}) {
  const configured = Number(env.EMMIWOOD_AUTH_SOURCE_LIMIT);
  if (Number.isFinite(configured) && configured > 0) return Math.min(Math.floor(configured), 1_000);
  return env.ENVIRONMENT === 'production' ? 20 : 200;
}

async function consumeAuthSource(env, source) {
  const normalizedSource = String(source || '').trim();
  if (!normalizedSource) return true;
  const windowStart = Math.floor(now() / 600) * 600;
  const sourceHash = await hash(normalizedSource);
  await env.DB.prepare(`INSERT INTO emmiwood_auth_rate_limits(source_hash,window_start,request_count)
    VALUES(?,?,1) ON CONFLICT(source_hash,window_start)
    DO UPDATE SET request_count=request_count+1`).bind(sourceHash, windowStart).run();
  const row = await env.DB.prepare('SELECT request_count FROM emmiwood_auth_rate_limits WHERE source_hash=? AND window_start=?').bind(sourceHash, windowStart).first();
  return Number(row?.request_count || 0) <= authSourceLimit(env);
}
const ADMIN_SESSION_COOKIE = 'emmiwood_admin_session';

function cookieValue(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return '';
}

export function adminSessionCookie(rawToken, env = {}) {
  const secure = env.ENVIRONMENT === 'production' ? '; Secure' : '';
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(rawToken)}; Path=/api/emmiwood/admin; Max-Age=28800; HttpOnly; SameSite=Strict${secure}`;
}

export function clearAdminSessionCookie(env = {}) {
  const secure = env.ENVIRONMENT === 'production' ? '; Secure' : '';
  return `${ADMIN_SESSION_COOKIE}=; Path=/api/emmiwood/admin; Max-Age=0; HttpOnly; SameSite=Strict${secure}`;
}

function audit(env, adminId, eventType, detail = {}, appointmentId = null) {
  return env.DB.prepare('INSERT INTO emmiwood_events(id,shop_id,appointment_id,admin_id,event_type,detail_json) VALUES(?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), SHOP_ID, appointmentId, adminId, eventType, JSON.stringify(detail));
}

async function enforceAuthResponseFloor(env, startedAt) {
  if (env.ENVIRONMENT !== 'production') return;
  const configured = Number(env.EMMIWOOD_AUTH_RESPONSE_FLOOR_MS ?? 150);
  const floorMs = Number.isFinite(configured) && configured >= 0 ? Math.min(configured, 1_000) : 150;
  const remaining = floorMs - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

async function deliverAdminCode(env, admin, normalized, notificationId, payload, provider) {
  try {
    if (env.ENVIRONMENT === 'production' && provider === NOTIFICATION_PROVIDER_MOCK) {
      throw new Error('Email delivery is not configured.');
    }
    const delivery = await deliverNotification(env, {
      id: notificationId,
      channel: 'email',
      template: 'admin_login_code',
      recipient: normalized,
      payload_json: JSON.stringify(payload),
      provider,
    });
    if (delivery.status === 'sent') {
      await env.DB.batch([
        env.DB.prepare(`UPDATE emmiwood_notification_outbox
          SET status='sent',provider=?,sent_at=unixepoch(),last_attempt_at=unixepoch(),attempt_count=attempt_count+1,provider_message_id=?,error=NULL
          WHERE id=?`).bind(delivery.provider, delivery.providerMessageId || null, notificationId),
        audit(env, admin.id, 'admin_code_delivered', { provider: delivery.provider, providerMessageId: delivery.providerMessageId || null }),
      ]);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.DB.batch([
      env.DB.prepare(`UPDATE emmiwood_notification_outbox
        SET status='failed',provider=?,last_attempt_at=unixepoch(),attempt_count=attempt_count+1,error=?
        WHERE id=?`).bind(provider, message.slice(0, 500), notificationId),
      audit(env, admin.id, 'admin_code_delivery_failed', { provider, error: message.slice(0, 200) }),
    ]);
  }
}

export async function requestCode(env, email, { defer, source } = {}) {
  const startedAt = Date.now();
  await bootstrap(env);
  const normalized = normalizeEmail(email);
  if (!normalized) throw new EmmiwoodError('email_required', 'Email is required.', 422);
  if (!await consumeAuthSource(env, source)) {
    await enforceAuthResponseFloor(env, startedAt);
    return { ok: true };
  }
  const admin = await env.DB.prepare('SELECT * FROM emmiwood_admins WHERE shop_id=? AND email=? COLLATE NOCASE AND active=1').bind(SHOP_ID, normalized).first();
  if (!admin) {
    await enforceAuthResponseFloor(env, startedAt);
    return { ok: true };
  }
  const recentChallenges = await env.DB.prepare('SELECT COUNT(*) count FROM emmiwood_login_challenges WHERE admin_id=? AND created_at>?').bind(admin.id, now() - 600).first();
  if (Number(recentChallenges?.count || 0) >= authRequestLimit(env)) {
    await env.DB.batch([audit(env, admin.id, 'admin_code_rate_limited', { email: normalized })]);
    await enforceAuthResponseFloor(env, startedAt);
    return { ok: true };
  }

  const code = String((Number.parseInt((await hash(`${normalized}:${Date.now()}:${token(8)}`)).slice(0, 8), 16) % 900000) + 100000);
  const notificationId = crypto.randomUUID();
  const payload = { code, subject: 'Your Emmiwood Barbers sign-in code' };
  const provider = notificationProvider(env, 'email');
  await env.DB.batch([
    env.DB.prepare('UPDATE emmiwood_login_challenges SET consumed_at=? WHERE admin_id=? AND consumed_at IS NULL').bind(now(), admin.id),
    env.DB.prepare('INSERT INTO emmiwood_login_challenges(id,admin_id,code_hash,expires_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(), admin.id, await hash(code), now() + 600),
    notificationStatement(env, {
      id: notificationId,
      shopId: SHOP_ID,
      channel: 'email',
      template: 'admin_login_code',
      recipient: normalized,
      payload,
    }),
    audit(env, admin.id, 'admin_code_requested', { email: normalized }),
  ]);

  const deliveryTask = deliverAdminCode(env, admin, normalized, notificationId, payload, provider);
  if (defer) defer(deliveryTask);
  else await deliveryTask;
  await enforceAuthResponseFloor(env, startedAt);
  return { ok: true, ...(env.ENVIRONMENT !== 'production' ? { previewCode: code } : {}) };
}

export async function verifyCode(env, email, code) {
  const normalized = normalizeEmail(email);
  const row = await env.DB.prepare('SELECT c.*,a.email,a.role FROM emmiwood_login_challenges c JOIN emmiwood_admins a ON a.id=c.admin_id WHERE a.email=? COLLATE NOCASE AND c.consumed_at IS NULL AND c.locked_at IS NULL AND c.expires_at>? ORDER BY c.created_at DESC LIMIT 1').bind(normalized, now()).first();
  if (!row) throw new EmmiwoodError('invalid_code', 'That code is invalid or expired.', 401);
  if (await hash(String(code || '')) !== row.code_hash) {
    const failedAttempts = Number(row.failed_attempts || 0) + 1;
    await env.DB.batch([
      env.DB.prepare('UPDATE emmiwood_login_challenges SET failed_attempts=?,locked_at=CASE WHEN ?>=5 THEN ? ELSE locked_at END WHERE id=?').bind(failedAttempts, failedAttempts, now(), row.id),
      audit(env, row.admin_id, 'admin_code_rejected', { failedAttempts }),
    ]);
    throw new EmmiwoodError('invalid_code', 'That code is invalid or expired.', 401);
  }
  const raw = token();
  await env.DB.batch([
    env.DB.prepare('UPDATE emmiwood_login_challenges SET consumed_at=? WHERE id=?').bind(now(), row.id),
    env.DB.prepare('INSERT INTO emmiwood_sessions(id,admin_id,token_hash,expires_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(), row.admin_id, await hash(raw), now() + 28800),
    audit(env, row.admin_id, 'admin_signed_in'),
  ]);
  return { token: raw, admin: { id: row.admin_id, email: row.email, role: row.role } };
}

export async function requireAdmin(env, request, roles = ['owner', 'manager', 'staff', 'kup_support']) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) requireSameOrigin(request, env);
  const match = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i);
  const rawToken = match?.[1] || cookieValue(request, ADMIN_SESSION_COOKIE);
  if (!rawToken) throw new EmmiwoodError('unauthorized', 'Sign in to continue.', 401);
  const row = await env.DB.prepare('SELECT a.*,s.id session_id FROM emmiwood_sessions s JOIN emmiwood_admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND a.active=1').bind(await hash(rawToken), now()).first();
  if (!row) throw new EmmiwoodError('unauthorized', 'Sign in to continue.', 401);
  if (!roles.includes(row.role)) throw new EmmiwoodError('forbidden', 'You do not have permission for this action.', 403);
  return row;
}

export async function logout(env, request) {
  const admin = await requireAdmin(env, request);
  await env.DB.batch([
    env.DB.prepare('UPDATE emmiwood_sessions SET revoked_at=? WHERE id=?').bind(now(), admin.session_id),
    audit(env, admin.id, 'admin_signed_out'),
  ]);
  return { ok: true };
}

export async function dashboard(env) {
  const [shop, appointments, customers, barbers, services, availability, blocks, eligibility, outbox, events] = await Promise.all([
    env.DB.prepare('SELECT * FROM emmiwood_shops WHERE id=?').bind(SHOP_ID).first(),
    env.DB.prepare("SELECT a.*,c.name customer_name,c.phone,c.email,b.name barber_name,s.name service_name FROM emmiwood_appointments a JOIN emmiwood_customers c ON c.id=a.customer_id JOIN emmiwood_barbers b ON b.id=a.barber_id JOIN emmiwood_services s ON s.id=a.service_id WHERE a.start_at>? ORDER BY a.start_at LIMIT 100").bind(now() - 86400).all(),
    env.DB.prepare(`SELECT c.id,c.name,c.phone,c.email,c.sms_consent,
      COUNT(a.id) appointment_count,MAX(a.start_at) last_appointment_at
      FROM emmiwood_customers c LEFT JOIN emmiwood_appointments a ON a.customer_id=c.id
      WHERE c.shop_id=? GROUP BY c.id,c.name,c.phone,c.email,c.sms_consent
      ORDER BY last_appointment_at DESC LIMIT 200`).bind(SHOP_ID).all(),
    env.DB.prepare('SELECT * FROM emmiwood_barbers WHERE shop_id=? ORDER BY sort_order').bind(SHOP_ID).all(),
    env.DB.prepare('SELECT * FROM emmiwood_services WHERE shop_id=? ORDER BY sort_order').bind(SHOP_ID).all(),
    env.DB.prepare("SELECT a.* FROM emmiwood_availability a JOIN emmiwood_barbers b ON b.id=a.barber_id WHERE b.shop_id=? ORDER BY a.weekday,a.start_minute").bind(SHOP_ID).all(),
    env.DB.prepare('SELECT * FROM emmiwood_exceptions WHERE shop_id=? ORDER BY date DESC LIMIT 100').bind(SHOP_ID).all(),
    env.DB.prepare("SELECT barber_id || '--' || service_id AS id, barber_id, service_id FROM emmiwood_barber_services ORDER BY barber_id,service_id").all(),
    env.DB.prepare('SELECT * FROM emmiwood_notification_outbox WHERE shop_id=? ORDER BY created_at DESC LIMIT 100').bind(SHOP_ID).all(),
    env.DB.prepare('SELECT * FROM emmiwood_events WHERE shop_id=? ORDER BY created_at DESC LIMIT 100').bind(SHOP_ID).all(),
  ]);
  return { shop, appointments: rows(appointments), customers: rows(customers), barbers: rows(barbers), services: rows(services), availability: rows(availability), blocks: rows(blocks), eligibility: rows(eligibility), outbox: rows(outbox), events: rows(events) };
}

function resourceConfig(name) {
  const config = RESOURCE[name];
  if (!config) throw new EmmiwoodError('resource_not_found', 'Unknown admin resource.', 404);
  return config;
}

function validateResource(name, input, creating) {
  const config = resourceConfig(name);
  if (creating) for (const field of config.required) if (input[field] === undefined || input[field] === '') throw new EmmiwoodError('invalid_input', `${field} is required.`, 422);
  if (name === 'blocks' && input.date !== undefined) validateDate(input.date);
  if (name === 'services') {
    for (const field of ['duration_minutes', 'buffer_minutes']) if (input[field] !== undefined && (Number(input[field]) < 0 || Number(input[field]) % 5)) throw new EmmiwoodError('invalid_input', `${field} must use five-minute increments.`, 422);
  }
  if (name === 'availability' && input.weekday !== undefined && (Number(input.weekday) < 0 || Number(input.weekday) > 6)) throw new EmmiwoodError('invalid_input', 'weekday must be between 0 and 6.', 422);
  return config;
}

export async function listResource(env, name) {
  const { table } = resourceConfig(name);
  if (name === 'eligibility') {
    return rows(await env.DB.prepare("SELECT barber_id || '--' || service_id AS id, barber_id, service_id FROM emmiwood_barber_services ORDER BY barber_id,service_id").all());
  }
  const scope = name === 'availability' ? "barber_id IN (SELECT id FROM emmiwood_barbers WHERE shop_id=?)" : 'shop_id=?';
  return rows(await env.DB.prepare(`SELECT * FROM ${table} WHERE ${scope} ORDER BY rowid`).bind(SHOP_ID).all());
}

export async function createResource(env, name, input, admin) {
  const config = validateResource(name, input, true);
  if (name === 'eligibility') {
    const id = `${input.barber_id}--${input.service_id}`;
    await env.DB.batch([
      env.DB.prepare('INSERT INTO emmiwood_barber_services(barber_id,service_id) VALUES(?,?)').bind(input.barber_id, input.service_id),
      audit(env, admin.id, 'eligibility_created', { id, barberId: input.barber_id, serviceId: input.service_id }),
    ]);
    return { id, barber_id: input.barber_id, service_id: input.service_id };
  }
  const id = input.id || crypto.randomUUID();
  const fields = config.fields.filter((field) => input[field] !== undefined);
  const columns = ['id', ...(name === 'availability' ? [] : ['shop_id']), ...fields];
  const values = [id, ...(name === 'availability' ? [] : [SHOP_ID]), ...fields.map((field) => input[field])];
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ${config.table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`).bind(...values),
    audit(env, admin.id, `${name}_created`, { id }),
  ]);
  return env.DB.prepare(`SELECT * FROM ${config.table} WHERE id=?`).bind(id).first();
}

export async function updateResource(env, name, id, input, admin) {
  const config = validateResource(name, input, false);
  if (name === 'eligibility') {
    const [oldBarberId, oldServiceId] = String(id).split('--');
    const barberId = input.barber_id || oldBarberId;
    const serviceId = input.service_id || oldServiceId;
    if (!oldBarberId || !oldServiceId || !barberId || !serviceId) throw new EmmiwoodError('invalid_input', 'Choose a barber and service.', 422);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM emmiwood_barber_services WHERE barber_id=? AND service_id=?').bind(oldBarberId, oldServiceId),
      env.DB.prepare('INSERT INTO emmiwood_barber_services(barber_id,service_id) VALUES(?,?)').bind(barberId, serviceId),
      audit(env, admin.id, 'eligibility_updated', { from: id, to: `${barberId}--${serviceId}` }),
    ]);
    return { id: `${barberId}--${serviceId}`, barber_id: barberId, service_id: serviceId };
  }
  const fields = config.fields.filter((field) => input[field] !== undefined);
  if (!fields.length) throw new EmmiwoodError('invalid_input', 'Provide at least one field to update.', 422);
  const result = await env.DB.batch([
    env.DB.prepare(`UPDATE ${config.table} SET ${fields.map((field) => `${field}=?`).join(',')} WHERE id=?`).bind(...fields.map((field) => input[field]), id),
    audit(env, admin.id, `${name}_updated`, { id, fields }),
  ]);
  if (!result?.[0]?.meta?.changes) throw new EmmiwoodError('not_found', 'Resource not found.', 404);
  return env.DB.prepare(`SELECT * FROM ${config.table} WHERE id=?`).bind(id).first();
}

export async function deleteResource(env, name, id, admin) {
  const { table } = resourceConfig(name);
  if (name === 'eligibility') {
    const [barberId, serviceId] = String(id).split('--');
    if (!barberId || !serviceId) throw new EmmiwoodError('invalid_input', 'Eligibility reference is invalid.', 422);
    const result = await env.DB.batch([
      env.DB.prepare('DELETE FROM emmiwood_barber_services WHERE barber_id=? AND service_id=?').bind(barberId, serviceId),
      audit(env, admin.id, 'eligibility_deleted', { id }),
    ]);
    if (!result?.[0]?.meta?.changes) throw new EmmiwoodError('not_found', 'Resource not found.', 404);
    return { ok: true };
  }
  const result = await env.DB.batch([
    env.DB.prepare(`DELETE FROM ${table} WHERE id=?`).bind(id),
    audit(env, admin.id, `${name}_deleted`, { id }),
  ]);
  if (!result?.[0]?.meta?.changes) throw new EmmiwoodError('not_found', 'Resource not found.', 404);
  return { ok: true };
}

export { EDIT_ROLES };


async function appointmentById(env, id) {
  const row = await env.DB.prepare(`SELECT a.*,c.name customer_name,c.phone,c.email,c.sms_consent,
    s.duration_minutes,s.buffer_minutes,s.name service_name,b.name barber_name
    FROM emmiwood_appointments a
    JOIN emmiwood_customers c ON c.id=a.customer_id
    JOIN emmiwood_services s ON s.id=a.service_id
    JOIN emmiwood_barbers b ON b.id=a.barber_id
    WHERE a.id=? AND a.shop_id=?`).bind(id, SHOP_ID).first();
  if (!row) throw new EmmiwoodError('appointment_not_found', 'Appointment not found.', 404);
  return row;
}

export async function createAdminAppointment(env, input, admin) {
  const result = await book(env, input, admin.id);
  return result;
}

export async function cancelAdminAppointment(env, id, admin) {
  const appointment = await appointmentById(env, id);
  if (appointment.status !== 'booked') throw new EmmiwoodError('not_changeable', 'This appointment is no longer active.', 409);
  const timestamp = now();
  await cancelBooking(env.DB, {
    appointmentId: appointment.id,
    startAt: appointment.start_at,
    now: timestamp,
    isAdmin: true,
    extraStatements: [
      audit(env, admin.id, 'appointment_cancelled', { start: appointment.start_at }, appointment.id),
      ...appointmentSmsStatements(env, {
        shopId: SHOP_ID,
        appointmentId: appointment.id,
        recipient: appointment.phone,
        smsConsent: Boolean(appointment.sms_consent),
        event: 'cancelled',
        startAt: appointment.start_at,
        serviceName: appointment.service_name,
        barberName: appointment.barber_name,
        now: timestamp,
      }),
    ],
  });
  return { ok: true };
}

export async function rescheduleAdminAppointment(env, id, input, admin) {
  const appointment = await appointmentById(env, id);
  if (appointment.status !== 'booked') throw new EmmiwoodError('not_changeable', 'This appointment is no longer active.', 409);
  const serviceId = input.serviceId || appointment.service_id;
  const barberId = input.barberId || appointment.barber_id;
  const available = await slots(env, {
    serviceId,
    date: input.date,
    barberId,
    now: Number(input.now || now()),
    excludeAppointmentId: appointment.id,
  });
  const chosen = available.find((slot) => slot.start === Number(input.start));
  if (!chosen) throw new EmmiwoodError('slot_taken', 'That time is unavailable. The original appointment is unchanged.', 409);
  const service = await env.DB.prepare('SELECT * FROM emmiwood_services WHERE id=? AND shop_id=? AND active=1').bind(serviceId, SHOP_ID).first();
  if (!service) throw new EmmiwoodError('service_not_found', 'Service is unavailable.', 404);
  const endAt = chosen.start + service.duration_minutes * 60;
  const claimEndAt = endAt + service.buffer_minutes * 60;
  const timestamp = now();
  await rescheduleBooking(env.DB, {
    appointmentId: appointment.id,
    barberId: chosen.barberId,
    serviceId,
    service,
    startAt: chosen.start,
    endAt,
    claimEndAt,
    now: timestamp,
    isAdmin: true,
    extraStatements: [
      audit(env, admin.id, 'appointment_rescheduled', { from: appointment.start_at, to: chosen.start }, appointment.id),
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
        now: timestamp,
      }),
    ],
  });
  return appointmentById(env, id);
}
