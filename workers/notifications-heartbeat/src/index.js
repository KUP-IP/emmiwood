// Emmiwood notification heartbeat. Cloudflare Worker replacement for the
// GitHub Actions schedule in .github/workflows/notifications.yml.
//
// Every 5 minutes (Cron Trigger) it:
//   1. Probes production notification readiness (GET, Bearer-authenticated).
//   2. When PROCESS_QUEUE is "true", processes the queued notification
//      outbox (POST to the same endpoint).
//
// Semantics deliberately mirror the Actions workflow it replaces:
//   - probe: up to 2 retries, 30s timeout, fails unless HTTP 200 with
//     ok=true, data.ready=true and data.environment="production".
//   - process: single attempt, 120s timeout, fails if any result comes
//     back "retrying" or "failed" (the Actions step went red the same way).
// A thrown error marks the cron invocation failed so the failure stays
// visible in the Cloudflare dashboard, like a red heartbeat run.
//
// The scheduled handler awaits the work (it does not fire-and-forget via
// waitUntil) so probe failures, Cloudflare challenges, and exception text
// stay on the invocation. Phase A after PRs #73/#74 showed 100% errors
// with no body detail; this file logs HTTP status, error name, a 200-char
// body preview, and cf_challenge=true when the origin returns HTML 403/503.

const PROBE_TIMEOUT_MS = 30_000;
const PROCESS_TIMEOUT_MS = 120_000;
const PROBE_ATTEMPTS = 3; // 1 try + 2 retries, mirroring curl --retry 2
export const WORKER_USER_AGENT = 'emmiwood-notifications-heartbeat/1';

export function isCloudflareChallenge(status, contentType, bodyText) {
  if (status !== 403 && status !== 503) return false;
  const haystack = `${contentType || ''}\n${bodyText || ''}`.toLowerCase();
  return haystack.includes('text/html')
    || haystack.includes('<html')
    || haystack.includes('just a moment')
    || haystack.includes('cf-challenge')
    || haystack.includes('cloudflare');
}

function expectTestMode(env) {
  return String(env?.EXPECT_TEST_MODE || '').trim() === 'true';
}

function countByStatus(results) {
  const counts = {
    processed: results.length,
    sent: 0,
    retrying: 0,
    failed: 0,
    expired: 0,
    suppressed: 0,
  };
  for (const result of results) {
    if (result.status === 'sent') counts.sent += 1;
    else if (result.status === 'retrying') counts.retrying += 1;
    else if (result.status === 'failed') counts.failed += 1;
    else if (result.status === 'expired') counts.expired += 1;
    else if (result.status === 'suppressed_test_mode' || result.status === 'skipped_test_mode') {
      counts.suppressed += 1;
    }
  }
  return counts;
}

function logJson(payload) {
  console.log(JSON.stringify(payload));
}

async function callEndpoint(env, { method, attempts }) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(env.EMMIWOOD_NOTIFICATION_URL, {
        method,
        headers: {
          Authorization: `Bearer ${env.EMMIWOOD_NOTIFICATION_SECRET}`,
          'User-Agent': WORKER_USER_AGENT,
        },
        signal: AbortSignal.timeout(
          method === 'POST' ? PROCESS_TIMEOUT_MS : PROBE_TIMEOUT_MS,
        ),
      });
      const raw = await response.text();
      const bodyPreview = raw.slice(0, 200);
      let body = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = null;
      }
      const contentType = response.headers?.get?.('content-type') || '';
      const cfChallenge = isCloudflareChallenge(response.status, contentType, raw);
      if (!body || cfChallenge) {
        logJson({
          event: 'endpoint_response',
          method,
          attempt,
          status: response.status,
          errorName: cfChallenge ? 'CloudflareChallenge' : (body ? null : 'NonJsonBody'),
          cf_challenge: cfChallenge,
          bodyPreview,
        });
      }
      return { status: response.status, body, bodyPreview, cfChallenge };
    } catch (error) {
      lastError = error;
      logJson({
        event: 'endpoint_error',
        method,
        attempt,
        status: null,
        errorName: error?.name || 'Error',
        errorMessage: String(error?.message || error).slice(0, 200),
        cf_challenge: false,
      });
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw lastError;
}

export async function probeReadiness(env) {
  let result;
  try {
    result = await callEndpoint(env, {
      method: 'GET',
      attempts: PROBE_ATTEMPTS,
    });
  } catch (error) {
    logJson({
      event: 'readiness_probe_failed',
      status: null,
      errorName: error?.name || 'Error',
      errorMessage: String(error?.message || error).slice(0, 200),
      cf_challenge: false,
    });
    throw error;
  }

  const { status, body, bodyPreview, cfChallenge } = result;
  const data = body?.data || {};
  const actualTestMode = data.sms?.testMode === true;
  const wantedTestMode = expectTestMode(env);
  logJson({
    event: 'readiness_probe',
    status,
    environment: data.environment || null,
    ready: data.ready === true,
    processorReady: data.processor?.ready ?? null,
    smsReady: data.sms?.ready ?? null,
    smsProvider: data.sms?.provider || null,
    smsTestMode: actualTestMode,
    testAllowlistCount: data.sms?.testAllowlistCount ?? null,
    emailReady: data.email?.ready ?? null,
    emailProvider: data.email?.provider || null,
    cf_challenge: cfChallenge === true,
  });

  if (
    cfChallenge
    || status !== 200
    || body?.ok !== true
    || data.ready !== true
    || data.environment !== 'production'
  ) {
    logJson({
      event: 'readiness_probe_failed',
      status,
      errorName: cfChallenge ? 'CloudflareChallenge' : (body ? 'ReadinessFailed' : 'NonJsonBody'),
      errorMessage: `HTTP ${status}, ready=${data.ready}, environment=${data.environment}`,
      cf_challenge: cfChallenge === true,
      bodyPreview: bodyPreview || '',
    });
    throw new Error(
      `Notification readiness probe failed: HTTP ${status}, `
      + `ready=${data.ready}, environment=${data.environment}`
      + (cfChallenge ? ', cf_challenge=true' : '')
      + (body ? '' : `, body=${(bodyPreview || '').slice(0, 200)}`),
    );
  }

  if (wantedTestMode !== actualTestMode) {
    logJson({
      event: 'readiness_probe_failed',
      status,
      errorName: 'TestModeMismatch',
      errorMessage: `EXPECT_TEST_MODE=${wantedTestMode}, sms.testMode=${actualTestMode}`,
      cf_challenge: false,
    });
    throw new Error(
      `Notification readiness test mode mismatch: EXPECT_TEST_MODE=${wantedTestMode}, `
      + `sms.testMode=${actualTestMode}`,
    );
  }
  return data;
}

export async function processQueue(env) {
  let result;
  try {
    result = await callEndpoint(env, {
      method: 'POST',
      attempts: 1,
    });
  } catch (error) {
    logJson({
      event: 'queue_processing_failed',
      status: null,
      errorName: error?.name || 'Error',
      errorMessage: String(error?.message || error).slice(0, 200),
      cf_challenge: false,
    });
    throw error;
  }

  const { status, body, bodyPreview, cfChallenge } = result;
  if (cfChallenge || status !== 200 || body?.ok !== true) {
    logJson({
      event: 'queue_processing_failed',
      status,
      errorName: cfChallenge ? 'CloudflareChallenge' : (body ? 'ProcessFailed' : 'NonJsonBody'),
      errorMessage: `HTTP ${status}`,
      cf_challenge: cfChallenge === true,
      bodyPreview: bodyPreview || '',
    });
    throw new Error(
      `Queue processing failed: HTTP ${status}`
      + (cfChallenge ? ', cf_challenge=true' : '')
      + (body ? '' : `, body=${(bodyPreview || '').slice(0, 200)}`),
    );
  }
  const results = body.data?.results || [];
  for (const item of results) {
    logJson({
      event: 'notification_processed',
      id: item.id,
      status: item.status,
      provider: item.provider || null,
      attempt: item.attempt,
      providerMessageId: item.providerMessageId || null,
    });
  }
  const counts = countByStatus(results);
  logJson({
    event: 'queue_processed',
    processed: body.data?.processed ?? counts.processed,
    sent: counts.sent,
    retrying: counts.retrying,
    failed: counts.failed,
    expired: counts.expired,
    suppressed: counts.suppressed,
  });
  const bad = results.filter(
    (item) => item.status === 'retrying' || item.status === 'failed',
  );
  if (bad.length > 0) {
    throw new Error(
      `Queue processing reported ${bad.length} retrying/failed `
      + `notification(s): ${bad.map((item) => item.id).join(', ')}`,
    );
  }
  return body.data;
}

export async function runHeartbeat(env) {
  if (!env.EMMIWOOD_NOTIFICATION_URL) {
    throw new Error('EMMIWOOD_NOTIFICATION_URL is not configured.');
  }
  if (!env.EMMIWOOD_NOTIFICATION_SECRET) {
    throw new Error('EMMIWOOD_NOTIFICATION_SECRET is not configured.');
  }
  await probeReadiness(env);
  if (env.PROCESS_QUEUE === 'true') {
    await processQueue(env);
  } else {
    logJson({
      event: 'queue_processing_skipped',
      reason: 'PROCESS_QUEUE is not "true"',
    });
  }
}

export default {
  async scheduled(_event, env) {
    await runHeartbeat(env);
  },
};
