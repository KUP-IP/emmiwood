import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function sqlValue(value) {
  if (value == null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

class D1Statement {
  constructor(db, sql, values = []) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new D1Statement(this.db, this.sql, values);
  }

  toSql() {
    let offset = 0;
    return this.sql.replace(/\?/g, () => sqlValue(this.values[offset++]));
  }

  async run() {
    this.db.metrics.run += 1;
    this.db.exec(this.toSql());
    return { meta: { changes: 1 } };
  }

  async first() {
    this.db.metrics.first += 1;
    return this.db.query(this.toSql())[0] || null;
  }

  async all() {
    this.db.metrics.all += 1;
    return { results: this.db.query(this.toSql()) };
  }
}

export class EmmiwoodTestD1 {
  constructor() {
    this.directory = mkdtempSync(join(tmpdir(), 'emmiwood-d1-'));
    this.path = join(this.directory, 'test.sqlite');
    this.resetMetrics();
  }

  resetMetrics() {
    this.metrics = { first: 0, all: 0, run: 0, batch: 0 };
  }

  operationCount() {
    return Object.values(this.metrics).reduce((total, count) => total + count, 0);
  }

  prepare(sql) {
    return new D1Statement(this, sql);
  }

  exec(sql) {
    execFileSync('sqlite3', ['-bail', this.path], {
      input: `PRAGMA foreign_keys=ON;\n${sql}`,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  query(sql) {
    const output = execFileSync('sqlite3', ['-json', this.path, sql], { encoding: 'utf8' });
    return output.trim() ? JSON.parse(output) : [];
  }

  async batch(statements) {
    this.exec(`BEGIN IMMEDIATE;\n${statements.map((statement) => `${statement.toSql()};`).join('\n')}\nCOMMIT;`);
    return statements.map(() => ({ meta: { changes: 1 } }));
  }

  close() {
    rmSync(this.directory, { recursive: true, force: true });
  }
}

export function setupEmmiwoodTestD1() {
  const db = new EmmiwoodTestD1();
  db.exec(readFileSync(`${ROOT}migrations/0001_booking.sql`, 'utf8'));
  db.exec(readFileSync(`${ROOT}migrations/0002_launch_copy.sql`, 'utf8'));
  db.exec(readFileSync(`${ROOT}migrations/0003_production_hardening.sql`, 'utf8'));
  db.exec(readFileSync(`${ROOT}migrations/0004_auth_source_limits.sql`, 'utf8'));
  db.exec(readFileSync(`${ROOT}migrations/0005_pricing_and_copy.sql`, 'utf8'));
  db.exec(readFileSync(`${ROOT}migrations/0006_admin_phone.sql`, 'utf8'));
  return db;
}
