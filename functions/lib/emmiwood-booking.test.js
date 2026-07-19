import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BookingError,
  cancelAppointment,
  claimBuckets,
  enforceBookingPolicy,
  reserveAppointment,
  rescheduleAppointment,
  slotFitsAvailability,
} from './emmiwood-booking.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

class D1Statement {
  constructor(db, sql, values = []) { this.db = db; this.sql = sql; this.values = values; }
  bind(...values) { return new D1Statement(this.db, this.sql, values); }
  async run() { this.db.exec(this.toSql()); }
  toSql() {
    let offset = 0;
    return this.sql.replace(/\?/g, () => sqlValue(this.values[offset++]));
  }
}

class TestD1 {
  constructor() {
    this.directory = mkdtempSync(join(tmpdir(), 'emmiwood-booking-'));
    this.path = join(this.directory, 'test.sqlite');
  }
  prepare(sql) { return new D1Statement(this, sql); }
  exec(sql) { execFileSync('sqlite3', ['-bail', this.path], { input: `PRAGMA foreign_keys=ON;\n${sql}`, stdio: ['pipe', 'pipe', 'pipe'] }); }
  query(sql) {
    const output = execFileSync('sqlite3', ['-json', this.path, sql], { encoding: 'utf8' });
    return output.trim() ? JSON.parse(output) : [];
  }
  async batch(statements) {
    this.exec(`BEGIN IMMEDIATE;\n${statements.map((item) => `${item.toSql()};`).join('\n')}\nCOMMIT;`);
  }
  close() { rmSync(this.directory, { recursive: true, force: true }); }
}

function sqlValue(value) {
  if (value == null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function setup() {
  const db = new TestD1();
  db.exec(readFileSync(`${ROOT}migrations/0001_booking.sql`, 'utf8'));
  db.exec(readFileSync(`${ROOT}migrations/0002_launch_copy.sql`, 'utf8'));
  db.exec(readFileSync(`${ROOT}migrations/0003_production_hardening.sql`, 'utf8'));
  return db;
}

function booking(id, startAt, barberId = 'barro') {
  return {
    id,
    shopId: 'emmiwood',
    barberId,
    serviceId: 'signature',
    service: { duration_minutes: 40, buffer_minutes: 10 },
    startAt,
    manageTokenHash: `token-${id}`,
    customer: { id: `customer-${id}`, name: 'Guest', phone: '+16055550100', smsConsent: true },
  };
}

test('migration seeds the exact launch catalog and appointment availability', () => {
  const db = setup();
  const shop = db.query('SELECT * FROM emmiwood_shops')[0];
  assert.equal(shop.timezone, 'America/Chicago');
  assert.equal(shop.min_notice_minutes, 240);
  assert.equal(shop.horizon_days, 30);
  assert.equal(shop.change_cutoff_minutes, 720);
  assert.equal(db.query('SELECT count(*) count FROM emmiwood_services')[0].count, 5);
  assert.equal(db.query('SELECT count(*) count FROM emmiwood_barber_services')[0].count, 10);
  assert.deepEqual(
    db.query("SELECT weekday,start_minute,end_minute FROM emmiwood_availability WHERE barber_id='john' ORDER BY weekday"),
    [1, 3, 5].map((weekday) => ({ weekday, start_minute: 540, end_minute: 720 })),
  );
  assert.equal(db.query("SELECT count(*) count FROM emmiwood_availability WHERE barber_id='barro'")[0].count, 12);
  db.close();
});

test('claim buckets cover variable duration plus buffer and exclude walk-in hours', () => {
  assert.equal(claimBuckets(1_800, 4_800).length, 10);
  const windows = [{ start_minute: 540, end_minute: 720 }, { start_minute: 840, end_minute: 1140 }];
  assert.equal(slotFitsAvailability(670, 50, windows), true);
  assert.equal(slotFitsAvailability(680, 50, windows), false);
  assert.equal(slotFitsAvailability(840, 50, windows), true);
});

test('booking policy enforces notice and horizon', () => {
  assert.throws(() => enforceBookingPolicy({ now: 1_000, startAt: 1_000 + 239 * 60 }), { code: 'minimum_notice' });
  assert.throws(() => enforceBookingPolicy({ now: 1_000, startAt: 1_000 + 31 * 86400 }), { code: 'outside_horizon' });
  assert.doesNotThrow(() => enforceBookingPolicy({ now: 1_000, startAt: 1_000 + 4 * 3600 }));
});

test('overlapping variable-duration reservations are rejected atomically', async () => {
  const db = setup();
  await reserveAppointment(db, booking('one', 1_800));
  await assert.rejects(reserveAppointment(db, booking('two', 3_000)), (error) => error instanceof BookingError && error.code === 'slot_taken');
  assert.equal(db.query('SELECT count(*) count FROM emmiwood_appointments')[0].count, 1);
  assert.equal(db.query("SELECT count(*) count FROM emmiwood_customers WHERE id='customer-two'")[0].count, 0);
  db.close();
});

test('cancellation releases claims and observes the customer cutoff', async () => {
  const db = setup();
  const startAt = 100_000;
  await reserveAppointment(db, booking('one', startAt));
  await assert.rejects(cancelAppointment(db, { appointmentId: 'one', startAt, now: startAt - 11 * 3600 }), { code: 'change_cutoff' });
  await cancelAppointment(db, { appointmentId: 'one', startAt, now: startAt - 13 * 3600 });
  assert.equal(db.query("SELECT count(*) count FROM emmiwood_time_claims WHERE appointment_id='one'")[0].count, 0);
  assert.equal(db.query("SELECT status FROM emmiwood_appointments WHERE id='one'")[0].status, 'cancelled');
  db.close();
});

test('a conflicting reschedule preserves the original appointment and claims', async () => {
  const db = setup();
  await reserveAppointment(db, booking('one', 100_000));
  await reserveAppointment(db, booking('two', 200_000));
  const before = db.query("SELECT * FROM emmiwood_appointments WHERE id='one'")[0];
  await assert.rejects(rescheduleAppointment(db, {
    appointmentId: 'one', barberId: 'barro', serviceId: 'signature', startAt: 200_000,
    service: { duration_minutes: 40, buffer_minutes: 10 }, now: 1_000, isAdmin: true,
  }), { code: 'slot_taken' });
  const after = db.query("SELECT * FROM emmiwood_appointments WHERE id='one'")[0];
  assert.equal(after.start_at, before.start_at);
  assert.equal(db.query("SELECT count(*) count FROM emmiwood_time_claims WHERE appointment_id='one'")[0].count, 11);
  db.close();
});
