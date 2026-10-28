import { runtimeReadiness } from './emmiwood-runtime.js';

export const NOTIFICATION_PROVIDER_MOCK = 'mock';
export const NOTIFICATION_PROVIDER_TWILIO = 'twilio';
export const NOTIFICATION_PROVIDER_RESEND = 'resend';
export const NOTIFICATION_PROVIDER_UNCONFIGURED = 'unconfigured';
export const REMINDER_LEAD_SECONDS = 24 * 60 * 60;
export const SAME_DAY_REMINDER_LEAD_SECONDS = 2 * 60 * 60;
export const SAME_DAY_SHORT_REMINDER_LEAD_SECONDS = 30 * 60;
// Barber T-15m reminder lead (workflow cron every 5m → accept ±5m delivery jitter).
export const BARBER_REMINDER_LEAD_SECONDS = 15 * 60;
export const KUP_APPOINTMENT_SMS_CONSENT_VERSION = 'kup-appointment-texts-v1';
export const GUEST_SMS_BRAND = 'Emmiwood';
// On reschedule, a guest reminder whose slot falls within this gap of the
// change event is suppressed: the "moved" message already carries the new
// time, and a paired reminder landing right behind it reads as a duplicate.
export const RESCHEDULE_REMINDER_MIN_GAP_SECONDS = 60 * 60;
export const GUEST_SMS_OPT_OUT = 'Reply STOP to opt out, HELP for help.';
export const STAFF_SMS_OPT_OUT = 'Reply STOP to opt out, HELP for help.';
export const DEFAULT_SHOP_ADDRESS = '1118 S Minnesota Ave, Sioux Falls';
export const BARBER_SMS_TEMPLATES = Object.freeze([
  'barber_booking_notice',
  'barber_cancellation_notice',
  'barber_reschedule_notice',
  'barber_reminder_15m',
]);

/** v1 production gate: processor + SMS only. Resend/email secrets are deferred. */
export const PRODUCTION_NOTIFICATION_SECRET_NAMES = Object.freeze([
  'EMMIWOOD_NOTIFICATION_SECRET',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_API_KEY_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
]);

/** Deferred until a later product version reintroduces email delivery. */
export const DEFERRED_EMAIL_SECRET_NAMES = Object.freeze([
  'RESEND_API_KEY',
  'EMAIL_FROM',
]);

const PROCESSOR_SECRET_NAMES = Object.freeze(['EMMIWOOD_NOTIFICATION_SECRET']);
const SMS_SECRET_NAMES = Object.freeze(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER']);
const PRODUCTION_SMS_SECRET_NAMES = Object.freeze(['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER']);
const EMAIL_SECRET_NAMES = DEFERRED_EMAIL_SECRET_NAMES;

export const PROCESSOR_MAX_ATTEMPTS = 3;
export const STALE_SENDING_SECONDS = 600;
export const REMINDER_STALE_AGE_SECONDS = 6 * 3600;
export const NOTICE_STALE_AGE_SECONDS = 24 * 3600;
export const STALE_APPOINTMENT_ERROR = 'Stale: appointment already started';
export const STALE_NOTICE_ERROR = 'Stale: notice older than 24h';
export const REAPED_SENDING_ERROR = 'Reaped stale sending claim';
export const REMINDER_TEMPLATES = Object.freeze(['appointment_reminder', 'barber_reminder_15m']);
export const NOTICE_TEMPLATES = Object.freeze([
  'booking_confirmation',
  'cancellation_confirmation',
  'reschedule_confirmation',
  'barber_booking_notice',
  'barber_cancellation_notice',
  'barber_reschedule_notice',
]);

const REMINDER_TEMPLATE_SET = new Set(REMINDER_TEMPLATES);
const NOTICE_TEMPLATE_SET = new Set(NOTICE_TEMPLATES);

export function parseTestAllowlist(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Production: on only when an allowlist is set. Preview and development: on by default. */
export function notificationTestMode(env, channel = 'sms') {
  const key = channel === 'email' ? 'EMAIL_TEST_ALLOWLIST' : 'SMS_TEST_ALLOWLIST';
  if (parseTestAllowlist(env?.[key]).length > 0) return true;
  const environment = String(env?.ENVIRONMENT || '');
  return environment === 'preview' || environment === 'development';
}

export function recipientAllowedForTestMode(env, channel, recipient) {
  if (!notificationTestMode(env, channel)) return true;
  const key = channel === 'email' ? 'EMAIL_TEST_ALLOWLIST' : 'SMS_TEST_ALLOWLIST';
  return parseTestAllowlist(env?.[key]).includes(String(recipient || '').trim());
}

function testModeFields(env, channel) {
  const key = channel === 'email' ? 'EMAIL_TEST_ALLOWLIST' : 'SMS_TEST_ALLOWLIST';
  return {
    testMode: notificationTestMode(env, channel),
    testAllowlistCount: parseTestAllowlist(env?.[key]).length,
  };
}

export function payloadStartAt(row) {
  try {
    const start = Number(JSON.parse(row?.payload_json || '{}').start);
    return Number.isFinite(start) ? start : null;
  } catch {
    return null;
  }
}

function effectiveAvailableAt(row, now) {
  const availableAt = Number(row?.available_at);
  if (Number.isFinite(availableAt) && availableAt > 0) return availableAt;
  const createdAt = Number(row?.created_at);
  if (Number.isFinite(createdAt) && createdAt > 0) return createdAt;
  return Number(now);
}

export function staleNotificationReason(row, now = Math.floor(Date.now() / 1000), appointmentStartAt = null) {
  const current = Number(now);
  const startAt = appointmentStartAt ?? payloadStartAt(row);
  const availableAt = effectiveAvailableAt(row, current);
  const template = String(row?.template || '');
  if (REMINDER_TEMPLATE_SET.has(template)) {
    if (startAt != null && startAt <= current) return STALE_APPOINTMENT_ERROR;
    if (template === 'appointment_reminder' && current - availableAt > REMINDER_STALE_AGE_SECONDS) {
      return STALE_APPOINTMENT_ERROR;
    }
  }
  if (NOTICE_TEMPLATE_SET.has(template) && current - availableAt > NOTICE_STALE_AGE_SECONDS) {
    return STALE_NOTICE_ERROR;
  }
  return null;
}

function missingNames(env, names) {
  return names.filter((name) => !env?.[name]);
}

function hasSmsSecrets(env) {
  const base = Boolean(env?.TWILIO_ACCOUNT_SID && env?.TWILIO_AUTH_TOKEN && env?.TWILIO_FROM_NUMBER);
  return base && (env?.ENVIRONMENT !== 'production' || Boolean(env?.TWILIO_API_KEY_SID));
}

function hasEmailSecrets(env) {
  return Boolean(env?.RESEND_API_KEY && env?.EMAIL_FROM);
}

/**
 * SMS: Twilio when all three credentials are present (preview smoke or production).
 * Without credentials: mock in non-production, unconfigured in production.
 * Email: Resend only when configured; never required for v1 SMS readiness.
 */
export function notificationProvider(env, channel = 'sms') {
  if (channel === 'sms') {
    if (hasSmsSecrets(env)) return NOTIFICATION_PROVIDER_TWILIO;
    if (env?.ENVIRONMENT !== 'production') return NOTIFICATION_PROVIDER_MOCK;
    return NOTIFICATION_PROVIDER_UNCONFIGURED;
  }
  if (channel === 'email') {
    if (hasEmailSecrets(env)) return NOTIFICATION_PROVIDER_RESEND;
    if (env?.ENVIRONMENT !== 'production') return NOTIFICATION_PROVIDER_MOCK;
    return NOTIFICATION_PROVIDER_UNCONFIGURED;
  }
  return NOTIFICATION_PROVIDER_UNCONFIGURED;
}

export function notificationReadiness(env) {
  const production = env?.ENVIRONMENT === 'production';
  const processorMissing = missingNames(env, PROCESSOR_SECRET_NAMES);
  const smsMissing = missingNames(env, production ? PRODUCTION_SMS_SECRET_NAMES : SMS_SECRET_NAMES);
  const emailMissing = missingNames(env, EMAIL_SECRET_NAMES);
  const smsProvider = notificationProvider(env, 'sms');
  const emailProvider = notificationProvider(env, 'email');
  const configuration = runtimeReadiness(env);

  if (!production) {
    // Preview may run exact-ID Twilio smoke once secrets are bound; without secrets, mock is ready.
    const liveSms = smsProvider === NOTIFICATION_PROVIDER_TWILIO;
    return {
      ready: liveSms ? processorMissing.length === 0 && smsMissing.length === 0 : true,
      environment: String(env?.ENVIRONMENT || 'development'),
      exactIdOnly: true,
      processor: { ready: liveSms ? processorMissing.length === 0 : true, missing: liveSms ? processorMissing : [] },
      sms: {
        ready: liveSms ? smsMissing.length === 0 : true,
        provider: smsProvider,
        missing: liveSms ? smsMissing : [],
        ...testModeFields(env, 'sms'),
      },
      email: {
        ready: true,
        provider: emailProvider,
        missing: [],
        deferred: true,
        ...testModeFields(env, 'email'),
      },
      configuration,
    };
  }

  return {
    // SMS-only v1: email secrets must not block customer SMS or admin SMS OTP.
    ready: processorMissing.length === 0 && smsMissing.length === 0 && configuration.ready,
    environment: 'production',
    exactIdOnly: false,
    processor: { ready: processorMissing.length === 0, missing: processorMissing },
    sms: {
      ready: smsMissing.length === 0,
      provider: smsProvider,
      missing: smsMissing,
      ...testModeFields(env, 'sms'),
    },
    email: {
      ready: emailMissing.length === 0,
      provider: emailProvider,
      missing: emailMissing,
      deferred: true,
      ...testModeFields(env, 'email'),
    },
    configuration,
  };
}

/** Public site origin for absolute manage links in SMS (no trailing slash). */
export function publicOrigin(env) {
  const raw = env?.EMMIWOOD_PUBLIC_ORIGIN || env?.CORS_ORIGIN || '';
  return String(raw).trim().replace(/\/$/, '');
}

/** Origin without a trailing /emmiwood segment. EMMIWOOD_PUBLIC_ORIGIN may
 * be configured with the shop path already attached; customer links are
 * built from the site root (the manage link is /appt), so any attached
 * shop segment comes off first. */
export function siteOrigin(env) {
  return publicOrigin(env).replace(/\/emmiwood$/, '');
}

/** Absolute manage URL for a raw manage token; null if origin or token missing. */
export function manageAppointmentUrl(env, manageToken) {
  const origin = siteOrigin(env);
  const token = String(manageToken || '').trim();
  if (!origin || !token) return null;
  return `${origin}/appt#token=${encodeURIComponent(token)}`;
}

/** Absolute admin deep link to one appointment; null if origin or id missing.
 *  The admin page requires staff sign-in, then opens that booking. */
export function adminAppointmentUrl(env, appointmentId) {
  const origin = siteOrigin(env);
  const id = String(appointmentId || '').trim();
  if (!origin || !id) return null;
  return `${origin}/emmiwood/admin?appointment=${encodeURIComponent(id)}`;
}

/** Short America/Chicago time for SMS bodies. */
export function formatSmsWhen(startAt, timeZone = 'America/Chicago') {
  const start = Number(startAt);
  if (!Number.isFinite(start)) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(start * 1000));
  } catch {
    return '';
  }
}

/** Chicago calendar-day label for SMS bodies, e.g. "Tue, Oct 27". */
export function formatSmsDay(startAt, timeZone = 'America/Chicago') {
  const start = Number(startAt);
  if (!Number.isFinite(start)) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone, weekday: 'short', month: 'short', day: 'numeric',
    }).format(new Date(start * 1000));
  } catch {
    return '';
  }
}

/** Chicago wall-clock time for SMS bodies, e.g. "4:00 PM". */
export function formatSmsTime(startAt, timeZone = 'America/Chicago') {
  const start = Number(startAt);
  if (!Number.isFinite(start)) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone, hour: 'numeric', minute: '2-digit',
    }).format(new Date(start * 1000));
  } catch {
    return '';
  }
}

/** "4:00 PM-5:45 PM" (en dash) when an end is known; the start alone otherwise. */
export function formatSmsTimeRange(startAt, endAt, timeZone = 'America/Chicago') {
  const start = formatSmsTime(startAt, timeZone);
  if (!start) return '';
  const end = formatSmsTime(endAt, timeZone);
  return end && Number(endAt) > Number(startAt) ? `${start}\u2013${end}` : start;
}

function chicagoDayKey(epochSeconds, timeZone = 'America/Chicago') {
  const value = Number(epochSeconds);
  if (!Number.isFinite(value)) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(value * 1000));
  } catch {
    return '';
  }
}

/** 'today' / 'tomorrow' when the start falls on that Chicago day, else null. */
export function smsRelativeDay(startAt, now = Math.floor(Date.now() / 1000)) {
  const startKey = chicagoDayKey(startAt);
  if (!startKey) return null;
  if (startKey === chicagoDayKey(now)) return 'today';
  if (startKey === chicagoDayKey(Number(now) + 24 * 60 * 60)) return 'tomorrow';
  return null;
}

export function reminderAvailableAt(startAt, now = Math.floor(Date.now() / 1000)) {
  const start = Number(startAt);
  const current = Number(now);
  if (!Number.isFinite(start) || !Number.isFinite(current) || start - current < REMINDER_LEAD_SECONDS) return null;
  return start - REMINDER_LEAD_SECONDS;
}

/** One guest reminder: T-24h when the visit is a day+ out; otherwise T-2h or T-30m. Never two. */
export function guestReminderAvailableAt(startAt, now = Math.floor(Date.now() / 1000)) {
  const start = Number(startAt);
  const current = Number(now);
  if (!Number.isFinite(start) || !Number.isFinite(current)) return null;
  const lead = start - current;
  if (lead >= REMINDER_LEAD_SECONDS) return start - REMINDER_LEAD_SECONDS;
  if (lead >= SAME_DAY_REMINDER_LEAD_SECONDS) return start - SAME_DAY_REMINDER_LEAD_SECONDS;
  if (lead >= SAME_DAY_SHORT_REMINDER_LEAD_SECONDS) return start - SAME_DAY_SHORT_REMINDER_LEAD_SECONDS;
  return null;
}

export function phoneLast4(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 4) return '';
  return `...${digits.slice(-4)}`;
}

export function customerFirstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

function smsLines(...lines) {
  return lines.filter((line) => line != null && String(line).trim() !== '').join('\n');
}

export function barberReminderAvailableAt(startAt, now = Math.floor(Date.now() / 1000)) {
  const start = Number(startAt);
  const current = Number(now);
  if (!Number.isFinite(start) || !Number.isFinite(current) || start - current < BARBER_REMINDER_LEAD_SECONDS) return null;
  return start - BARBER_REMINDER_LEAD_SECONDS;
}

/** Shop-admin copies of book/cancel/reschedule. Missing or any value other than `true` stays off. */
export function shopAdminSmsFanoutEnabled(env) {
  return String(env?.EMMIWOOD_SHOP_ADMIN_SMS_FANOUT || '').trim() === 'true';
}

export async function shopAdminNoticePhones(env, shopId, assignedPhone = '') {
  if (!shopAdminSmsFanoutEnabled(env) || !env?.DB) return [];
  const assigned = String(assignedPhone || '').trim();
  const result = await env.DB.prepare(
    `SELECT phone FROM emmiwood_admins
     WHERE shop_id=? AND role='manager' AND active=1
       AND phone IS NOT NULL AND TRIM(phone)!=''`,
  ).bind(shopId).all();
  const seen = new Set(assigned ? [assigned] : []);
  const phones = [];
  for (const row of result?.results || []) {
    const phone = String(row.phone || '').trim();
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    phones.push(phone);
  }
  return phones;
}

export async function staffSmsStatements(env, args) {
  const extraNoticePhones = await shopAdminNoticePhones(env, args.shopId, args.barberPhone);
  return barberSmsStatements(env, { ...args, extraNoticePhones });
}

export function notificationStatement(env, {
  id = crypto.randomUUID(),
  shopId,
  appointmentId = null,
  channel,
  template,
  recipient,
  payload,
  availableAt = null,
}) {
  const provider = notificationProvider(env, channel);
  return env.DB.prepare(`INSERT INTO emmiwood_notification_outbox
    (id,shop_id,appointment_id,channel,template,recipient,payload_json,provider,status,available_at)
    VALUES(?,?,?,?,?,?,?,?, 'queued',COALESCE(?,unixepoch()))`)
    .bind(id, shopId, appointmentId, channel, template, recipient, JSON.stringify(payload), provider, availableAt);
}

export function appointmentSmsStatements(env, {
  shopId,
  appointmentId,
  recipient,
  smsConsent,
  smsConsentVersion,
  event,
  startAt,
  previousStartAt = null,
  serviceName,
  barberName,
  customerName = null,
  endAt = null,
  shopName = 'Emmiwood Barbers',
  shopAddress = DEFAULT_SHOP_ADDRESS,
  manageToken = null,
  now = Math.floor(Date.now() / 1000),
}) {
  if (!smsConsent) return [];

  const statements = [];
  if (event === 'cancelled' || event === 'rescheduled') {
    const reason = event === 'cancelled'
      ? 'Unsent appointment update superseded by cancellation.'
      : 'Unsent appointment update superseded by reschedule.';
    // Guest-only supersede: never cancel barber_* rows (staff path owns those).
    statements.push(env.DB.prepare(`UPDATE emmiwood_notification_outbox
      SET status='cancelled',error=?
      WHERE appointment_id=? AND channel='sms' AND status='queued' AND template NOT LIKE 'barber_%'`)
      .bind(reason, appointmentId));
  }

  if (smsConsentVersion !== KUP_APPOINTMENT_SMS_CONSENT_VERSION) return statements;

  const templateByEvent = {
    booked: 'booking_confirmation',
    cancelled: 'cancellation_confirmation',
    rescheduled: 'reschedule_confirmation',
  };
  const template = templateByEvent[event];
  if (!template) throw new Error(`Unsupported appointment notification event: ${event}`);

  const manageUrl = manageAppointmentUrl(env, manageToken);
  const bookUrl = `${siteOrigin(env)}/emmiwood/book`;
  const when = formatSmsWhen(startAt);
  const basePayload = {
    appointmentId,
    start: startAt,
    previousStart: previousStartAt,
    serviceName,
    barberName,
    shopName,
    shopAddress,
    when,
    customerName,
    endAt,
    manageUrl,
    bookUrl,
    optOut: GUEST_SMS_OPT_OUT,
  };

  statements.push(notificationStatement(env, {
    shopId,
    appointmentId,
    channel: 'sms',
    template,
    recipient,
    payload: basePayload,
  }));

  const reminderAt = (event === 'booked' || event === 'rescheduled')
    ? guestReminderAvailableAt(startAt, now)
    : null;
  // Reschedule pair suppression: a reminder slot inside the gap means the
  // reminder would land right behind the "moved" text saying the same
  // thing, so only the moved message is sent for the change event. A
  // reminder slot genuinely later than the gap is enqueued as usual.
  const reminderSuppressed = event === 'rescheduled'
    && reminderAt != null
    && reminderAt <= now + RESCHEDULE_REMINDER_MIN_GAP_SECONDS;
  if (reminderAt != null && !reminderSuppressed) {
    statements.push(notificationStatement(env, {
      shopId,
      appointmentId,
      channel: 'sms',
      template: 'appointment_reminder',
      recipient,
      availableAt: reminderAt,
      payload: {
        appointmentId,
        start: startAt,
        serviceName,
        barberName,
        shopName,
        shopAddress,
        when,
        manageUrl,
        bookUrl,
        optOut: GUEST_SMS_OPT_OUT,
      },
    }));
  }

  return statements;
}

/**
 * Operational SMS to the assigned barber when `barberPhone` is a non-empty E.164.
 * Independent of guest SMS consent. Statement order on cancel/reschedule:
 * supersede barber_* → enqueue notice (+ T−15m reminder when booked/rescheduled).
 */
export function barberSmsStatements(env, {
  shopId,
  appointmentId,
  barberPhone,
  extraNoticePhones = [],
  event,
  startAt,
  previousStartAt = null,
  serviceName,
  barberName,
  customerName,
  customerPhone,
  shopName = 'Emmiwood Barbers',
  now = Math.floor(Date.now() / 1000),
}) {
  const assigned = String(barberPhone || '').trim();
  const extras = [];
  const seen = new Set(assigned ? [assigned] : []);
  for (const value of extraNoticePhones || []) {
    const phone = String(value || '').trim();
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    extras.push(phone);
  }
  if (!assigned && extras.length === 0) return [];

  const statements = [];
  if (event === 'cancelled' || event === 'rescheduled') {
    const reason = event === 'cancelled'
      ? 'Unsent barber notice superseded by cancellation.'
      : 'Unsent barber notice superseded by reschedule.';
    statements.push(env.DB.prepare(`UPDATE emmiwood_notification_outbox
      SET status='cancelled',error=?
      WHERE appointment_id=? AND channel='sms' AND status='queued' AND template LIKE 'barber_%'`)
      .bind(reason, appointmentId));
  }

  const templateByEvent = {
    booked: 'barber_booking_notice',
    cancelled: 'barber_cancellation_notice',
    rescheduled: 'barber_reschedule_notice',
  };
  const template = templateByEvent[event];
  if (!template) throw new Error(`Unsupported barber notification event: ${event}`);

  const when = formatSmsWhen(startAt);
  const adminUrl = adminAppointmentUrl(env, appointmentId);
  const basePayload = {
    appointmentId,
    start: startAt,
    previousStart: previousStartAt,
    serviceName,
    barberName,
    shopName,
    when,
    customerName: customerFirstName(customerName),
    customerPhoneLast4: phoneLast4(customerPhone),
    adminUrl,
    optOut: STAFF_SMS_OPT_OUT,
  };

  const notice = (recipient) => notificationStatement(env, {
    shopId,
    appointmentId,
    channel: 'sms',
    template,
    recipient,
    payload: basePayload,
  });

  if (assigned) {
    statements.push(notice(assigned));
    const reminderAt = (event === 'booked' || event === 'rescheduled')
      ? barberReminderAvailableAt(startAt, now)
      : null;
    if (reminderAt != null) {
      statements.push(notificationStatement(env, {
        shopId,
        appointmentId,
        channel: 'sms',
        template: 'barber_reminder_15m',
        recipient: assigned,
        availableAt: reminderAt,
        payload: {
          appointmentId,
          start: startAt,
          serviceName,
          barberName,
          shopName,
          when,
          customerName: customerFirstName(customerName),
          customerPhoneLast4: phoneLast4(customerPhone),
          adminUrl,
          optOut: STAFF_SMS_OPT_OUT,
        },
      }));
    }
  }
  for (const phone of extras) statements.push(notice(phone));

  return statements;
}

async function fetchWithTimeout(env, label, url, init) {
  const configured = Number(env?.EMMIWOOD_NOTIFICATION_TIMEOUT_MS || 8_000);
  const timeoutMs = Number.isFinite(configured) && configured > 0 ? Math.min(configured, 30_000) : 8_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`${label} delivery timed out.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function deliverNotification(env, row) {
  if (row.provider === NOTIFICATION_PROVIDER_MOCK) return { provider: NOTIFICATION_PROVIDER_MOCK, status: 'queued' };
  if (row.provider === NOTIFICATION_PROVIDER_UNCONFIGURED) throw new Error('Notification delivery is not configured.');
  if (!recipientAllowedForTestMode(env, row.channel, row.recipient)) {
    return { provider: row.provider, status: 'skipped_test_mode' };
  }
  const payload = JSON.parse(row.payload_json || '{}');
  if (row.template === 'admin_login_code' && !payload.code) {
    throw new Error('Staff sign-in code is not stored for retry.');
  }

  if (row.provider === NOTIFICATION_PROVIDER_TWILIO) {
    if (row.channel !== 'sms') throw new Error(`Unsupported Twilio channel: ${row.channel}`);
    const body = payload.body || renderSms(row.template, payload);
    // URL Account SID is always AC…. Basic auth may use API Key SID (SK…) + secret, or classic Account SID + Auth Token.
    const accountSid = env.TWILIO_ACCOUNT_SID;
    const authUser = env.TWILIO_API_KEY_SID || accountSid;
    const credentials = btoa(`${authUser}:${env.TWILIO_AUTH_TOKEN}`);
    const response = await fetchWithTimeout(env, 'SMS', `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: { authorization: `Basic ${credentials}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: row.recipient, From: env.TWILIO_FROM_NUMBER, Body: body }),
    });
    if (!response.ok) throw new Error(`Twilio delivery failed (${response.status}).`);
    const providerResponse = await response.json();
    return { provider: NOTIFICATION_PROVIDER_TWILIO, status: 'sent', providerMessageId: providerResponse.sid || null, response: providerResponse };
  }

  if (row.provider === NOTIFICATION_PROVIDER_RESEND) {
    if (row.channel !== 'email') throw new Error(`Unsupported Resend channel: ${row.channel}`);
    const response = await fetchWithTimeout(env, 'Email', 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [row.recipient],
        subject: payload.subject || 'Your Emmiwood Barbers sign-in code',
        text: payload.text || renderEmail(row.template, payload),
      }),
    });
    if (!response.ok) throw new Error(`Email delivery failed (${response.status}).`);
    const providerResponse = await response.json();
    return { provider: NOTIFICATION_PROVIDER_RESEND, status: 'sent', providerMessageId: providerResponse.id || null, response: providerResponse };
  }

  throw new Error(`Unsupported notification provider: ${row.provider}`);
}

export function renderSms(template, payload = {}) {
  const optOut = payload.optOut || GUEST_SMS_OPT_OUT;
  const when = payload.when || '';
  const service = payload.serviceName || '';
  const barber = payload.barberName || '';
  const serviceWithBarber = service && barber ? `${service} with ${barber}` : service || barber;
  const whenServiceBarber = [when, serviceWithBarber].filter(Boolean).join(' · ');
  const staffWhenService = [when, service].filter(Boolean).join(' · ');
  const manage = payload.manageUrl ? `Manage: ${payload.manageUrl}` : '';
  const changeOrCancel = payload.manageUrl ? `Change or cancel: ${payload.manageUrl}` : '';
  const guestFooter = smsLines(changeOrCancel, optOut);
  // Guest bodies separate information blocks with a blank line so each
  // piece is easy to digest; link + compliance stay together as the footer.
  const guestBlocks = (...blocks) => blocks
    .filter((block) => block != null && String(block).trim() !== '')
    .join('\n\n');
  const view = payload.adminUrl ? `View: ${payload.adminUrl}` : '';
  const bookAgain = payload.bookUrl ? `Book again: ${payload.bookUrl}` : '';
  const last4 = payload.customerPhoneLast4 || phoneLast4(payload.customerPhone);
  const guestName = customerFirstName(payload.customerName);
  const customerLine = [guestName, last4].filter(Boolean).join(' · ');

  switch (template) {
    case 'admin_login_code':
      return smsLines(
        `${GUEST_SMS_BRAND}: Staff code ${payload.code || ''}`.trim(),
        'Expires in 10 minutes.',
      );
    case 'booking_confirmation': {
      const first = customerFirstName(payload.customerName);
      const dayTime = payload.start != null
        ? [formatSmsDay(payload.start), formatSmsTimeRange(payload.start, payload.endAt)].filter(Boolean).join(' \u00b7 ')
        : when;
      const headline = first
        ? `${GUEST_SMS_BRAND}: You're booked, ${first}.`
        : `${GUEST_SMS_BRAND}: You're booked.`;
      return guestBlocks(
        headline,
        serviceWithBarber,
        dayTime,
        payload.shopAddress || DEFAULT_SHOP_ADDRESS,
        guestFooter,
      );
    }
    case 'appointment_reminder': {
      const relative = payload.start != null ? smsRelativeDay(payload.start, payload.now) : null;
      const startTime = payload.start != null ? formatSmsTime(payload.start) : '';
      const legacyHeadline = !(relative && startTime);
      const headline = legacyHeadline
        ? `${GUEST_SMS_BRAND}: See you at Emmiwood.`
        : `${GUEST_SMS_BRAND}: See you ${relative} at ${startTime}.`;
      return guestBlocks(
        headline,
        legacyHeadline ? whenServiceBarber : serviceWithBarber,
        payload.shopAddress || DEFAULT_SHOP_ADDRESS,
        guestFooter,
      );
    }
    case 'cancellation_confirmation':
      return smsLines(
        `${GUEST_SMS_BRAND}: Your Emmiwood visit is cancelled.`,
        whenServiceBarber,
        bookAgain,
        optOut,
      );
    case 'reschedule_confirmation': {
      let dayTime = when;
      if (payload.start != null) {
        const day = formatSmsDay(payload.start);
        const range = formatSmsTimeRange(payload.start, payload.endAt);
        const oldTime = payload.previousStart != null ? formatSmsTime(payload.previousStart) : '';
        dayTime = [day, oldTime && range ? `${oldTime} \u2192 ${range}` : range].filter(Boolean).join(' \u00b7 ');
      }
      return guestBlocks(
        `${GUEST_SMS_BRAND}: Your appointment moved.`,
        serviceWithBarber,
        dayTime,
        payload.shopAddress || DEFAULT_SHOP_ADDRESS,
        guestFooter,
      );
    }
    case 'barber_booking_notice':
      return smsLines(
        `${GUEST_SMS_BRAND}: New booking.`,
        staffWhenService,
        customerLine,
        view,
        payload.optOut || STAFF_SMS_OPT_OUT,
      );
    case 'barber_cancellation_notice':
      return smsLines(
        `${GUEST_SMS_BRAND}: Booking cancelled.`,
        staffWhenService,
        customerLine,
        view,
        payload.optOut || STAFF_SMS_OPT_OUT,
      );
    case 'barber_reschedule_notice':
      return smsLines(
        `${GUEST_SMS_BRAND}: Booking moved.`,
        staffWhenService,
        customerLine,
        view,
        payload.optOut || STAFF_SMS_OPT_OUT,
      );
    case 'barber_reminder_15m':
      return smsLines(
        `${GUEST_SMS_BRAND}: In 15 min.`,
        staffWhenService,
        customerLine,
        view,
        payload.optOut || STAFF_SMS_OPT_OUT,
      );
    default:
      return smsLines(`${GUEST_SMS_BRAND}: Appointment update.`, optOut);
  }
}

export function sanitizeOutboxRow(row) {
  let payload = {};
  try {
    payload = JSON.parse(row.payload_json || '{}');
  } catch {
    payload = {};
  }
  const otp = row.template === 'admin_login_code';
  const { code: _code, customerPhone: _phone, ...rest } = payload;
  const safePayload = otp
    ? { redacted: true }
    : { ...rest, customerPhoneLast4: rest.customerPhoneLast4 || phoneLast4(_phone) };
  return {
    ...row,
    payload_json: JSON.stringify(safePayload),
    bodyPreview: otp ? 'Staff sign-in code (hidden)' : renderSms(row.template, { ...payload, code: undefined }),
  };
}

export function renderEmail(template, payload) {
  if (template === 'admin_login_code') return `Your Emmiwood Barbers sign-in code is ${payload.code}. It expires in ten minutes.`;
  return payload.text || 'Emmiwood Barbers account update.';
}

export function retryDelaySeconds(attempt) {
  return Math.min(3600, 60 * (2 ** Math.max(0, Number(attempt) - 1)));
}

async function reapStaleSendingClaims(env) {
  await env.DB.prepare(`UPDATE emmiwood_notification_outbox
    SET status=CASE WHEN attempt_count+1>=? THEN 'failed' ELSE 'queued' END,
        attempt_count=attempt_count+1,
        last_attempt_at=unixepoch(),
        error=?
    WHERE status='sending' AND last_attempt_at<unixepoch()-?`)
    .bind(PROCESSOR_MAX_ATTEMPTS, REAPED_SENDING_ERROR, STALE_SENDING_SECONDS)
    .run();
}

async function claimQueuedNotification(env, id) {
  return env.DB.prepare(`UPDATE emmiwood_notification_outbox
    SET status='sending', last_attempt_at=unixepoch(), attempt_count=attempt_count+1
    WHERE id=? AND status='queued'
    RETURNING attempt_count`)
    .bind(id)
    .first();
}

async function appointmentStartForRow(env, row) {
  let startAt = payloadStartAt(row);
  if (!row.appointment_id || !env?.DB) return startAt;
  const appointment = await env.DB.prepare('SELECT start_at FROM emmiwood_appointments WHERE id=?')
    .bind(row.appointment_id)
    .first();
  if (appointment && Number.isFinite(Number(appointment.start_at))) return Number(appointment.start_at);
  return startAt;
}

/**
 * Deliver due queued outbox rows (optionally scoped to one appointment).
 * Used by the internal processor and by booking mutations for near-immediate SMS.
 * Claim status='sending' before delivery so booking-time flush and the cron cannot double-send.
 */
export async function processQueuedNotifications(env, {
  notificationId = null,
  appointmentId = null,
  limit = 50,
} = {}) {
  const readiness = notificationReadiness(env);
  if (!readiness.ready) {
    return { ok: false, ready: false, readiness, processed: 0, results: [] };
  }

  await reapStaleSendingClaims(env);

  let pending;
  if (notificationId) {
    pending = await env.DB.prepare(`SELECT * FROM emmiwood_notification_outbox
      WHERE id=? AND status='queued' AND available_at<=unixepoch() AND attempt_count<? LIMIT 1`)
      .bind(notificationId, PROCESSOR_MAX_ATTEMPTS).all();
  } else if (appointmentId) {
    pending = await env.DB.prepare(`SELECT * FROM emmiwood_notification_outbox
      WHERE appointment_id=? AND status='queued' AND available_at<=unixepoch() AND attempt_count<?
      ORDER BY available_at,created_at LIMIT ?`)
      .bind(appointmentId, PROCESSOR_MAX_ATTEMPTS, limit).all();
  } else {
    pending = await env.DB.prepare(`SELECT * FROM emmiwood_notification_outbox
      WHERE status='queued' AND available_at<=unixepoch() AND attempt_count<?
      ORDER BY available_at,created_at LIMIT ?`).bind(PROCESSOR_MAX_ATTEMPTS, limit).all();
  }

  const results = [];
  for (const row of pending.results || []) {
    if (!recipientAllowedForTestMode(env, row.channel, row.recipient)) {
      results.push({
        id: row.id,
        status: 'skipped_test_mode',
        attempt: Number(row.attempt_count || 0),
      });
      continue;
    }
    const claimed = await claimQueuedNotification(env, row.id);
    if (!claimed) continue;
    const attempt = Number(claimed.attempt_count);
    const startAt = await appointmentStartForRow(env, row);
    const stale = staleNotificationReason(row, Math.floor(Date.now() / 1000), startAt);
    if (stale) {
      await env.DB.prepare(`UPDATE emmiwood_notification_outbox
        SET status='expired',last_attempt_at=unixepoch(),error=?
        WHERE id=?`).bind(stale, row.id).run();
      results.push({ id: row.id, status: 'expired', attempt, error: stale });
      continue;
    }

    const resolvedProvider = row.provider === NOTIFICATION_PROVIDER_UNCONFIGURED
      ? notificationProvider(env, row.channel)
      : row.provider;
    try {
      const delivery = await deliverNotification(env, { ...row, provider: resolvedProvider });
      if (delivery.status === 'sent') {
        await env.DB.prepare(`UPDATE emmiwood_notification_outbox
          SET status='sent',provider=?,sent_at=unixepoch(),last_attempt_at=unixepoch(),attempt_count=?,provider_message_id=?,error=NULL
          WHERE id=?`).bind(resolvedProvider, attempt, delivery.providerMessageId || null, row.id).run();
      } else if (delivery.status === 'skipped_test_mode' || delivery.status === 'suppressed_test_mode') {
        await env.DB.prepare(`UPDATE emmiwood_notification_outbox
          SET status='queued',last_attempt_at=NULL,attempt_count=?
          WHERE id=?`).bind(Math.max(0, attempt - 1), row.id).run();
      } else if (delivery.status === 'queued') {
        await env.DB.prepare(`UPDATE emmiwood_notification_outbox
          SET status='queued',last_attempt_at=unixepoch(),attempt_count=?
          WHERE id=?`).bind(Math.max(0, attempt - 1), row.id).run();
      }
      results.push({
        id: row.id,
        status: delivery.status,
        provider: delivery.provider,
        providerMessageId: delivery.providerMessageId || null,
        attempt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const terminal = attempt >= PROCESSOR_MAX_ATTEMPTS;
      const delay = retryDelaySeconds(attempt);
      await env.DB.prepare(`UPDATE emmiwood_notification_outbox
        SET status=?,provider=?,attempt_count=?,last_attempt_at=unixepoch(),available_at=CASE WHEN ? THEN available_at ELSE unixepoch()+? END,error=?
        WHERE id=?`).bind(terminal ? 'failed' : 'queued', resolvedProvider, attempt, terminal ? 1 : 0, delay, message.slice(0, 500), row.id).run();
      results.push({
        id: row.id,
        status: terminal ? 'failed' : 'retrying',
        attempt,
        retryInSeconds: terminal ? null : delay,
        error: message,
      });
    }
  }

  return {
    ok: true,
    ready: true,
    readiness,
    processed: results.filter((result) => result.status !== 'skipped_test_mode').length,
    results,
  };
}

/** Best-effort immediate flush after book/cancel/reschedule (does not throw).
 * Preview stays exact-ID-only: mutations queue rows; the suite/processor sends with ?id=.
 */
export async function flushDueAppointmentNotifications(env, appointmentId) {
  if (!appointmentId) return { ok: false, processed: 0, results: [] };
  try {
    const readiness = notificationReadiness(env);
    if (readiness.exactIdOnly) {
      return { ok: true, skipped: 'exact_id_only', processed: 0, results: [] };
    }
    return await processQueuedNotifications(env, { appointmentId, limit: 20 });
  } catch {
    return { ok: false, processed: 0, results: [] };
  }
}
