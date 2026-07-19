import { errorResponse, json } from '../../../lib/emmiwood-core.js';
import { EDIT_ROLES, createAdminAppointment, dashboard, requireAdmin } from '../../../lib/emmiwood-admin.js';

export async function onRequestGet({ env, request }) {
  try {
    await requireAdmin(env, request);
    const data = await dashboard(env);
    return json({ ok: true, data: data.appointments });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost({ env, request }) {
  try {
    const admin = await requireAdmin(env, request, EDIT_ROLES);
    return json({ ok: true, data: await createAdminAppointment(env, await request.json(), admin) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
