import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPagesDevSupervisor,
  e2ePort,
  maxWranglerRestarts,
  shouldRestartWrangler,
  wranglerPagesDevArgs,
} from './e2e-pages-dev.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('wranglerPagesDevArgs keep isolated preview bindings and persist-to state', () => {
  assert.deepEqual(wranglerPagesDevArgs({ EMMIWOOD_E2E_PORT: '8790' }), [
    'pages',
    'dev',
    './static',
    '--cwd',
    '.deploy/pages',
    '--persist-to',
    'state',
    '--port',
    '8790',
    '--binding',
    'ENVIRONMENT=preview',
    '--binding',
    'EMMIWOOD_PUBLIC_ORIGIN=http://localhost:8790',
    '--binding',
    'EMMIWOOD_BOOKING_WRITES_ENABLED=true',
    '--binding',
    'EMMIWOOD_NOTIFICATIONS_ENABLED=false',
    '--binding',
    'EMMIWOOD_SHOP_ADMIN_SMS_FANOUT=false',
  ]);
  assert.equal(e2ePort({}), '8788');
  assert.throws(() => e2ePort({ EMMIWOOD_E2E_PORT: 'nope' }), /numeric TCP port/);
});

test('shouldRestartWrangler stops on shutdown and after the restart budget', () => {
  assert.equal(shouldRestartWrangler({ shuttingDown: true, restartCount: 0, maxRestarts: 3 }), false);
  assert.equal(shouldRestartWrangler({ shuttingDown: false, restartCount: 3, maxRestarts: 3 }), false);
  assert.equal(shouldRestartWrangler({ shuttingDown: false, restartCount: 2, maxRestarts: 3 }), true);
  assert.equal(maxWranglerRestarts({}), 3);
  assert.equal(maxWranglerRestarts({ EMMIWOOD_E2E_WRANGLER_RESTARTS: '1' }), 1);
  assert.throws(() => maxWranglerRestarts({ EMMIWOOD_E2E_WRANGLER_RESTARTS: '-1' }), /non-negative integer/);
});

test('createPagesDevSupervisor restarts wrangler after an unexpected exit then stops on SIGTERM', async () => {
  const spawned = [];
  const logs = [];
  const exits = [];
  const timers = [];

  function spawnFn(bin, args) {
    const child = new EventEmitter();
    child.killed = false;
    child.kill = (signal) => {
      child.killed = true;
      child.emit('exit', null, signal);
    };
    spawned.push({ bin, args, child });
    return child;
  }

  const supervisor = createPagesDevSupervisor({
    spawnFn,
    wranglerBin: '/tmp/wrangler',
    cwd: '/tmp',
    env: { EMMIWOOD_E2E_PORT: '8788', EMMIWOOD_E2E_WRANGLER_RESTARTS: '2' },
    stdio: 'ignore',
    restartDelayMs: 0,
    log: (message) => logs.push(message),
    exitProcess: (code) => exits.push(code),
    setTimer: (fn) => {
      timers.push(fn);
      fn();
      return 1;
    },
  });

  supervisor.start();
  assert.equal(spawned.length, 1);
  spawned[0].child.emit('exit', 1, null);
  assert.equal(spawned.length, 2);
  assert.match(logs[0], /restart 1\/2/);
  supervisor.shutdown('SIGTERM');
  assert.equal(spawned[1].child.killed, true);
  assert.equal(exits.at(-1), 0);
  assert.equal(supervisor.restartCount, 1);
});

test('dev:e2e and Playwright configs keep the wrangler supervisor on the isolated artifact', () => {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['dev:e2e'], /e2e:prepare && node scripts\/e2e-pages-dev\.mjs$/);
  assert.match(pkg.scripts['test:release'], /scripts\/e2e-pages-dev\.test\.mjs/);
  const playwright = readFileSync(resolve(root, 'playwright.config.ts'), 'utf8');
  const cross = readFileSync(resolve(root, 'playwright.cross-browser.config.ts'), 'utf8');
  assert.match(playwright, /retries: process\.env\.CI \? 2 : 0/);
  assert.match(cross, /retries: process\.env\.CI \? 2 : 0/);
  for (const spec of [
    'tests/emmiwood.spec.ts',
    'tests/emmiwood.audit.spec.ts',
    'tests/emmiwood.booking-audit.spec.ts',
    'tests/emmiwood.admin-audit.spec.ts',
    'tests/emmiwood.cross-browser.spec.ts',
  ]) {
    assert.match(readFileSync(resolve(root, spec), 'utf8'), /from '\.\/e2e-server-ready'/);
  }
  assert.doesNotMatch(
    readFileSync(resolve(root, 'tests/emmiwood.live.spec.ts'), 'utf8'),
    /e2e-server-ready/,
  );
});
