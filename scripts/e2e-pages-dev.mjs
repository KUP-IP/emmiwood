#!/usr/bin/env node
/**
 * Keep `wrangler pages dev` alive for exact-artifact Playwright.
 * GitHub Actions has seen empty wrangler ERROR then process death, which
 * surfaces as Playwright net::ERR_CONNECTION_REFUSED on localhost:8788.
 */
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export function e2ePort(env = process.env) {
  const port = env.EMMIWOOD_E2E_PORT || '8788';
  if (!/^\d{2,5}$/.test(port)) throw new Error('EMMIWOOD_E2E_PORT must be a numeric TCP port');
  return port;
}

export function wranglerPagesDevArgs(env = process.env) {
  const port = e2ePort(env);
  return [
    'pages',
    'dev',
    './static',
    '--cwd',
    '.deploy/pages',
    '--persist-to',
    'state',
    '--port',
    port,
    '--binding',
    'ENVIRONMENT=preview',
    '--binding',
    `EMMIWOOD_PUBLIC_ORIGIN=http://localhost:${port}`,
    '--binding',
    'EMMIWOOD_BOOKING_WRITES_ENABLED=true',
    '--binding',
    'EMMIWOOD_NOTIFICATIONS_ENABLED=false',
    '--binding',
    'EMMIWOOD_SHOP_ADMIN_SMS_FANOUT=false',
  ];
}

export function maxWranglerRestarts(env = process.env) {
  const raw = env.EMMIWOOD_E2E_WRANGLER_RESTARTS;
  if (raw == null || raw === '') return 3;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error('EMMIWOOD_E2E_WRANGLER_RESTARTS must be a non-negative integer');
  return value;
}

export function shouldRestartWrangler({ shuttingDown, restartCount, maxRestarts }) {
  if (shuttingDown) return false;
  return restartCount < maxRestarts;
}

export function createPagesDevSupervisor({
  spawnFn = spawn,
  wranglerBin = join(root, 'node_modules', '.bin', 'wrangler'),
  cwd = root,
  env = process.env,
  stdio = 'inherit',
  restartDelayMs = 500,
  now = Date.now,
  log = console.error,
  exitProcess = (code) => process.exit(code),
  setTimer = setTimeout,
} = {}) {
  let shuttingDown = false;
  let restartCount = 0;
  let child = null;
  let restartTimer = null;
  const maxRestarts = maxWranglerRestarts(env);
  const args = wranglerPagesDevArgs(env);

  function start() {
    child = spawnFn(wranglerBin, args, { cwd, env, stdio });
    child.on('exit', (code, signal) => {
      child = null;
      if (shuttingDown) {
        exitProcess(0);
        return;
      }
      if (!shouldRestartWrangler({ shuttingDown: false, restartCount, maxRestarts })) {
        exitProcess(code || 1);
        return;
      }
      restartCount += 1;
      log(`[e2e-pages-dev] wrangler exited code=${code ?? 'null'} signal=${signal ?? 'null'}; restart ${restartCount}/${maxRestarts} at ${now()}`);
      restartTimer = setTimer(start, restartDelayMs);
    });
  }

  function shutdown(signal = 'SIGTERM') {
    shuttingDown = true;
    if (restartTimer) clearTimeout(restartTimer);
    if (child && !child.killed) child.kill(signal);
    else exitProcess(0);
  }

  return {
    start,
    shutdown,
    get child() {
      return child;
    },
    get restartCount() {
      return restartCount;
    },
  };
}

const invokedDirectly = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  const supervisor = createPagesDevSupervisor();
  process.on('SIGTERM', () => supervisor.shutdown('SIGTERM'));
  process.on('SIGINT', () => supervisor.shutdown('SIGINT'));
  supervisor.start();
}
