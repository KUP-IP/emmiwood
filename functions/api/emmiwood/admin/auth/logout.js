import { errorResponse, json } from '../../../../lib/emmiwood-core.js';
import { clearAdminSessionCookie, logout } from '../../../../lib/emmiwood-admin.js';

export async function onRequestPost({ env, request }) {
  try {
    const result = await logout(env, request);
    return json({ ok: true, data: result }, 200, { 'set-cookie': clearAdminSessionCookie(env) });
  } catch (error) {
    return errorResponse(error);
  }
}
