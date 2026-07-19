export const CLAIM_BUCKET_SECONDS = 5 * 60;
export const SHOP_TIME_ZONE = 'America/Chicago';

export class BookingError extends Error {
  constructor(code, message, status = 422) {
    super(message);
    this.name = 'BookingError';
    this.code = code;
    this.status = status;
  }
}

export function claimBuckets(startAt, claimEndAt) {
  const start = Number(startAt);
  const end = Number(claimEndAt);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) {
    throw new BookingError('invalid_claim', 'The appointment claim range is invalid.');
  }
  const buckets = [];
  for (let bucket = Math.floor(start / CLAIM_BUCKET_SECONDS) * CLAIM_BUCKET_SECONDS; bucket < end; bucket += CLAIM_BUCKET_SECONDS) {
    buckets.push(bucket);
  }
  return buckets;
}

export function claimEndAt(startAt, service) {
  const duration = Number(service?.duration_minutes);
  const buffer = Number(service?.buffer_minutes || 0);
  if (!Number.isInteger(duration) || duration <= 0 || !Number.isInteger(buffer) || buffer < 0) {
    throw new BookingError('invalid_service', 'The service duration or buffer is invalid.');
  }
  return Number(startAt) + (duration + buffer) * 60;
}

export function enforceBookingPolicy({ startAt, now, minNoticeMinutes = 240, horizonDays = 30 }) {
  const start = Number(startAt);
  const current = Number(now);
  if (start < current + minNoticeMinutes * 60) {
    throw new BookingError('minimum_notice', `Bookings require at least ${minNoticeMinutes / 60} hours notice.`);
  }
  if (start > current + horizonDays * 86400) {
    throw new BookingError('outside_horizon', `Bookings open ${horizonDays} days ahead.`);
  }
}

export function enforceChangeCutoff({ startAt, now, changeCutoffMinutes = 720, isAdmin = false }) {
  if (!isAdmin && Number(startAt) - Number(now) < changeCutoffMinutes * 60) {
    throw new BookingError('change_cutoff', 'Online changes close 12 hours before the appointment.');
  }
}

export function slotFitsAvailability(startMinute, claimMinutes, availability) {
  return availability.some(({ start_minute: start, end_minute: end }) => (
    startMinute >= start && startMinute + claimMinutes <= end
  ));
}

function statement(db, sql, values) {
  return db.prepare(sql).bind(...values);
}

function conflictError(error, message) {
  if (/unique|constraint/i.test(String(error?.message || error))) {
    return new BookingError('slot_taken', message, 409);
  }
  return error;
}

export async function reserveAppointment(db, appointment) {
  const claimEnd = appointment.claimEndAt ?? claimEndAt(appointment.startAt, appointment.service);
  const endAt = appointment.endAt ?? Number(appointment.startAt) + Number(appointment.service.duration_minutes) * 60;
  const statements = [
    statement(db, `INSERT INTO emmiwood_customers
      (id,shop_id,name,phone,email,sms_consent,sms_consent_version,sms_consent_at) VALUES(?,?,?,?,?,?,?,?)`, [
      appointment.customer.id, appointment.shopId, appointment.customer.name, appointment.customer.phone,
      appointment.customer.email || null, appointment.customer.smsConsent ? 1 : 0,
      appointment.customer.smsConsent ? (appointment.customer.smsConsentVersion || 'appointment-texts-v1') : null,
      appointment.customer.smsConsent ? (appointment.customer.smsConsentAt || Math.floor(Date.now() / 1000)) : null,
    ]),
    statement(db, `INSERT INTO emmiwood_appointments
      (id,shop_id,barber_id,service_id,customer_id,start_at,end_at,claim_end_at,status,manage_token_hash,manage_token_expires_at,notes,created_by_admin_id)
      VALUES(?,?,?,?,?,?,?,?, 'booked',?,?,?,?)`, [
      appointment.id, appointment.shopId, appointment.barberId, appointment.serviceId,
      appointment.customer.id, appointment.startAt, endAt, claimEnd,
      appointment.manageTokenHash, appointment.manageTokenExpiresAt || null, appointment.notes || '', appointment.adminId || null,
    ]),
    ...claimBuckets(appointment.startAt, claimEnd).map((bucket) => statement(db,
      'INSERT INTO emmiwood_time_claims(appointment_id,barber_id,bucket_start) VALUES(?,?,?)',
      [appointment.id, appointment.barberId, bucket],
    )),
    ...(appointment.extraStatements || []),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    throw conflictError(error, 'That time was just booked. Choose another.');
  }
  return { id: appointment.id, startAt: appointment.startAt, endAt, claimEndAt: claimEnd };
}

export async function cancelAppointment(db, { appointmentId, now, startAt, changeCutoffMinutes = 720, isAdmin = false, extraStatements = [] }) {
  enforceChangeCutoff({ startAt, now, changeCutoffMinutes, isAdmin });
  await db.batch([
    statement(db, 'DELETE FROM emmiwood_time_claims WHERE appointment_id=?', [appointmentId]),
    statement(db, `UPDATE emmiwood_appointments
      SET status='cancelled',cancelled_at=?,updated_at=? WHERE id=? AND status='booked'`, [now, now, appointmentId]),
    ...extraStatements,
  ]);
}

export async function rescheduleAppointment(db, appointment) {
  enforceChangeCutoff(appointment);
  const claimEnd = appointment.claimEndAt ?? claimEndAt(appointment.startAt, appointment.service);
  const endAt = appointment.endAt ?? Number(appointment.startAt) + Number(appointment.service.duration_minutes) * 60;
  const statements = [
    statement(db, 'DELETE FROM emmiwood_time_claims WHERE appointment_id=?', [appointment.appointmentId]),
    ...claimBuckets(appointment.startAt, claimEnd).map((bucket) => statement(db,
      'INSERT INTO emmiwood_time_claims(appointment_id,barber_id,bucket_start) VALUES(?,?,?)',
      [appointment.appointmentId, appointment.barberId, bucket],
    )),
    statement(db, `UPDATE emmiwood_appointments SET barber_id=?,service_id=?,start_at=?,end_at=?,claim_end_at=?,updated_at=?
      WHERE id=? AND status='booked'`, [
      appointment.barberId, appointment.serviceId, appointment.startAt, endAt, claimEnd,
      appointment.now, appointment.appointmentId,
    ]),
    ...(appointment.extraStatements || []),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    throw conflictError(error, 'That new time is unavailable. The original appointment is unchanged.');
  }
  return { id: appointment.appointmentId, startAt: appointment.startAt, endAt, claimEndAt: claimEnd };
}
