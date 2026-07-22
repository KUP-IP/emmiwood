#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REHEARSAL_DIR="$(mktemp -d "${TMPDIR:-/tmp}/emmiwood-migration-rehearsal.XXXXXX")"
STATE_DIR="$REHEARSAL_DIR/state"
WRANGLER="$ROOT_DIR/node_modules/.bin/wrangler"

cleanup() {
  code=$?
  trap - EXIT
  rm -rf "$REHEARSAL_DIR"
  exit "$code"
}
trap cleanup EXIT

command -v sqlite3 >/dev/null || { echo "migration_rehearsal=FAIL reason=sqlite3_missing" >&2; exit 1; }
[[ -x "$WRANGLER" ]] || { echo "migration_rehearsal=FAIL reason=wrangler_missing" >&2; exit 1; }

cp "$ROOT_DIR/wrangler.toml" "$REHEARSAL_DIR/wrangler.toml"
cp -R "$ROOT_DIR/migrations" "$REHEARSAL_DIR/migrations"

MIGRATION_LIST="$(find "$ROOT_DIR/migrations" -maxdepth 1 -type f -name '*.sql' -exec basename {} \; | sort | tr '\n' ' ' | sed 's/ $//')"
EXPECTED_LIST="0001_booking.sql 0002_launch_copy.sql 0003_production_hardening.sql 0004_auth_source_limits.sql 0005_pricing_and_copy.sql 0006_admin_phone.sql"
[[ "$MIGRATION_LIST" == "$EXPECTED_LIST" ]] || {
  echo "migration_rehearsal=FAIL reason=migration_set_mismatch observed=$MIGRATION_LIST" >&2
  exit 1
}

if ! (cd "$REHEARSAL_DIR" && "$WRANGLER" d1 migrations apply emmiwood-db --local --persist-to "$STATE_DIR") >"$REHEARSAL_DIR/apply.log" 2>&1; then
  tail -100 "$REHEARSAL_DIR/apply.log" >&2
  exit 1
fi

DB_FILE="$(find "$STATE_DIR" -type f -name '*.sqlite' ! -name 'metadata.sqlite' | head -1)"
[[ -n "$DB_FILE" ]] || { echo "migration_rehearsal=FAIL reason=database_file_missing" >&2; exit 1; }

hash_dump() {
  if command -v shasum >/dev/null; then
    sqlite3 "$1" .dump | shasum -a 256 | awk '{print $1}'
  else
    sqlite3 "$1" .dump | sha256sum | awk '{print $1}'
  fi
}

MIGRATION_COUNT="$(sqlite3 "$DB_FILE" 'SELECT count(*) FROM d1_migrations;')"
TABLE_COUNT="$(sqlite3 "$DB_FILE" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name LIKE 'emmiwood_%';")"
INDEX_COUNT="$(sqlite3 "$DB_FILE" "SELECT count(*) FROM sqlite_master WHERE type='index' AND name LIKE 'idx_emmiwood_%';")"
SERVICE_COUNT="$(sqlite3 "$DB_FILE" "SELECT count(*) FROM emmiwood_services WHERE shop_id='emmiwood';")"
BARBER_COUNT="$(sqlite3 "$DB_FILE" "SELECT count(*) FROM emmiwood_barbers WHERE shop_id='emmiwood';")"
OWNER_COUNT="$(sqlite3 "$DB_FILE" "SELECT count(*) FROM emmiwood_admins WHERE shop_id='emmiwood' AND role='owner' AND active=1;")"
OWNER_PHONE_COUNT="$(sqlite3 "$DB_FILE" "SELECT count(*) FROM emmiwood_admins WHERE shop_id='emmiwood' AND role='owner' AND phone IS NOT NULL AND TRIM(phone) != '';")"
ELIGIBILITY_COUNT="$(sqlite3 "$DB_FILE" 'SELECT count(*) FROM emmiwood_barber_services;')"
AVAILABILITY_COUNT="$(sqlite3 "$DB_FILE" 'SELECT count(*) FROM emmiwood_availability WHERE active=1;')"

[[ "$MIGRATION_COUNT" -eq 6 ]]
[[ "$TABLE_COUNT" -eq 15 ]]
[[ "$INDEX_COUNT" -ge 5 ]]
[[ "$SERVICE_COUNT" -eq 5 ]]
[[ "$BARBER_COUNT" -eq 2 ]]
[[ "$OWNER_COUNT" -eq 1 ]]
[[ "$OWNER_PHONE_COUNT" -eq 1 ]]
[[ "$ELIGIBILITY_COUNT" -eq 10 ]]
[[ "$AVAILABILITY_COUNT" -eq 15 ]]

BACKUP_FILE="$REHEARSAL_DIR/verified.sqlite"
sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"
VERIFIED_HASH="$(hash_dump "$DB_FILE")"

SECOND_OUTPUT="$(cd "$REHEARSAL_DIR" && "$WRANGLER" d1 migrations apply emmiwood-db --local --persist-to "$STATE_DIR" 2>&1)"
grep -q "No migrations to apply" <<<"$SECOND_OUTPUT"
[[ "$(sqlite3 "$DB_FILE" 'SELECT count(*) FROM d1_migrations;')" -eq 6 ]]

sqlite3 "$DB_FILE" "UPDATE emmiwood_shops SET name='rollback-probe' WHERE id='emmiwood';"
[[ "$(hash_dump "$DB_FILE")" != "$VERIFIED_HASH" ]]
cp "$BACKUP_FILE" "$DB_FILE"
RESTORED_HASH="$(hash_dump "$DB_FILE")"
[[ "$RESTORED_HASH" == "$VERIFIED_HASH" ]]

echo "migration_rehearsal=PASS"
echo "backup_rehearsal=PASS rollback_restore_rehearsal=PASS"
echo "migrations=$MIGRATION_COUNT tables=$TABLE_COUNT indexes=$INDEX_COUNT services=$SERVICE_COUNT barbers=$BARBER_COUNT owner_admins=$OWNER_COUNT"
echo "verified_database_hash=$VERIFIED_HASH restored_database_hash=$RESTORED_HASH"
echo "database_scope=disposable_local_d1 production_touched=false"
