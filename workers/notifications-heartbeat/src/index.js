// Emmiwood notification heartbeat — Cloudflare Worker replacement for the
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

const PROBE_TIMEOUT_MS = 30_000;
const PROCESS_TIMEOUT_MS = 120_000;
const PROBE_ATTEMPTS = 3; // 1 try + 2 retries, mirroring curl --retry 2

async function callEndpoint(env, { method, attempts }) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(env.EMMIWOOD_NOTIFICATION_URL, {
        method,
        headers: { Authorization: `Bearer ${env.EMMIWOOD_NOTIFICATION_SECRET}` },
        signal: AbortSignal.timeout(
          method === 'POST' ? PROCESS_TIMEOUT_MS : PROBE_TIMEOUT_MS,
        ),
      });
      const body = await response.json().catch(() => null);
      return { status: response.status, body };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw lastError;
}

export async function probeReadiness(env) {
  const { status, body } = await callEndpoint(env, {
    method: 'GET',
    attempts: PROBE_ATTEMPTS,
  });
  const data = body?.data || {};
  console.log(JSON.stringify({
    event: 'readiness_probe',
    status,
    environment: data.environment || null,
    ready: data.ready === true,
    processorReady: data.processor?.ready ?? null,
    smsReady: data.sms?.ready ?? null,
    smsProvider: data.sms?.provider || null,
    emailReady: data.email?.ready ?? null,
    emailProvider: data.email?.provider || null,
  }));
  if (
    status !== 200
    || body?.ok !== true
    || data.ready !== true
    || data.environment !== 'production'
  ) {
    throw new Error(
      `Notification readiness probe failed: HTTP ${status}, `
      + `ready=${data.ready}, environment=${data.environment}`,
    );
  }
  return data;
}

export async function processQueue(env) {
  const { status, body } = await callEndpoint(env, {
    method: 'POST',
    attempts: 1,
  });
  if (status !== 200 || body?.ok !== true) {
    throw new Error(`Queue processing failed: HTTP ${status}`);
  }
  const results = body.data?.results || [];
  for (const result of results) {
    console.log(JSON.stringify({
      event: 'notification_processed',
      id: result.id,
      status: result.status,
      provider: result.provider || null,
      attempt: result.attempt,
      providerMessageId: result.providerMessageId || null,
    }));
  }
  console.log(JSON.stringify({
    event: 'queue_processed',
    processed: body.data?.processed ?? results.length,
  }));
  const bad = results.filter(
    (result) => result.status === 'retrying' || result.status === 'failed',
  );
  if (bad.length > 0) {
    throw new Error(
      `Queue processing reported ${bad.length} retrying/failed `
      + `notification(s): ${bad.map((result) => result.id).join(', ')}`,
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
    console.log(JSON.stringify({
      event: 'queue_processing_skipped',
      reason: 'PROCESS_QUEUE is not "true"',
    }));
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runHeartbeat(env));
  },

  // Liveness only. No processing trigger is exposed over HTTP: queue
  // processing happens on the cron alone, exactly like the Actions
  // schedule it replaces. The exact-ID delivery smoke stays an operator
  // action against the internal endpoint (see README).
  async fetch(request, env) {
    return Response.json({
      ok: true,
      service: 'emmiwood-notifications-heartbeat',
      processQueue: env.PROCESS_QUEUE === 'true',
    });
  },
};
