import { errorResponse, json, manageTokenFromRequest, requireSameOrigin, rescheduleAppointment } from '../../../lib/emmiwood-core.js';

export async function onRequestPost({ env, request }) {
  try {
    requireSameOrigin(request, env);
    const changes = await request.json();
    return json({ ok: true, data: await rescheduleAppointment(env, manageTokenFromRequest(request), changes) });
  } catch (error) {
    return errorResponse(error);
  }
}
