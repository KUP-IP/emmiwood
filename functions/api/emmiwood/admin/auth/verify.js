import { errorResponse, json, requireSameOrigin } from '../../../../lib/emmiwood-core.js';
import { adminSessionCookie, verifyCode } from '../../../../lib/emmiwood-admin.js';

export async function onRequestPost({ env, request }) {
  try {
    requireSameOrigin(request, env);
    const { phone, code } = await request.json();
    const result = await verifyCode(env, phone, code);
    return json({ ok: true, data: { admin: result.admin } }, 200, { 'set-cookie': adminSessionCookie(result.token, env) });
  } catch (error) {
    return errorResponse(error);
  }
}
