import { errorResponse, json } from '../../../../lib/emmiwood-core.js';
import { EDIT_ROLES, cancelAdminAppointment, requireAdmin, rescheduleAdminAppointment } from '../../../../lib/emmiwood-admin.js';

export async function onRequestPatch({ env, request, params }) {
  try {
    const admin = await requireAdmin(env, request, EDIT_ROLES);
    return json({ ok: true, data: await rescheduleAdminAppointment(env, params.id, await request.json(), admin) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestDelete({ env, request, params }) {
  try {
    const admin = await requireAdmin(env, request, EDIT_ROLES);
    return json({ ok: true, data: await cancelAdminAppointment(env, params.id, admin) });
  } catch (error) {
    return errorResponse(error);
  }
}
