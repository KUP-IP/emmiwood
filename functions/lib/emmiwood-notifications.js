export const NOTIFICATION_PROVIDER_MOCK = 'mock';
export const NOTIFICATION_PROVIDER_TWILIO = 'twilio';
export const NOTIFICATION_PROVIDER_RESEND = 'resend';
export const NOTIFICATION_PROVIDER_UNCONFIGURED = 'unconfigured';
export const REMINDER_LEAD_SECONDS = 24 * 60 * 60;

/** v1 production gate: processor + SMS only. Resend/email secrets are deferred. */
export const PRODUCTION_NOTIFICATION_SECRET_NAMES = Object.freeze([
  'EMMIWOOD_NOTIFICATION_SECRET',
  'TWILIO_ACCOUNT_SID',
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
const EMAIL_SECRET_NAMES = DEFERRED_EMAIL_SECRET_NAMES;

function missingNames(env, names) {
  return names.filter((name) => !env?.[name]);
}

export function notificationProvider(env, channel = 'sms') {
  if (env?.ENVIRONMENT !== 'production') return NOTIFICATION_PROVIDER_MOCK;
  if (channel === 'sms' && env?.TWILIO_ACCOUNT_SID && env?.TWILIO_AUTH_TOKEN && env?.TWILIO_FROM_NUMBER) return NOTIFICATION_PROVIDER_TWILIO;
  if (channel === 'email' && env?.RESEND_API_KEY && env?.EMAIL_FROM) return NOTIFICATION_PROVIDER_RESEND;
  return NOTIFICATION_PROVIDER_UNCONFIGURED;
}

export function notificationReadiness(env) {
  const production = env?.ENVIRONMENT === 'production';
  if (!production) {
    return {
      ready: true,
      environment: String(env?.ENVIRONMENT || 'development'),
      processor: { ready: true, missing: [] },
      sms: { ready: true, provider: NOTIFICATION_PROVIDER_MOCK, missing: [] },
      email: { ready: true, provider: NOTIFICATION_PROVIDER_MOCK, missing: [] },
    };
  }

  const processorMissing = missingNames(env, PROCESSOR_SECRET_NAMES);
  const smsMissing = missingNames(env, SMS_SECRET_NAMES);
  const emailMissing = missingNames(env, EMAIL_SECRET_NAMES);
  return {
    // SMS-only v1: email secrets must not block customer SMS or admin SMS OTP.
    ready: processorMissing.length === 0 && smsMissing.length === 0,
    environment: 'production',
    processor: { ready: processorMissing.length === 0, missing: processorMissing },
    sms: { ready: smsMissing.length === 0, provider: notificationProvider(env, 'sms'), missing: smsMissing },
    email: {
      ready: emailMissing.length === 0,
      provider: notificationProvider(env, 'email'),
      missing: emailMissing,
      deferred: true,
    },
  };
}

export function reminderAvailableAt(startAt, now = Math.floor(Date.now() / 1000)) {
  const start = Number(startAt);
  const current = Number(now);
  if (!Number.isFinite(start) || !Number.isFinite(current) || start - current < REMINDER_LEAD_SECONDS) return null;
  return start - REMINDER_LEAD_SECONDS;
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
  event,
  startAt,
  previousStartAt = null,
  serviceName,
  barberName,
  now = Math.floor(Date.now() / 1000),
}) {
  if (!smsConsent) return [];

  const statements = [];
  if (event === 'cancelled' || event === 'rescheduled') {
    const reason = event === 'cancelled'
      ? 'Unsent appointment update superseded by cancellation.'
      : 'Unsent appointment update superseded by reschedule.';
    statements.push(env.DB.prepare(`UPDATE emmiwood_notification_outbox
      SET status='cancelled',error=?
      WHERE appointment_id=? AND channel='sms' AND status='queued'`)
      .bind(reason, appointmentId));
  }

  const templateByEvent = {
    booked: 'booking_confirmation',
    cancelled: 'cancellation_confirmation',
    rescheduled: 'reschedule_confirmation',
  };
  const template = templateByEvent[event];
  if (!template) throw new Error(`Unsupported appointment notification event: ${event}`);

  statements.push(notificationStatement(env, {
    shopId,
    appointmentId,
    channel: 'sms',
    template,
    recipient,
    payload: {
      appointmentId,
      start: startAt,
      previousStart: previousStartAt,
      serviceName,
      barberName,
      optOut: 'Reply STOP to opt out.',
    },
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
        optOut: 'Reply STOP to opt out.',
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
    const credentials = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
    const response = await fetchWithTimeout(env, 'SMS', `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
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
  switch (template) {
    case 'admin_login_code': return `Emmiwood Barbers: your sign-in code is ${payload.code}. It expires in ten minutes.`;
    case 'booking_confirmation': return `Emmiwood Barbers: your appointment is confirmed.${optOut}`;
    case 'appointment_reminder': return `Emmiwood Barbers reminder: your appointment is tomorrow.${optOut}`;
    case 'cancellation_confirmation': return `Emmiwood Barbers: your appointment has been cancelled.${optOut}`;
    case 'reschedule_confirmation': return `Emmiwood Barbers: your appointment has been rescheduled.${optOut}`;
    default: return `Emmiwood Barbers appointment update.${optOut}`;
  }
}

export function renderEmail(template, payload) {
  if (template === 'admin_login_code') return `Your Emmiwood Barbers sign-in code is ${payload.code}. It expires in ten minutes.`;
  return payload.text || 'Emmiwood Barbers account update.';
}
