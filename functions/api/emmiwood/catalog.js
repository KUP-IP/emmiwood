import { catalog, errorResponse, json } from '../../lib/emmiwood-core.js';

export async function onRequestGet({ env }) {
  try {
    return json({ ok: true, data: await catalog(env) });
  } catch (error) {
    return errorResponse(error);
  }
}
