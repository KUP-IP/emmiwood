import { errorResponse, json } from '../../../../lib/emmiwood-core.js';
import { requireAdmin } from '../../../../lib/emmiwood-admin.js';

export async function onRequestGet({ env, request }) {
  try {
    const admin = await requireAdmin(env, request);
    return json({ ok: true, data: { id: admin.id, email: admin.email, role: admin.role } });
  } catch (error) {
    return errorResponse(error);
  }
}
