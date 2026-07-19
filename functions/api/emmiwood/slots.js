import { EmmiwoodError, errorResponse, json, managedAppointment, slots } from '../../lib/emmiwood-core.js';

export async function onRequestGet({ env, request }) {
  try {
    const url = new URL(request.url);
    const serviceId = url.searchParams.get('serviceId');
    const date = url.searchParams.get('date');
    const barberId = url.searchParams.get('barberId') || 'first';
    const manageToken = url.searchParams.get('manageToken');
    if (!serviceId || !date) throw new EmmiwoodError('missing_query', 'Choose a service and date.', 422);
    const managed = manageToken ? await managedAppointment(env, manageToken) : null;
    return json({ ok: true, data: await slots(env, { serviceId, date, barberId, excludeAppointmentId: managed?.id || null }) });
  } catch (error) {
    return errorResponse(error);
  }
}
