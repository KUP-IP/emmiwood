import { createHash } from 'node:crypto';

import { PLACEHOLDER_ADMIN_PHONE, validateAdminRoster } from './release-preflight-lib.mjs';

const ADMIN_INPUTS = Object.freeze([
  { id: 'admin-isaiah', role: 'owner', label: 'OWNER' },
  { id: 'admin-recovery', role: 'manager', label: 'RECOVERY' },
  { id: 'admin-kup-support', role: 'kup_support', label: 'SUPPORT' },
]);

function required(env, name) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`missing required admin seed input ${name}`);
  return value;
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPhone(value) {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

export function productionAdminRosterFromEnv(env = {}) {
  const roster = ADMIN_INPUTS.map(({ id, role, label }) => {
    const emailName = `EMMIWOOD_${label}_EMAIL`;
    const phoneName = `EMMIWOOD_${label}_PHONE`;
    const email = required(env, emailName).toLowerCase();
    const phone = required(env, phoneName);
    if (!validEmail(email)) throw new Error(`admin seed input ${emailName} must be a valid email`);
    if (!validPhone(phone)) throw new Error(`admin seed input ${phoneName} must be E.164`);
    if (phone === PLACEHOLDER_ADMIN_PHONE) throw new Error(`admin seed input ${phoneName} must not use the preview placeholder`);
    return { id, shop_id: 'emmiwood', email, role, active: 1, phone };
  });

  if (new Set(roster.map((admin) => admin.email)).size !== roster.length) throw new Error('admin seed emails must be unique');
  if (new Set(roster.map((admin) => admin.phone)).size !== roster.length) throw new Error('admin seed phones must be unique');
  const rosterErrors = validateAdminRoster(roster);
  if (rosterErrors.length) throw new Error(rosterErrors.join('; '));
  return roster;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildAdminSeedSql(roster) {
  const errors = validateAdminRoster(roster);
  if (errors.length) throw new Error(errors.join('; '));
  const statements = roster.map((admin) => `INSERT INTO emmiwood_admins(id,shop_id,email,role,active,phone)
VALUES(${sqlString(admin.id)},${sqlString(admin.shop_id)},${sqlString(admin.email)},${sqlString(admin.role)},1,${sqlString(admin.phone)})
ON CONFLICT(id) DO UPDATE SET shop_id=excluded.shop_id,email=excluded.email,role=excluded.role,active=1,phone=excluded.phone;`);
  // D1's Wrangler file importer owns the transaction and rolls the import back on failure.
  // Explicit BEGIN/COMMIT statements are incompatible with that importer.
  return `PRAGMA foreign_keys=ON;\n${statements.join('\n')}\n`;
}

export function validatePreSeedRoster(roster = []) {
  const rows = Array.isArray(roster) ? roster : [];
  if (rows.length !== 1) throw new Error(`production admin seed requires exactly one migration-seeded account; observed ${rows.length}`);
  const [admin] = rows;
  if (admin?.id !== 'admin-isaiah' || admin?.role !== 'owner' || Number(admin?.active) !== 1) {
    throw new Error('production admin seed precondition requires the migration-seeded owner account');
  }
  if (String(admin?.phone || '').trim() !== PLACEHOLDER_ADMIN_PHONE) {
    throw new Error('production admin seed precondition requires the untouched preview placeholder phone');
  }
  return true;
}

export function seedContractFingerprint(roster) {
  const contract = roster.map(({ id, role }) => ({ id, role }));
  return createHash('sha256').update(JSON.stringify(contract)).digest('hex');
}

function maskEmail(value) {
  const [local, domain] = String(value).split('@');
  return `${local?.slice(0, 1) || '*'}***@${domain || 'invalid'}`;
}

function maskPhone(value) {
  const raw = String(value);
  return `***${raw.slice(-4)}`;
}

export function maskedAdminRoster(roster) {
  return roster.map((admin) => ({
    id: admin.id,
    role: admin.role,
    email: maskEmail(admin.email),
    phone: maskPhone(admin.phone),
  }));
}
