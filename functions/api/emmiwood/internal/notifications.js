import { errorResponse, json } from '../../../lib/emmiwood-core.js';
import {
  NOTIFICATION_PROVIDER_UNCONFIGURED,
  deliverNotification,
  notificationProvider,
  notificationReadiness,
} from '../../../lib/emmiwood-notifications.js';

const MAX_ATTEMPTS = 3;

export function authorized(env, request) {
  const secret = env.EMMIWOOD_NOTIFICATION_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export function retryDelaySeconds(attempt) {
  return Math.min(3600, 60 * (2 ** Math.max(0, Number(attempt) - 1)));
}

export async function onRequestGet({ env, request }) {
  if (!authorized(env, request)) return json({ ok: false, error: 'Unauthorized.' }, 401);
  const readiness = notificationReadiness(env);
  return json({ ok: readiness.ready, data: readiness }, readiness.ready ? 200 : 503);
}

export async function onRequestPost({ env, request }) {
  try {
    if (!authorized(env, request)) return json({ ok: false, error: 'Unauthorized.' }, 401);
    const readiness = notificationReadiness(env);
    if (env.ENVIRONMENT === 'production' && !readiness.ready) {
      return json({ ok: false, error: 'Notification delivery is not ready.', data: readiness }, 503);
    }

    const notificationId = new URL(request.url).searchParams.get('id');
    if (notificationId && !/^[A-Za-z0-9_-]{1,128}$/.test(notificationId)) {
      return json({ ok: false, error: 'Invalid notification id.' }, 422);
    }
    const pending = notificationId
      ? await env.DB.prepare(`SELECT * FROM emmiwood_notification_outbox
        WHERE id=? AND status='queued' AND available_at<=unixepoch() AND attempt_count<? LIMIT 1`)
        .bind(notificationId, MAX_ATTEMPTS).all()
      : await env.DB.prepare(`SELECT * FROM emmiwood_notification_outbox
        WHERE status='queued' AND available_at<=unixepoch() AND attempt_count<?
        ORDER BY available_at,created_at LIMIT 50`).bind(MAX_ATTEMPTS).all();
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
        const terminal = attempt >= MAX_ATTEMPTS;
        const delay = retryDelaySeconds(attempt);
        await env.DB.prepare(`UPDATE emmiwood_notification_outbox
          SET status=?,provider=?,attempt_count=?,last_attempt_at=unixepoch(),available_at=CASE WHEN ? THEN available_at ELSE unixepoch()+? END,error=?
          WHERE id=?`).bind(terminal ? 'failed' : 'queued', resolvedProvider, attempt, terminal ? 1 : 0, delay, message.slice(0, 500), row.id).run();
        results.push({ id: row.id, status: terminal ? 'failed' : 'retrying', attempt, retryInSeconds: terminal ? null : delay, error: message });
      }
    }
    return json({ ok: true, data: { processed: results.length, results } });
  } catch (error) {
    return errorResponse(error);
  }
}
