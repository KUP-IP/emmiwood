import { book, errorResponse, json, requireSameOrigin } from '../../lib/emmiwood-core.js';

export async function onRequestPost({ env, request }) {
  try {
    requireSameOrigin(request, env);
    const input = await request.json();
    return json({ ok: true, data: await book(env, input) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
