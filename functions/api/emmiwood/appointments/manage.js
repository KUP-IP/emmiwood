import { errorResponse, json, manageTokenFromRequest, managedAppointment, publicManagedAppointment } from '../../../lib/emmiwood-core.js';

export async function onRequestGet({ env, request }) {
  try {
    return json({ ok: true, data: publicManagedAppointment(await managedAppointment(env, manageTokenFromRequest(request))) });
  } catch (error) {
    return errorResponse(error);
  }
}
