import { EmmiwoodError, errorResponse, json, manageSessionCookie, managedAppointment, requireSameOrigin } from '../../../lib/emmiwood-core.js';

export async function onRequestPost({ env, request }) {
  try {
    requireSameOrigin(request, env);
    const { token } = await request.json();
    if (!token) throw new EmmiwoodError('token_required', 'The appointment link is incomplete.', 422);
    const appointment = await managedAppointment(env, token);
    return json({ ok: true, data: appointment }, 200, { 'set-cookie': manageSessionCookie(token, env) });
  } catch (error) {
    return errorResponse(error);
  }
}
