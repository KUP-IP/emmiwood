import { errorResponse, json } from '../../../../../lib/emmiwood-core.js';
import { EDIT_ROLES, deleteResource, requireAdmin, updateResource } from '../../../../../lib/emmiwood-admin.js';

export async function onRequestPatch({ env, request, params }) {
  try {
    const admin = await requireAdmin(env, request, EDIT_ROLES);
    return json({ ok: true, data: await updateResource(env, params.resource, params.id, await request.json(), admin) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestDelete({ env, request, params }) {
  try {
    const admin = await requireAdmin(env, request, EDIT_ROLES);
    return json({ ok: true, data: await deleteResource(env, params.resource, params.id, admin) });
  } catch (error) {
    return errorResponse(error);
  }
}
