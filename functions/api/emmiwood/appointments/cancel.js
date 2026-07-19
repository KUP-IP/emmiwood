import { cancelAppointment, errorResponse, json, manageTokenFromRequest, requireSameOrigin } from '../../../lib/emmiwood-core.js';

export async function onRequestPost({ env, request }) {
  try {
    requireSameOrigin(request, env);
    return json({ ok: true, data: await cancelAppointment(env, manageTokenFromRequest(request)) });
  } catch (error) {
    return errorResponse(error);
  }
}
