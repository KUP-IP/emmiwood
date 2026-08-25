#!/usr/bin/env node
/**
 * Preview SMS self-verify suite — five unique paths (post–Red Team).
 *
 * Usage:
 *   node scripts/sms-self-verify-suite.mjs --spend-go "OK to send 5 intentional SMS to +15078485517; abort on any extra."
 *
 * Non-claims: does not prove reminder scheduling, scheduler enablement, or Prod-GO.
 */
import {
  DEFAULT_TEST_PHONE,
  SPEND_GO_PHRASE,
  SuiteError,
  assertD1Sent,
  assertExactIdGate,
  assertQueuedOnly,
  adminByPhone,
  bookAppointment,
  cancelViaManage,
  forceReminderAvailable,
  getReadiness,
  latestAdminOtpOutbox,
  notificationSecret,
  observePreviewSha,
  outboxForAppointment,
  pickSlotAtLeastHoursAhead,
  pickSlotWithinHours,
  processExactIdOnce,
  quarantineOutbox,
  quarantineQueuedForAppointments,
  queuedCountForAppointments,
  requestAdminCodeOnce,
  requireSpendGo,
  rescheduleViaManage,
  shopDateOffset,
  slots,
  smsFromNumber,
  waitForChatDb,
  writeReceipt,
} from './sms-self-verify-lib.mjs';

const SERVICE_ID = 'beard';
const PHONE = process.env.EMMIWOOD_SMS_TEST_PHONE || DEFAULT_TEST_PHONE;

const intentionalSends = [];
const appointmentIds = [];

function recordSend(entry) {
  intentionalSends.push(entry);
  if (intentionalSends.length > 5) {
    throw new SuiteError('ABORT: intentional send budget exceeded (>5)', intentionalSends);
  }
}

async function findNearSlot() {
  for (const dayOffset of [0, 1]) {
    const date = shopDateOffset(dayOffset);
    const list = await slots({ serviceId: SERVICE_ID, date });
    const pick = pickSlotWithinHours(list, { minHours: 0.2, maxHours: 20 });
    if (pick) return { date, ...pick };
  }
  throw new SuiteError('No <24h slot found for beard');
}

async function findFarSlot() {
  for (const dayOffset of [1, 2, 3, 4, 5]) {
    const date = shopDateOffset(dayOffset);
    const list = await slots({ serviceId: SERVICE_ID, date });
    const pick = pickSlotAtLeastHoursAhead(list, 25);
    if (pick) return { date, ...pick };
  }
  throw new SuiteError('No ≥25h slot found for beard');
}

async function findAlternateNearSlot(excludeStart) {
  for (const dayOffset of [0, 1]) {
    const date = shopDateOffset(dayOffset);
    const list = await slots({ serviceId: SERVICE_ID, date });
    const pick = list.find(
      (s) =>
        Number(s.start) !== Number(excludeStart) &&
        pickSlotWithinHours([s], { minHours: 0.2, maxHours: 22 }),
    );
    if (pick) return { date, ...pick };
  }
  throw new SuiteError('No alternate <24h slot for reschedule');
}

async function runCase(name, fn) {
  process.stderr.write(`\n=== ${name} ===\n`);
  const result = await fn();
  process.stderr.write(`PASS ${name}\n`);
  return result;
}

async function main() {
  requireSpendGo(process.argv);
  const secret = notificationSecret();
  const readiness = await getReadiness(secret);
  const fromNumber = smsFromNumber(readiness);
  await assertExactIdGate(secret);

  const admin = adminByPhone(PHONE);
  if (!admin) {
    throw new SuiteError(
      `T5 preflight STOP: no active admin with phone ${PHONE} (no silent roster mutate)`,
    );
  }

  const deploy = await observePreviewSha();
  const cases = [];

  // —— T1 booking_confirmation ——
  const t1 = await runCase('T1 booking_confirmation', async () => {
    const slot = await findNearSlot();
    const watermark = Math.floor(Date.now() / 1000) - 2;
    const booking = await bookAppointment({
      serviceId: SERVICE_ID,
      date: slot.date,
      start: slot.start,
      barberId: slot.barberId,
      phone: PHONE,
      name: 'SMS Suite T1',
    });
    appointmentIds.push(booking.id);
    await new Promise((r) => setTimeout(r, 800));
    const rows = outboxForAppointment(booking.id);
    const target = assertQueuedOnly(rows, 'booking_confirmation');
    const sent = await processExactIdOnce(secret, target.id);
    recordSend({ case: 'T1', outboxId: target.id, sid: sent.providerMessageId });
    const d1 = assertD1Sent(target.id);
    const sms = await waitForChatDb({
      fromNumber,
      afterUnixSeconds: watermark,
      fingerprint: 'appointment confirmed at Emmiwood',
      uniqueToken: booking.manageToken,
    });
    return {
      case: 'T1',
      appointmentId: booking.id,
      manageToken: booking.manageToken,
      outboxId: target.id,
      sid: d1.provider_message_id,
      chatRowid: sms.rowid,
    };
  });
  cases.push(t1);

  // —— T2 cancellation (same appt) ——
  const t2 = await runCase('T2 cancellation_confirmation', async () => {
    const watermark = Math.floor(Date.now() / 1000) - 2;
    await cancelViaManage(t1.manageToken);
    await new Promise((r) => setTimeout(r, 800));
    const rows = outboxForAppointment(t1.appointmentId);
    const queued = rows.filter((r) => r.status === 'queued');
    if (queued.length !== 1 || queued[0].template !== 'cancellation_confirmation') {
      throw new SuiteError('T2 inventory: expected only cancellation queued', queued);
    }
    const target = queued[0];
    const sent = await processExactIdOnce(secret, target.id);
    recordSend({ case: 'T2', outboxId: target.id, sid: sent.providerMessageId });
    const d1 = assertD1Sent(target.id);
    const sms = await waitForChatDb({
      fromNumber,
      afterUnixSeconds: watermark,
      fingerprint: 'appointment cancelled at Emmiwood',
      uniqueToken: null,
    });
    return {
      case: 'T2',
      appointmentId: t1.appointmentId,
      outboxId: target.id,
      sid: d1.provider_message_id,
      chatRowid: sms.rowid,
    };
  });
  cases.push(t2);

  // —— T3 reschedule (quarantine confirmation) ——
  const t3 = await runCase('T3 reschedule_confirmation', async () => {
    const slot = await findNearSlot();
    const booking = await bookAppointment({
      serviceId: SERVICE_ID,
      date: slot.date,
      start: slot.start,
      barberId: slot.barberId,
      phone: PHONE,
      name: 'SMS Suite T3',
    });
    appointmentIds.push(booking.id);
    await new Promise((r) => setTimeout(r, 800));
    let rows = outboxForAppointment(booking.id);
    const confirm = assertQueuedOnly(rows, 'booking_confirmation');
    quarantineOutbox(confirm.id, 'sms_suite_quarantine_T3');
    const alt = await findAlternateNearSlot(slot.start);
    await rescheduleViaManage(booking.manageToken, {
      serviceId: SERVICE_ID,
      date: alt.date,
      start: alt.start,
      barberId: alt.barberId,
    });
    await new Promise((r) => setTimeout(r, 800));
    rows = outboxForAppointment(booking.id);
    const queued = rows.filter((r) => r.status === 'queued');
    if (queued.length !== 1 || queued[0].template !== 'reschedule_confirmation') {
      throw new SuiteError('T3 inventory: expected only reschedule queued', queued);
    }
    const target = queued[0];
    const watermark = Math.floor(Date.now() / 1000) - 2;
    const sent = await processExactIdOnce(secret, target.id);
    recordSend({ case: 'T3', outboxId: target.id, sid: sent.providerMessageId });
    const d1 = assertD1Sent(target.id);
    const sms = await waitForChatDb({
      fromNumber,
      afterUnixSeconds: watermark,
      fingerprint: 'appointment rescheduled at Emmiwood',
      uniqueToken: booking.manageToken,
    });
    return {
      case: 'T3',
      appointmentId: booking.id,
      manageToken: booking.manageToken,
      outboxId: target.id,
      sid: d1.provider_message_id,
      chatRowid: sms.rowid,
    };
  });
  cases.push(t3);

  // —— T4 reminder template (quarantine confirmation + force available_at) ——
  const t4 = await runCase('T4 appointment_reminder (forced availability)', async () => {
    const slot = await findFarSlot();
    const booking = await bookAppointment({
      serviceId: SERVICE_ID,
      date: slot.date,
      start: slot.start,
      barberId: slot.barberId,
      phone: PHONE,
      name: 'SMS Suite T4',
    });
    appointmentIds.push(booking.id);
    await new Promise((r) => setTimeout(r, 800));
    let rows = outboxForAppointment(booking.id);
    const confirm = rows.find((r) => r.template === 'booking_confirmation' && r.status === 'queued');
    const reminder = rows.find((r) => r.template === 'appointment_reminder' && r.status === 'queued');
    if (!confirm || !reminder) {
      throw new SuiteError('T4 expected confirmation+reminder queued', rows);
    }
    quarantineOutbox(confirm.id, 'sms_suite_quarantine_T4');
    forceReminderAvailable(reminder.id);
    rows = outboxForAppointment(booking.id);
    const queued = rows.filter((r) => r.status === 'queued');
    if (queued.length !== 1 || queued[0].template !== 'appointment_reminder') {
      throw new SuiteError('T4 inventory: expected only reminder queued', queued);
    }
    const target = queued[0];
    const watermark = Math.floor(Date.now() / 1000) - 2;
    const sent = await processExactIdOnce(secret, target.id);
    recordSend({ case: 'T4', outboxId: target.id, sid: sent.providerMessageId });
    const d1 = assertD1Sent(target.id);
    const sms = await waitForChatDb({
      fromNumber,
      afterUnixSeconds: watermark,
      fingerprint: 'KUP Solutions reminder at Emmiwood',
      uniqueToken: booking.manageToken,
    });
    return {
      case: 'T4',
      appointmentId: booking.id,
      manageToken: booking.manageToken,
      outboxId: target.id,
      sid: d1.provider_message_id,
      chatRowid: sms.rowid,
      nonClaim: 'reminder template + exact-ID after forced available_at only; not schedule/scheduler proof',
    };
  });
  cases.push(t4);

  // —— T5 admin OTP ——
  const t5 = await runCase('T5 admin_login_code', async () => {
    const before = latestAdminOtpOutbox(PHONE).map((r) => r.id);
    const watermark = Math.floor(Date.now() / 1000) - 2;
    const api = await requestAdminCodeOnce(PHONE);
    // Intentionally do not treat api.ok / previewCode as proof
    await new Promise((r) => setTimeout(r, 1500));
    const after = latestAdminOtpOutbox(PHONE);
    const created = after.find((r) => !before.includes(r.id));
    if (!created) {
      throw new SuiteError('T5 no new admin_login_code outbox row', { api, after });
    }
    // Poll D1 until sent (immediate delivery path)
    let d1 = created;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && d1.status !== 'sent') {
      await new Promise((r) => setTimeout(r, 1000));
      d1 = latestAdminOtpOutbox(PHONE).find((r) => r.id === created.id) || d1;
    }
    if (d1.status !== 'sent' || !/^SM/.test(String(d1.provider_message_id || ''))) {
      throw new SuiteError('T5 D1 not sent with SM sid (API ok insufficient)', d1);
    }
    recordSend({ case: 'T5', outboxId: d1.id, sid: d1.provider_message_id });
    let code = null;
    try {
      code = JSON.parse(d1.payload_json || '{}').code || null;
    } catch {
      code = null;
    }
    const sms = await waitForChatDb({
      fromNumber,
      afterUnixSeconds: watermark,
      fingerprint: 'your sign-in code is',
      uniqueToken: code,
    });
    return {
      case: 'T5',
      outboxId: d1.id,
      sid: d1.provider_message_id,
      chatRowid: sms.rowid,
      apiPreviewCodeIgnored: Boolean(api?.data?.previewCode),
    };
  });
  cases.push(t5);

  // —— Cleanup ——
  process.stderr.write('\n=== cleanup ===\n');
  for (const c of [t3, t4]) {
    if (c.manageToken) {
      try {
        await cancelViaManage(c.manageToken);
      } catch (error) {
        process.stderr.write(`cleanup cancel note: ${error.message}\n`);
      }
    }
  }
  quarantineQueuedForAppointments(appointmentIds, 'sms_suite_cleanup_quarantine');
  // Also quarantine any stray queued admin codes from suite window? only appointment-scoped per plan.
  const queuedLeft = queuedCountForAppointments(appointmentIds);
  if (queuedLeft !== 0) {
    throw new SuiteError(`Cleanup failed: queued=${queuedLeft} for suite appointments`);
  }
  if (intentionalSends.length !== 5) {
    throw new SuiteError(`Expected exactly 5 intentional sends, got ${intentionalSends.length}`, intentionalSends);
  }

  const receipt = {
    ok: true,
    kind: 'Preview-GO SMS self-verify suite',
    phone: PHONE,
    fromNumber,
    intentionalSends,
    cases,
    deploy,
    nonClaims: [
      'Not Prod-GO',
      'Not scheduler enablement',
      'T4 does not prove reminder T-24h scheduling — forced available_at only',
      'Bridge messages_* not used (chat.db SSOT)',
    ],
    spendGo: SPEND_GO_PHRASE,
    completedAt: new Date().toISOString(),
  };
  const path = writeReceipt(receipt);
  process.stderr.write(`\nSuite PASS — receipt ${path}\n`);
  console.log(JSON.stringify({ ok: true, receiptPath: path, sids: intentionalSends.map((s) => s.sid) }, null, 2));
}

main().catch((error) => {
  process.stderr.write(`\nSuite FAIL: ${error.message}\n`);
  if (error.detail) {
    process.stderr.write(`${JSON.stringify(error.detail, null, 2)}\n`);
  }
  process.exitCode = 1;
});
