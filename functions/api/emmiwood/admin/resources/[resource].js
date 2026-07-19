import { errorResponse, json } from '../../../../lib/emmiwood-core.js';
import { EDIT_ROLES, createResource, listResource, requireAdmin } from '../../../../lib/emmiwood-admin.js';

export async function onRequestGet({ env, request, params }) {
  try {
    await requireAdmin(env, request);
    return json({ ok: true, data: await listResource(env, params.resource) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost({ env, request, params }) {
  try {
    const admin = await requireAdmin(env, request, EDIT_ROLES);
    return json({ ok: true, data: await createResource(env, params.resource, await request.json(), admin) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
