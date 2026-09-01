import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const deployRoot = join(root, '.deploy', 'pages');
const staticRoot = join(deployRoot, 'static');
const functionsRoot = join(deployRoot, 'functions');
const stateRoot = join(deployRoot, 'state');
const e2ePort = process.env.EMMIWOOD_E2E_PORT || '8788';
if (!/^\d{2,5}$/.test(e2ePort)) throw new Error('EMMIWOOD_E2E_PORT must be a numeric TCP port');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
}

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

run('npm', ['run', 'build']);

const sourceConfig = await readFile(join(root, 'wrangler.toml'), 'utf8');
const compatibilityDate = sourceConfig.match(/^compatibility_date\s*=\s*"([^"]+)"/m)?.[1];
const databaseId = sourceConfig.match(/^database_id\s*=\s*"([^"]+)"/m)?.[1];
if (!compatibilityDate || !databaseId) throw new Error('wrangler.toml is missing the compatibility date or D1 database id');

await rm(deployRoot, { recursive: true, force: true });
await mkdir(deployRoot, { recursive: true });
await cp(join(root, 'client', 'dist'), staticRoot, { recursive: true });
await cp(join(root, 'functions'), functionsRoot, { recursive: true });
await cp(join(root, 'migrations'), join(deployRoot, 'migrations'), { recursive: true });
await writeFile(join(deployRoot, 'wrangler.toml'), `name = "emmiwood-e2e"
compatibility_date = "${compatibilityDate}"
pages_build_output_dir = "static"

[[d1_databases]]
binding = "DB"
database_name = "emmiwood-db"
database_id = "${databaseId}"
migrations_dir = "migrations"

[vars]
ENVIRONMENT = "preview"
EMMIWOOD_PUBLIC_ORIGIN = "http://localhost:${e2ePort}"
EMMIWOOD_BOOKING_WRITES_ENABLED = "true"
EMMIWOOD_NOTIFICATIONS_ENABLED = "false"
EMMIWOOD_SHOP_ADMIN_SMS_FANOUT = "false"
`);

const artifactFiles = [
  ...await filesUnder(staticRoot),
  ...await filesUnder(functionsRoot),
];
const manifest = [];
for (const path of artifactFiles) {
  const bytes = await readFile(path);
  const metadata = await stat(path);
  manifest.push({
    path: relative(deployRoot, path),
    bytes: metadata.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
function gitOutput(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Cannot establish artifact source identity');
  return result.stdout.trim();
}
const source = {
  head: gitOutput(['rev-parse', 'HEAD']),
  branch: gitOutput(['branch', '--show-current']),
  dirty: Boolean(gitOutput(['status', '--porcelain'])),
};
await writeFile(
  join(deployRoot, 'artifact-manifest.json'),
  `${JSON.stringify({ schemaVersion: 1, source, files: manifest }, null, 2)}\n`,
);

run(join(root, 'node_modules', '.bin', 'wrangler'), [
  'd1', 'migrations', 'apply', 'emmiwood-db', '--cwd', deployRoot, '--local', '--persist-to', stateRoot,
]);

console.log(`Prepared isolated Pages artifact: ${manifest.length} files`);
