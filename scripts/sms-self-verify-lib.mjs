/**
 * Preview SMS self-verify helpers (Wave C+ suite).
 * Exact-ID processor + chat.db handset proof. No POST retries.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '..');

export const DEFAULT_TEST_PHONE = '+15078485517';
export const DEFAULT_FROM_FALLBACK = '+16052503489';
export const PREVIEW_ORIGIN = 'https://emmiwood-barbers-preview.pages.dev';
/** Guest booking APIs for the preview suite — preview Pages host after cutover (not www/production). */
export const WWW_ORIGIN = process.env.EMMIWOOD_SUITE_BOOKING_ORIGIN || PREVIEW_ORIGIN;
export const NOTIFICATIONS_PATH = '/api/emmiwood/internal/notifications';
export const CONSENT_VERSION = 'kup-appointment-texts-v1';
export const D1_NAME = 'emmiwood-standalone-preview-db';
export const WRANGLER_PREVIEW = join(REPO_ROOT, 'wrangler.preview.toml');
export const CHAT_DB = join(homedir(), 'Library/Messages/chat.db');

export const SPEND_GO_PHRASE =
  'OK to send 5 intentional SMS to +15078485517; abort on any extra.';

export class SuiteError extends Error {
  constructor(message, detail = null) {
    super(message);
    this.name = 'SuiteError';
    this.detail = detail;
  }
}

export function keychainSecret(service, account) {
  const r = spawnSync(
    'security',
    ['find-generic-password', '-s', service, '-a', account, '-w'],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    throw new SuiteError(`Keychain miss: ${service} / ${account}`, r.stderr);
  }
  return String(r.stdout || '').trim();
}

export function notificationSecret() {
  return (
    process.env.EMMIWOOD_NOTIFICATION_SECRET ||
    keychainSecret('api_key:emmiwood-notification', 'EMMIWOOD_NOTIFICATION_SECRET')
  );
}

export function smsFromNumber(readiness = null) {
  return (
    process.env.EMMIWOOD_SMS_FROM ||
    process.env.TWILIO_FROM_NUMBER ||
    readiness?.sms?.fromNumber ||
    DEFAULT_FROM_FALLBACK
  );
}

export async function httpJson(url, { method = 'GET', headers = {}, body, timeoutMs = 45_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { _raw: text };
    }
    return { status: res.status, ok: res.ok, json, headers: res.headers };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new SuiteError(`HTTP timeout ${method} ${url} (${timeoutMs}ms) — do not retry`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function getReadiness(secret) {
  const { status, json } = await httpJson(`${PREVIEW_ORIGIN}${NOTIFICATIONS_PATH}`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  if (status !== 200 || !json?.ok) {
    throw new SuiteError('Readiness failed', { status, json });
  }
  if (json.data?.sms?.provider !== 'twilio' || json.data?.exactIdOnly !== true) {
    throw new SuiteError('Readiness unexpected shape', json.data);
  }
  return json.data;
}

/** Control: POST without ?id= must 422. One call only. */
export async function assertExactIdGate(secret) {
  const { status, json } = await httpJson(`${PREVIEW_ORIGIN}${NOTIFICATIONS_PATH}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: '{}',
  });
  if (status !== 422 || json?.data?.exactIdOnly !== true) {
    throw new SuiteError('Exact-ID gate failed (expected 422 exactIdOnly)', { status, json });
  }
  return { status, json };
}

/**
 * One-shot exact-ID processor. Never retry.
 * @returns {{ id: string, status: string, providerMessageId: string|null, attempt: number }}
 */
export async function processExactIdOnce(secret, outboxId) {
  const { status, json } = await httpJson(
    `${PREVIEW_ORIGIN}${NOTIFICATIONS_PATH}?id=${encodeURIComponent(outboxId)}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: '{}',
      timeoutMs: 45_000,
    },
  );
  if (status !== 200 || !json?.ok) {
    throw new SuiteError('Exact-ID POST failed', { status, json });
  }
  const processed = Number(json.data?.processed ?? -1);
  const results = json.data?.results || [];
  if (processed !== 1 || results.length !== 1) {
    throw new SuiteError(`Expected processed===1, got ${processed}`, json.data);
  }
  const row = results[0];
  if (row.status !== 'sent') {
    throw new SuiteError(`Expected status sent, got ${row.status}`, row);
  }
  if (!row.providerMessageId || !/^SM/.test(String(row.providerMessageId))) {
    throw new SuiteError('Missing Twilio SM… sid', row);
  }
  return row;
}

export function d1Json(command) {
  const out = execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      D1_NAME,
      '--remote',
      '--config',
      WRANGLER_PREVIEW,
      '--json',
      '--command',
      command,
    ],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
  const parsed = JSON.parse(out);
  const batches = Array.isArray(parsed) ? parsed : [parsed];
  return batches.map((b) => b.results || []);
}

export function outboxForAppointment(appointmentId) {
  const [rows] = d1Json(
    `SELECT id,template,status,recipient,provider,provider_message_id,appointment_id,available_at,error,payload_json,created_at
     FROM emmiwood_notification_outbox
     WHERE appointment_id='${escapeSql(appointmentId)}'
     ORDER BY created_at;`,
  );
  return rows;
}

export function outboxById(id) {
  const [rows] = d1Json(
    `SELECT id,template,status,recipient,provider,provider_message_id,appointment_id,available_at,error,payload_json,created_at
     FROM emmiwood_notification_outbox WHERE id='${escapeSql(id)}' LIMIT 1;`,
  );
  return rows[0] || null;
}

export function quarantineOutbox(id, reason) {
  d1Json(
    `UPDATE emmiwood_notification_outbox
     SET status='cancelled', error='${escapeSql(reason)}'
     WHERE id='${escapeSql(id)}' AND status='queued';`,
  );
}

export function quarantineQueuedForAppointments(appointmentIds, reason) {
  if (!appointmentIds.length) return 0;
  const list = appointmentIds.map((id) => `'${escapeSql(id)}'`).join(',');
  d1Json(
    `UPDATE emmiwood_notification_outbox
     SET status='cancelled', error='${escapeSql(reason)}'
     WHERE appointment_id IN (${list}) AND status='queued';`,
  );
  return queuedCountForAppointments(appointmentIds);
}

export function forceReminderAvailable(outboxId) {
  d1Json(
    `UPDATE emmiwood_notification_outbox
     SET available_at=unixepoch()
     WHERE id='${escapeSql(outboxId)}' AND template='appointment_reminder' AND status='queued';`,
  );
}

export function assertQueuedOnly(rows, template) {
  const queued = rows.filter((r) => r.status === 'queued');
  if (queued.length !== 1 || queued[0].template !== template) {
    throw new SuiteError(`Expected exactly 1 queued ${template}`, queued);
  }
  return queued[0];
}

export function adminByPhone(phone) {
  const [rows] = d1Json(
    `SELECT id,phone,role,active FROM emmiwood_admins
     WHERE phone='${escapeSql(phone)}' AND active=1 LIMIT 1;`,
  );
  return rows[0] || null;
}

export function latestAdminOtpOutbox(phone) {
  const [rows] = d1Json(
    `SELECT id,template,status,recipient,provider_message_id,payload_json,created_at,error
     FROM emmiwood_notification_outbox
     WHERE template='admin_login_code' AND recipient='${escapeSql(phone)}'
     ORDER BY created_at DESC LIMIT 3;`,
  );
  return rows;
}

function escapeSql(value) {
  return String(value).replaceAll("'", "''");
}

export async function catalog() {
  const { status, json } = await httpJson(`${WWW_ORIGIN}/api/emmiwood/catalog`);
  if (status !== 200 || !json?.ok) throw new SuiteError('Catalog failed', { status, json });
  return json.data;
}

export async function slots({ serviceId, date, barberId = 'first' }) {
  const url = `${WWW_ORIGIN}/api/emmiwood/slots?serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}&barberId=${encodeURIComponent(barberId)}`;
  const { status, json } = await httpJson(url);
  if (status !== 200 || !json?.ok) throw new SuiteError('Slots failed', { status, json });
  return json.data || [];
}

export function shopDateOffset(days = 0, timeZone = 'America/Chicago') {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const base = new Date(Date.now() + days * 86400_000);
  return fmt.format(base);
}

export function pickSlotWithinHours(slotList, { minHours = 0.25, maxHours = 20 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const min = now + Math.floor(minHours * 3600);
  const max = now + Math.floor(maxHours * 3600);
  return slotList.find((s) => Number(s.start) >= min && Number(s.start) < max) || null;
}

export function pickSlotAtLeastHoursAhead(slotList, minHours = 25) {
  const now = Math.floor(Date.now() / 1000);
  const min = now + Math.floor(minHours * 3600);
  return slotList.find((s) => Number(s.start) >= min) || null;
}

export async function bookAppointment({
  serviceId,
  date,
  start,
  barberId,
  name = 'SMS Suite',
  phone = DEFAULT_TEST_PHONE,
  smsConsent = true,
}) {
  const { status, json } = await httpJson(`${WWW_ORIGIN}/api/emmiwood/appointments`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: WWW_ORIGIN,
    },
    body: JSON.stringify({
      serviceId,
      date,
      start,
      barberId,
      name,
      phone,
      smsConsent,
      smsConsentVersion: smsConsent ? CONSENT_VERSION : undefined,
    }),
  });
  if (status !== 201 && status !== 200) {
    throw new SuiteError('Book failed', { status, json });
  }
  if (!json?.ok || !json.data?.id || !json.data?.manageToken) {
    throw new SuiteError('Book response incomplete', json);
  }
  return json.data;
}

async function manageCookieJar(manageToken) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${WWW_ORIGIN}/api/emmiwood/appointments/manage-session`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: WWW_ORIGIN,
      },
      body: JSON.stringify({ token: manageToken }),
      signal: controller.signal,
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      throw new SuiteError('manage-session failed', { status: res.status, json });
    }
    const setCookie = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    if (setCookie.length) {
      return setCookie.map((c) => c.split(';')[0]).join('; ');
    }
    const raw = res.headers.get('set-cookie');
    if (!raw) throw new SuiteError('manage-session missing Set-Cookie');
    // Single cookie header (may include commas inside Expires — take first pair name=value)
    const first = raw.split(/,(?=\s*[^;=]+=)/)[0] || raw;
    return first.split(';')[0].trim();
  } finally {
    clearTimeout(timer);
  }
}

export async function cancelViaManage(manageToken) {
  const cookie = await manageCookieJar(manageToken);
  const { status, json } = await httpJson(`${WWW_ORIGIN}/api/emmiwood/appointments/cancel`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: WWW_ORIGIN,
      cookie,
    },
    body: '{}',
  });
  if (status !== 200 || !json?.ok) {
    throw new SuiteError('Cancel failed', { status, json });
  }
  return json.data;
}

export async function rescheduleViaManage(manageToken, { serviceId, date, start, barberId }) {
  const cookie = await manageCookieJar(manageToken);
  const { status, json } = await httpJson(`${WWW_ORIGIN}/api/emmiwood/appointments/reschedule`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: WWW_ORIGIN,
      cookie,
    },
    body: JSON.stringify({ serviceId, date, start, barberId }),
  });
  if (status !== 200 || !json?.ok) {
    throw new SuiteError('Reschedule failed', { status, json });
  }
  return json.data;
}

/** Admin OTP — one shot. API ok/previewCode are NOT proof of delivery. */
export async function requestAdminCodeOnce(phone) {
  const { status, json } = await httpJson(`${PREVIEW_ORIGIN}/api/emmiwood/admin/auth/request-code`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: PREVIEW_ORIGIN,
    },
    body: JSON.stringify({ phone }),
    timeoutMs: 45_000,
  });
  if (status !== 200) {
    throw new SuiteError('request-code HTTP failed', { status, json });
  }
  return json;
}

/**
 * Poll chat.db for inbound SMS after watermark (Apple epoch nanoseconds).
 * watermarkUnixSeconds: Date.now()/1000 taken before send.
 */
export function chatDbWatermarkAppleNs(unixSeconds = Math.floor(Date.now() / 1000)) {
  // Apple absolute time: seconds since 2001-01-01
  const appleSeconds = unixSeconds - 978_307_200;
  return Math.floor(appleSeconds * 1e9);
}

export function findInboundSms({
  fromNumber,
  afterAppleNs,
  fingerprint,
  uniqueToken,
  limit = 20,
}) {
  if (!existsSync(CHAT_DB)) {
    throw new SuiteError(`chat.db missing at ${CHAT_DB}`);
  }
  const sql = `
    SELECT m.ROWID AS rowid,
           m.text AS text,
           m.date AS date,
           h.id AS handle,
           m.is_from_me AS is_from_me,
           m.service AS service
    FROM message m
    LEFT JOIN handle h ON h.ROWID = m.handle_id
    WHERE m.is_from_me = 0
      AND m.date >= ${Number(afterAppleNs)}
      AND h.id = '${escapeSql(fromNumber)}'
      AND m.text LIKE '%${escapeSql(fingerprint)}%'
      ${uniqueToken ? `AND m.text LIKE '%${escapeSql(uniqueToken)}%'` : ''}
    ORDER BY m.date DESC
    LIMIT ${Number(limit)};
  `;
  const r = spawnSync('sqlite3', ['-json', CHAT_DB, sql], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new SuiteError('sqlite3 chat.db failed', r.stderr || r.stdout);
  }
  const raw = String(r.stdout || '').trim();
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function waitForChatDb({
  fromNumber,
  afterUnixSeconds,
  fingerprint,
  uniqueToken,
  timeoutMs = 90_000,
  intervalMs = 2_000,
}) {
  const afterAppleNs = chatDbWatermarkAppleNs(afterUnixSeconds);
  const deadline = Date.now() + timeoutMs;
  let last = [];
  while (Date.now() < deadline) {
    last = findInboundSms({ fromNumber, afterAppleNs, fingerprint, uniqueToken });
    if (last.length) return last[0];
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new SuiteError('chat.db poll timeout — handset SMS not observed', {
    fromNumber,
    fingerprint,
    uniqueToken,
    afterUnixSeconds,
  });
}

export function assertD1Sent(outboxId) {
  const row = outboxById(outboxId);
  if (!row || row.status !== 'sent' || !/^SM/.test(String(row.provider_message_id || ''))) {
    throw new SuiteError('D1 sent assertion failed', row);
  }
  return row;
}

export function queuedCountForAppointments(appointmentIds) {
  if (!appointmentIds.length) return 0;
  const list = appointmentIds.map((id) => `'${escapeSql(id)}'`).join(',');
  const [rows] = d1Json(
    `SELECT COUNT(*) AS n FROM emmiwood_notification_outbox
     WHERE appointment_id IN (${list}) AND status='queued';`,
  );
  return Number(rows[0]?.n || 0);
}

export async function observePreviewSha() {
  try {
    const { status, json } = await httpJson(
      'https://api.cloudflare.com/client/v4/user/tokens/verify',
      { timeoutMs: 5_000 },
    );
    void status;
    void json;
  } catch {
    /* optional */
  }
  // Best-effort: Pages deployment via wrangler if available
  try {
    const out = execFileSync(
      'npx',
      ['wrangler', 'pages', 'deployment', 'list', '--project-name', 'emmiwood-barbers-preview'],
      { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
    );
    const line = out.split('\n').find((l) => /Production|production|Active/i.test(l) || /[a-f0-9]{7,40}/.test(l));
    return { rawSnippet: (line || out.slice(0, 200)).trim(), source: 'wrangler-pages-deployment-list' };
  } catch (error) {
    return { rawSnippet: null, source: 'unavailable', error: String(error?.message || error) };
  }
}

export function writeReceipt(receipt, dir = join(REPO_ROOT, 'scripts/.sms-receipts')) {
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '').replace(/\..+/, '');
  const path = join(dir, `preview-sms-suite-${stamp}.json`);
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`);
  return path;
}

export function requireSpendGo(argv = process.argv) {
  const idx = argv.indexOf('--spend-go');
  if (idx === -1) {
    throw new SuiteError(
      `Missing --spend-go. Pass exactly:\n  --spend-go "${SPEND_GO_PHRASE}"`,
    );
  }
  const value = argv[idx + 1];
  if (value !== SPEND_GO_PHRASE) {
    throw new SuiteError('Spend GO phrase mismatch', {
      expected: SPEND_GO_PHRASE,
      got: value,
    });
  }
}
