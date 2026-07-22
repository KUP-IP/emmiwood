import { errorResponse, json, requireSameOrigin } from '../../../../lib/emmiwood-core.js';
import { requestCode } from '../../../../lib/emmiwood-admin.js';

export async function onRequestPost({ env, request, waitUntil }) {
  try {
    requireSameOrigin(request, env);
    const { phone } = await request.json();
    const defer = typeof waitUntil === 'function' ? (task) => waitUntil(task) : undefined;
    const source = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    return json({ ok: true, data: await requestCode(env, phone, { defer, source }) });
  } catch (error) {
    return errorResponse(error);
  }
}
