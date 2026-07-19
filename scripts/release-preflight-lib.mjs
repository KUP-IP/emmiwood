export const REQUIRED_EMMIWOOD_MIGRATIONS = Object.freeze([
  '0001_booking.sql',
  '0002_launch_copy.sql',
  '0003_production_hardening.sql',
  '0004_auth_source_limits.sql',
  '0005_pricing_and_copy.sql',
]);

export const REQUIRED_PRODUCTION_SECRETS = Object.freeze([
  'EMMIWOOD_NOTIFICATION_SECRET',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
  'RESEND_API_KEY',
  'EMAIL_FROM',
]);

export const REQUIRED_ACTION_SECRETS = Object.freeze([
  'EMMIWOOD_NOTIFICATION_SECRET',
]);

export const NOTIFICATION_SCHEDULER_VARIABLE = 'EMMIWOOD_NOTIFICATIONS_ENABLED';
export const NOTIFICATION_WORKFLOW_PATH = '.github/workflows/notifications.yml';
export const NOTIFICATION_PROCESSOR_VARIABLE = 'EMMIWOOD_NOTIFICATION_URL';

export const EXPECTED_PRODUCTION_RESOURCE = Object.freeze({
  pagesProject: 'emmiwood',
  databaseName: 'emmiwood-db',
});

export function parsePendingMigrations(output = '') {
  const names = output.match(/\b\d{4}_[A-Za-z0-9._-]+\.sql\b/g) || [];
  return [...new Set(names)];
}

export function parseSecretNames(output = '') {
  return [...output.matchAll(/^\s*-\s+([A-Z][A-Z0-9_]+):/gm)].map((match) => match[1]);
}

export function parseNameColumn(output = '') {
  return output.split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter((name) => /^[A-Z][A-Z0-9_]+$/.test(name || ''));
}

export function parseActionVariables(output = '') {
  const variables = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Z][A-Z0-9_]+)\s+(\S+)/);
    if (match) variables[match[1]] = match[2];
  }
  return variables;
}

export function validateNotificationWorkflow(source = '') {
  const errors = [];
  const requirements = [
    [/name:\s*Emmiwood notification heartbeat/, 'workflow name'],
    [/schedule:\s*[\s\S]*cron:\s*["']?\*\/5 \* \* \* \*["']?/, 'five-minute cron'],
    [/workflow_dispatch:/, 'manual dispatch'],
    [/notification_id:/, 'exact notification id input'],
    [/process:/, 'explicit processing input'],
    [/vars\.EMMIWOOD_NOTIFICATION_URL/, 'processor URL variable'],
    [/secrets\.EMMIWOOD_NOTIFICATION_SECRET/, 'GitHub Actions processor secret'],
    [/vars\.EMMIWOOD_NOTIFICATIONS_ENABLED\s*==\s*['"]true['"]/, 'disabled-by-default scheduler variable gate'],
    [/github\.event_name\s*==\s*['"]schedule['"]/, 'scheduled processing event gate'],
    [/github\.event_name\s*==\s*['"]workflow_dispatch['"][\s\S]*inputs\.process\s*==\s*true/, 'manual processing gate'],
    [/\?id=\$encoded_id/, 'exact-id processor query'],
    [/\$value\|@uri/, 'notification id URL encoding'],
    [/-X POST/, 'processor POST invocation'],
    [/Probe production notification readiness/, 'readiness heartbeat'],
    [/cancel-in-progress:\s*false/, 'non-overlapping concurrency policy'],
    [/\.data\.processed\s*==\s*1/, 'exactly-one synthetic smoke assertion'],
    [/providerMessageId/, 'provider acceptance visibility'],
  ];
  for (const [pattern, label] of requirements) {
    if (!pattern.test(source)) errors.push(`notification workflow missing ${label}`);
  }

  const scheduledBlock = source.match(/- name: Process scheduled notification queue([\s\S]*?)(?=\n\s*- name:|$)/)?.[1] || '';
  const manualBlock = source.match(/- name: Process one approved synthetic notification([\s\S]*?)(?=\n\s*- name:|$)/)?.[1] || '';
  if (/--retry(?:\s|$)|--retry-all-errors/.test(scheduledBlock)) errors.push('scheduled notification POST must not retry automatically');
  if (/--retry(?:\s|$)|--retry-all-errors/.test(manualBlock)) errors.push('manual notification POST must not retry automatically');
  return errors;
}

export function validateReleaseState(state) {
  const errors = [];
  const expectedSha = String(state.expectedSha || '').trim();
  const head = String(state.head || '').trim();
  const upstreamHead = String(state.upstreamHead || '').trim();
  const statusEntries = Array.isArray(state.statusEntries) ? state.statusEntries.filter(Boolean) : [];
  const committedMigrations = Array.isArray(state.committedMigrations) ? state.committedMigrations : [];
  const pendingMigrations = Array.isArray(state.pendingMigrations) ? state.pendingMigrations : [];
  const secretNames = new Set(Array.isArray(state.secretNames) ? state.secretNames : []);
  const actionSecretNames = new Set(Array.isArray(state.actionSecretNames) ? state.actionSecretNames : []);
  const actionVariables = state.actionVariables && typeof state.actionVariables === 'object' ? state.actionVariables : {};
  const schedulerState = String(state.schedulerState || 'configured');

  if (!/^[0-9a-f]{40}$/.test(expectedSha)) errors.push('expected SHA must be a full 40-character Git commit');
  if (head !== expectedSha) errors.push(`candidate HEAD ${head || '(missing)'} does not equal approved SHA ${expectedSha || '(missing)'}`);
  if (upstreamHead !== expectedSha) errors.push(`upstream HEAD ${upstreamHead || '(missing)'} does not equal approved SHA ${expectedSha || '(missing)'}`);
  if (statusEntries.length) errors.push(`candidate worktree is dirty: ${statusEntries.join(', ')}`);

  const unexpectedCommitted = committedMigrations.filter((name) => !REQUIRED_EMMIWOOD_MIGRATIONS.includes(name));
  const missingCommitted = REQUIRED_EMMIWOOD_MIGRATIONS.filter((name) => !committedMigrations.includes(name));
  if (unexpectedCommitted.length) errors.push(`unexpected committed Emmiwood migration(s): ${unexpectedCommitted.join(', ')}`);
  if (missingCommitted.length) errors.push(`required committed Emmiwood migration(s) missing: ${missingCommitted.join(', ')}`);
  if (committedMigrations.some((name) => Number.parseInt(name.slice(0, 4), 10) >= 18)) {
    errors.push('migration 0018 or later is outside the approved release');
  }

  if (JSON.stringify(pendingMigrations) !== JSON.stringify(REQUIRED_EMMIWOOD_MIGRATIONS)) {
    errors.push(`production pending migrations must be exactly ${REQUIRED_EMMIWOOD_MIGRATIONS.join(', ')}; observed ${pendingMigrations.join(', ') || '(none)'}`);
  }

  const missingSecrets = REQUIRED_PRODUCTION_SECRETS.filter((name) => !secretNames.has(name));
  if (missingSecrets.length) errors.push(`required production secret name(s) missing: ${missingSecrets.join(', ')}`);

  const missingActionSecrets = REQUIRED_ACTION_SECRETS.filter((name) => !actionSecretNames.has(name));
  if (missingActionSecrets.length) errors.push(`required GitHub Actions secret name(s) missing: ${missingActionSecrets.join(', ')}`);

  const schedulerValue = String(actionVariables[NOTIFICATION_SCHEDULER_VARIABLE] ?? '').toLowerCase();
  if (!Object.hasOwn(actionVariables, NOTIFICATION_SCHEDULER_VARIABLE)) {
    errors.push(`required GitHub Actions variable missing: ${NOTIFICATION_SCHEDULER_VARIABLE}`);
  } else if (!['true', 'false'].includes(schedulerValue)) {
    errors.push(`${NOTIFICATION_SCHEDULER_VARIABLE} must be exactly true or false; observed ${actionVariables[NOTIFICATION_SCHEDULER_VARIABLE]}`);
  }
  if (!['configured', 'disabled', 'enabled'].includes(schedulerState)) {
    errors.push(`scheduler state must be configured, disabled, or enabled; observed ${schedulerState}`);
  } else if (schedulerState === 'disabled' && schedulerValue !== 'false') {
    errors.push(`${NOTIFICATION_SCHEDULER_VARIABLE} must be false for the disabled gate`);
  } else if (schedulerState === 'enabled' && schedulerValue !== 'true') {
    errors.push(`${NOTIFICATION_SCHEDULER_VARIABLE} must be true for the enabled gate`);
  }

  errors.push(...validateNotificationWorkflow(String(state.notificationWorkflow || '')));

  const resource = state.resource || {};
  for (const [key, expected] of Object.entries(EXPECTED_PRODUCTION_RESOURCE)) {
    if (resource[key] !== expected) errors.push(`production resource ${key} must be ${expected}; observed ${resource[key] || '(missing)'}`);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(resource.databaseId || '')) || resource.databaseId === '00000000-0000-0000-0000-000000000000') {
    errors.push(`production resource databaseId must be a provisioned non-placeholder UUID; observed ${resource.databaseId || '(missing)'}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    approvedSha: expectedSha,
    migrations: [...REQUIRED_EMMIWOOD_MIGRATIONS],
    secretsVerifiedByName: [...REQUIRED_PRODUCTION_SECRETS],
    actionSecretsVerifiedByName: [...REQUIRED_ACTION_SECRETS],
    scheduler: { variable: NOTIFICATION_SCHEDULER_VARIABLE, value: schedulerValue, requiredState: schedulerState },
  };
}
