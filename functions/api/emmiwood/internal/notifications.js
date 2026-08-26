import { errorResponse, json } from '../../../lib/emmiwood-core.js';
import {
  notificationReadiness,
  processQueuedNotifications,
} from '../../../lib/emmiwood-notifications.js';

export function authorized(env, request) {
  const secret = env.EMMIWOOD_NOTIFICATION_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export { retryDelaySeconds } from '../../../lib/emmiwood-notifications.js';

export async function onRequestGet({ env, request }) {
  if (!authorized(env, request)) return json({ ok: false, error: 'Unauthorized.' }, 401);
  const readiness = notificationReadiness(env);
  return json({ ok: readiness.ready, data: readiness }, readiness.ready ? 200 : 503);
}

export async function onRequestPost({ env, request }) {
  try {
    if (!authorized(env, request)) return json({ ok: false, error: 'Unauthorized.' }, 401);
    const readiness = notificationReadiness(env);
    if (!readiness.ready) {
      return json({ ok: false, error: 'Notification delivery is not ready.', data: readiness }, 503);
    }

    const notificationId = new URL(request.url).searchParams.get('id');
    if (notificationId && !/^[A-Za-z0-9_-]{1,128}$/.test(notificationId)) {
      return json({ ok: false, error: 'Invalid notification id.' }, 422);
    }
    // Preview / non-production: exact-ID only (prevents bulk accidental live SMS).
    if (env.ENVIRONMENT !== 'production' && !notificationId) {
      return json({
        ok: false,
        error: 'Non-production processing requires an exact notification id (?id=). Bulk processing is production-only.',
        data: { exactIdOnly: true },
      }, 422);
    }

    const outcome = await processQueuedNotifications(env, { notificationId });
    return json({ ok: true, data: { processed: outcome.processed, results: outcome.results } });
  } catch (error) {
    return errorResponse(error);
  }
}
