import { runtimeReadiness } from './emmiwood-runtime.js';

export const NOTIFICATION_PROVIDER_MOCK = 'mock';
export const NOTIFICATION_PROVIDER_TWILIO = 'twilio';
export const NOTIFICATION_PROVIDER_RESEND = 'resend';
export const NOTIFICATION_PROVIDER_UNCONFIGURED = 'unconfigured';
export const REMINDER_LEAD_SECONDS = 24 * 60 * 60;
// Barber T-15m reminder lead (workflow cron every 5m → accept ±5m delivery jitter).
export const BARBER_REMINDER_LEAD_SECONDS = 15 * 60;
export const KUP_APPOINTMENT_SMS_CONSENT_VERSION = 'kup-appointment-texts-v1';
export const KUP_SMS_BRAND = 'KUP Solutions';
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
      },
      email: {
        ready: true,
        provider: emailProvider,
        missing: [],
        deferred: true,
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
    sms: { ready: smsMissing.length === 0, provider: smsProvider, missing: smsMissing },
    email: {
      ready: emailMissing.length === 0,
      provider: emailProvider,
      missing: emailMissing,
      deferred: true,
    },
    configuration,
  };
}

/** Public site origin for absolute manage links in SMS (no trailing slash). */
export function publicOrigin(env) {
  const raw = env?.EMMIWOOD_PUBLIC_ORIGIN || env?.CORS_ORIGIN || '';
  return String(raw).trim().replace(/\/$/, '');
}

/** Absolute manage URL for a raw manage token; null if origin or token missing. */
export function manageAppointmentUrl(env, manageToken) {
  const origin = publicOrigin(env);
  const token = String(manageToken || '').trim();
  if (!origin || !token) return null;
  return `${origin}/emmiwood/manage#token=${encodeURIComponent(token)}`;
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

export function reminderAvailableAt(startAt, now = Math.floor(Date.now() / 1000)) {
  const start = Number(startAt);
  const current = Number(now);
  if (!Number.isFinite(start) || !Number.isFinite(current) || start - current < REMINDER_LEAD_SECONDS) return null;
  return start - REMINDER_LEAD_SECONDS;
}

export function barberReminderAvailableAt(startAt, now = Math.floor(Date.now() / 1000)) {
  const start = Number(startAt);
  const current = Number(now);
  if (!Number.isFinite(start) || !Number.isFinite(current) || start - current < BARBER_REMINDER_LEAD_SECONDS) return null;
  return start - BARBER_REMINDER_LEAD_SECONDS;
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
  shopName = 'Emmiwood Barbers',
  manageToken = null,
  now = Math.floor(Date.now() / 1000),
}) {
  if (!smsConsent) return [];

  const statements = [];
  if (event === 'cancelled' || event === 'rescheduled') {
    const reason = event === 'cancelled'
      ? 'Unsent appointment update superseded by cancellation.'
      : 'Unsent appointment update superseded by reschedule.';
    // Guest-only supersede — never cancel barber_* rows (staff path owns those).
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
  const when = formatSmsWhen(startAt);
  const basePayload = {
    appointmentId,
    start: startAt,
    previousStart: previousStartAt,
    serviceName,
    barberName,
    shopName,
    when,
    manageUrl,
    optOut: 'Reply STOP to opt out.',
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
    ? reminderAvailableAt(startAt, now)
    : null;
  if (reminderAt != null) {
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
        when,
        manageUrl,
        optOut: 'Reply STOP to opt out.',
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
  const recipient = String(barberPhone || '').trim();
  if (!recipient) return [];

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
  const basePayload = {
    appointmentId,
    start: startAt,
    previousStart: previousStartAt,
    serviceName,
    barberName,
    shopName,
    when,
    customerName: customerName || '',
    customerPhone: customerPhone || '',
    optOut: 'Reply STOP to opt out. Reply HELP for help.',
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
    ? barberReminderAvailableAt(startAt, now)
    : null;
  if (reminderAt != null) {
    statements.push(notificationStatement(env, {
      shopId,
      appointmentId,
      channel: 'sms',
      template: 'barber_reminder_15m',
      recipient,
      availableAt: reminderAt,
      payload: {
        appointmentId,
        start: startAt,
        serviceName,
        barberName,
        shopName,
        when,
        customerName: customerName || '',
        customerPhone: customerPhone || '',
        optOut: 'Reply STOP to opt out. Reply HELP for help.',
      },
    }));
  }

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
  const payload = JSON.parse(row.payload_json || '{}');

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

export function renderSms(template, payload) {
  const optOut = payload.optOut ? ` ${payload.optOut}` : '';
  const shop = payload.shopName || 'Emmiwood Barbers';
  let detail = '';
  if (payload.serviceName && payload.barberName) detail = ` ${payload.serviceName} with ${payload.barberName}`;
  else if (payload.serviceName) detail = ` ${payload.serviceName}`;
  else if (payload.barberName) detail = ` with ${payload.barberName}`;
  if (payload.when) detail += detail ? ` · ${payload.when}` : ` ${payload.when}`;
  const manage = payload.manageUrl ? ` Manage/cancel: ${payload.manageUrl}` : '';
  const customerBits = [payload.customerName, payload.customerPhone].filter(Boolean).join(' ').trim();
  const customer = customerBits ? ` Customer ${customerBits}.` : '';
  let staffDetail = payload.serviceName ? ` ${payload.serviceName}` : '';
  if (payload.when) staffDetail += staffDetail ? ` · ${payload.when}` : ` ${payload.when}`;
  switch (template) {
    case 'admin_login_code': return `${KUP_SMS_BRAND}: your sign-in code is ${payload.code}. It expires in ten minutes.`;
    case 'booking_confirmation': return `${KUP_SMS_BRAND}: appointment confirmed at ${shop}.${detail}.${manage}${optOut}`;
    case 'appointment_reminder': return `${KUP_SMS_BRAND} reminder at ${shop}:${detail || ' tomorrow'}.${manage}${optOut}`;
    case 'cancellation_confirmation': return `${KUP_SMS_BRAND}: appointment cancelled at ${shop}.${detail}.${optOut}`;
    case 'reschedule_confirmation': return `${KUP_SMS_BRAND}: appointment rescheduled at ${shop}.${detail}.${manage}${optOut}`;
    case 'barber_booking_notice': return `${KUP_SMS_BRAND}: new booking at ${shop}.${staffDetail}.${customer}${optOut}`;
    case 'barber_cancellation_notice': return `${KUP_SMS_BRAND}: booking cancelled at ${shop}.${staffDetail}.${customer}${optOut}`;
    case 'barber_reschedule_notice': return `${KUP_SMS_BRAND}: booking rescheduled at ${shop}.${staffDetail}.${customer}${optOut}`;
    case 'barber_reminder_15m': return `${KUP_SMS_BRAND}: starting soon at ${shop}.${staffDetail}.${customer}${optOut}`;
    default: return `${KUP_SMS_BRAND} appointment update at ${shop}.${optOut}`;
  }
}

export function renderEmail(template, payload) {
  if (template === 'admin_login_code') return `Your Emmiwood Barbers sign-in code is ${payload.code}. It expires in ten minutes.`;
  return payload.text || 'Emmiwood Barbers account update.';
}

const PROCESSOR_MAX_ATTEMPTS = 3;

export function retryDelaySeconds(attempt) {
  return Math.min(3600, 60 * (2 ** Math.max(0, Number(attempt) - 1)));
}

/**
 * Deliver due queued outbox rows (optionally scoped to one appointment).
 * Used by the internal processor and by booking mutations for near-immediate SMS.
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
    const attempt = Number(row.attempt_count || 0) + 1;
    const resolvedProvider = row.provider === NOTIFICATION_PROVIDER_UNCONFIGURED
      ? notificationProvider(env, row.channel)
      : row.provider;
    try {
      const delivery = await deliverNotification(env, { ...row, provider: resolvedProvider });
      if (delivery.status === 'sent') {
        await env.DB.prepare(`UPDATE emmiwood_notification_outbox
          SET status='sent',provider=?,sent_at=unixepoch(),last_attempt_at=unixepoch(),attempt_count=?,provider_message_id=?,error=NULL
          WHERE id=?`).bind(resolvedProvider, attempt, delivery.providerMessageId || null, row.id).run();
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

  return { ok: true, ready: true, readiness, processed: results.length, results };
}

/** Best-effort immediate flush after book/cancel/reschedule (does not throw). */
export async function flushDueAppointmentNotifications(env, appointmentId) {
  if (!appointmentId) return { ok: false, processed: 0, results: [] };
  try {
    return await processQueuedNotifications(env, { appointmentId, limit: 20 });
  } catch {
    return { ok: false, processed: 0, results: [] };
  }
}
