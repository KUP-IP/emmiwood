#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REHEARSAL_DIR="$(mktemp -d "${TMPDIR:-/tmp}/emmiwood-migration-rehearsal.XXXXXX")"
STATE_DIR="$REHEARSAL_DIR/state"
MIGRATIONS_DIR="$REHEARSAL_DIR/migrations"
WRANGLER="$ROOT_DIR/node_modules/.bin/wrangler"

cleanup() {
  exit_code=$?
  trap - EXIT
  rm -rf "$REHEARSAL_DIR"
  exit "$exit_code"
}
trap cleanup EXIT

mkdir -p "$MIGRATIONS_DIR"
cp "$ROOT_DIR/wrangler.toml" "$REHEARSAL_DIR/wrangler.toml"

for migration in "$ROOT_DIR"/migrations/*.sql; do
  name="$(basename "$migration")"
  prefix="${name%%_*}"
  if (( 10#$prefix <= 12 )); then
    cp "$migration" "$MIGRATIONS_DIR/$name"
  fi
done

if ! (
  cd "$REHEARSAL_DIR"
  "$WRANGLER" d1 migrations apply emmiwood-db --local --persist-to "$STATE_DIR"
) >"$REHEARSAL_DIR/base-apply.log" 2>&1; then
  tail -80 "$REHEARSAL_DIR/base-apply.log" >&2
  exit 1
fi

DB_FILE="$(find "$STATE_DIR" -type f -name '*.sqlite' ! -name 'metadata.sqlite' | head -1)"
if [[ -z "$DB_FILE" ]]; then
  echo "migration_rehearsal=FAIL reason=database_file_missing" >&2
  exit 1
fi

BACKUP_FILE="$REHEARSAL_DIR/pre-emmiwood.sqlite"
sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"

logical_database_hash() {
  sqlite3 "$1" .dump | shasum -a 256 | awk '{print $1}'
}

non_emmiwood_schema_hash() {
  sqlite3 "$DB_FILE" "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND tbl_name NOT LIKE 'emmiwood_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%' ORDER BY type,name;" | shasum -a 256 | awk '{print $1}'
}

BEFORE_SCHEMA_HASH="$(non_emmiwood_schema_hash)"
BEFORE_DATABASE_HASH="$(logical_database_hash "$DB_FILE")"
BASE_MIGRATION_COUNT="$(sqlite3 "$DB_FILE" 'SELECT count(*) FROM d1_migrations;')"

EMMIWOOD_MIGRATIONS=(
  "0001_booking.sql"
  "0002_launch_copy.sql"
  "0003_production_hardening.sql"
  "0004_auth_source_limits.sql"
  "0005_pricing_and_copy.sql"
)

UNEXPECTED_EMMIWOOD_MIGRATIONS=()
for migration in "$ROOT_DIR"/migrations/*.sql; do
  name="$(basename "$migration")"
  if [[ "$name" =~ ^[0-9]{4}_emmiwood_ ]] && [[ ! " ${EMMIWOOD_MIGRATIONS[*]} " =~ " $name " ]]; then
    UNEXPECTED_EMMIWOOD_MIGRATIONS+=("$name")
  fi
done
if (( ${#UNEXPECTED_EMMIWOOD_MIGRATIONS[@]} > 0 )); then
  echo "migration_rehearsal=FAIL reason=unexpected_emmiwood_migrations names=${UNEXPECTED_EMMIWOOD_MIGRATIONS[*]}" >&2
  exit 1
fi

for name in "${EMMIWOOD_MIGRATIONS[@]}"; do
  migration="$ROOT_DIR/migrations/$name"
  if [[ ! -f "$migration" ]]; then
    echo "migration_rehearsal=FAIL reason=required_migration_missing name=$name" >&2
    exit 1
  fi
  cp "$migration" "$MIGRATIONS_DIR/$name"
done
EMMIWOOD_MIGRATION_COUNT=${#EMMIWOOD_MIGRATIONS[@]}

if ! (
  cd "$REHEARSAL_DIR"
  "$WRANGLER" d1 migrations apply emmiwood-db --local --persist-to "$STATE_DIR"
) >"$REHEARSAL_DIR/emmiwood-apply.log" 2>&1; then
  tail -80 "$REHEARSAL_DIR/emmiwood-apply.log" >&2
  exit 1
fi

SECOND_OUTPUT="$(
  cd "$REHEARSAL_DIR"
  "$WRANGLER" d1 migrations apply emmiwood-db --local --persist-to "$STATE_DIR" 2>&1
)"

AFTER_SCHEMA_HASH="$(non_emmiwood_schema_hash)"
FINAL_MIGRATION_COUNT="$(sqlite3 "$DB_FILE" 'SELECT count(*) FROM d1_migrations;')"
EMMIWOOD_TABLE_COUNT="$(sqlite3 "$DB_FILE" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name LIKE 'emmiwood_%';")"
EMMIWOOD_INDEX_COUNT="$(sqlite3 "$DB_FILE" "SELECT count(*) FROM sqlite_master WHERE type='index' AND name IN ('idx_emmiwood_appointments_schedule','idx_emmiwood_time_claims_appointment','idx_emmiwood_login_challenges_admin_created','idx_emmiwood_notification_outbox_delivery','idx_emmiwood_auth_rate_limits_window');")"
SERVICE_COUNT="$(sqlite3 "$DB_FILE" "SELECT count(*) FROM emmiwood_services WHERE shop_id='emmiwood';")"
BARBER_COUNT="$(sqlite3 "$DB_FILE" "SELECT count(*) FROM emmiwood_barbers WHERE shop_id='emmiwood';")"
OWNER_COUNT="$(sqlite3 "$DB_FILE" "SELECT count(*) FROM emmiwood_admins WHERE shop_id='emmiwood' AND role='owner' AND active=1;")"
ELIGIBILITY_COUNT="$(sqlite3 "$DB_FILE" 'SELECT count(*) FROM emmiwood_barber_services;')"
AVAILABILITY_COUNT="$(sqlite3 "$DB_FILE" 'SELECT count(*) FROM emmiwood_availability WHERE active=1;')"
LAUNCH_COPY_COUNT="$(sqlite3 "$DB_FILE" "SELECT count(*) FROM emmiwood_services WHERE description IN ('A tailored cut or fade, neckline cleanup, and finished style.','A full haircut with beard shaping, clean lines, and one balanced finish.','Shape, weight control, clean lines, and a conditioning finish.','A precise edge-up and neckline cleanup between full cuts.','A patient, polished cut for guests age twelve and under.');")"
PRICE_LOCK_COUNT="$(sqlite3 "$DB_FILE" "SELECT count(*) FROM emmiwood_services WHERE (id='signature' AND price_cents=3500) OR (id='hair-beard' AND price_cents=5000) OR (id='beard' AND price_cents=2500) OR (id='lineup' AND price_cents=1500) OR (id='young' AND price_cents=3000);")"

[[ "$BEFORE_SCHEMA_HASH" == "$AFTER_SCHEMA_HASH" ]]
[[ "$FINAL_MIGRATION_COUNT" -eq $((BASE_MIGRATION_COUNT + EMMIWOOD_MIGRATION_COUNT)) ]]
[[ "$EMMIWOOD_TABLE_COUNT" -eq 15 ]]
[[ "$EMMIWOOD_INDEX_COUNT" -eq 5 ]]
[[ "$SERVICE_COUNT" -eq 5 ]]
[[ "$BARBER_COUNT" -eq 2 ]]
[[ "$OWNER_COUNT" -eq 1 ]]
[[ "$ELIGIBILITY_COUNT" -eq 10 ]]
[[ "$AVAILABILITY_COUNT" -eq 15 ]]
[[ "$LAUNCH_COPY_COUNT" -eq 5 ]]
[[ "$PRICE_LOCK_COUNT" -eq 5 ]]
grep -q "No migrations to apply" <<<"$SECOND_OUTPUT"

cp "$BACKUP_FILE" "$DB_FILE"
RESTORED_DATABASE_HASH="$(logical_database_hash "$DB_FILE")"
RESTORED_MIGRATION_COUNT="$(sqlite3 "$DB_FILE" 'SELECT count(*) FROM d1_migrations;')"
RESTORED_EMMIWOOD_TABLE_COUNT="$(sqlite3 "$DB_FILE" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name LIKE 'emmiwood_%';")"

[[ -s "$BACKUP_FILE" ]]
[[ "$RESTORED_DATABASE_HASH" == "$BEFORE_DATABASE_HASH" ]]
[[ "$RESTORED_MIGRATION_COUNT" -eq "$BASE_MIGRATION_COUNT" ]]
[[ "$RESTORED_EMMIWOOD_TABLE_COUNT" -eq 0 ]]

echo "migration_rehearsal=PASS"
echo "backup_rehearsal=PASS rollback_restore_rehearsal=PASS"
echo "base_migrations=$BASE_MIGRATION_COUNT final_migrations=$FINAL_MIGRATION_COUNT second_apply=no_migrations"
echo "emmiwood_tables=$EMMIWOOD_TABLE_COUNT named_indexes=$EMMIWOOD_INDEX_COUNT services=$SERVICE_COUNT barbers=$BARBER_COUNT owner_admins=$OWNER_COUNT eligibility=$ELIGIBILITY_COUNT availability=$AVAILABILITY_COUNT launch_copy=$LAUNCH_COPY_COUNT pricing_lock=$PRICE_LOCK_COUNT"
echo "non_emmiwood_schema_hash_before=$BEFORE_SCHEMA_HASH"
echo "non_emmiwood_schema_hash_after=$AFTER_SCHEMA_HASH"
echo "pre_migration_database_hash=$BEFORE_DATABASE_HASH"
echo "restored_database_hash=$RESTORED_DATABASE_HASH restored_migrations=$RESTORED_MIGRATION_COUNT restored_emmiwood_tables=$RESTORED_EMMIWOOD_TABLE_COUNT"
echo "database_scope=disposable_local_d1 production_touched=false"
