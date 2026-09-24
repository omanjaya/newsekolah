#!/usr/bin/env bash
# Restores Postgres (and optionally the MinIO bucket) from a backup produced
# by backup.sh. Destructive: always confirms before writing, unless --dry-run
# is given, in which case it only prints what it would do.
#
# Usage:
#   restore.sh [--dry-run] [--yes] [--with-storage] <postgres-object-key>
#
# <postgres-object-key> is the object path under target/${BACKUP_S3_BUCKET}/postgres/,
# e.g. postgres-20260101T020000Z.dump or postgres-20260101T020000Z.dump.age.
#
# Required env: DATABASE_URL, BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET,
#   BACKUP_S3_ACCESS_KEY, BACKUP_S3_SECRET_KEY.
# Optional env (only needed with --with-storage): S3_ENDPOINT, S3_ACCESS_KEY,
#   S3_SECRET_KEY, S3_BUCKET. AGE_IDENTITY_FILE is required to decrypt an
#   age-encrypted dump.
set -euo pipefail

DRY_RUN=0
ASSUME_YES=0
WITH_STORAGE=0
POSTGRES_OBJECT=""

usage() {
    grep '^#' "$0" | sed '1d;s/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run) DRY_RUN=1; shift ;;
        --yes) ASSUME_YES=1; shift ;;
        --with-storage) WITH_STORAGE=1; shift ;;
        -h|--help) usage; exit 0 ;;
        *)
            if [[ -n "$POSTGRES_OBJECT" ]]; then
                echo "error: unexpected argument: $1" >&2
                exit 1
            fi
            POSTGRES_OBJECT="$1"
            shift
            ;;
    esac
done

[[ -n "$POSTGRES_OBJECT" ]] || { usage; exit 1; }

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_S3_ENDPOINT:?BACKUP_S3_ENDPOINT is required}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"
: "${BACKUP_S3_ACCESS_KEY:?BACKUP_S3_ACCESS_KEY is required}"
: "${BACKUP_S3_SECRET_KEY:?BACKUP_S3_SECRET_KEY is required}"

if [[ "$WITH_STORAGE" -eq 1 ]]; then
    : "${S3_ENDPOINT:?S3_ENDPOINT is required with --with-storage}"
    : "${S3_ACCESS_KEY:?S3_ACCESS_KEY is required with --with-storage}"
    : "${S3_SECRET_KEY:?S3_SECRET_KEY is required with --with-storage}"
    : "${S3_BUCKET:?S3_BUCKET is required with --with-storage}"
fi

WORK_DIR="$(mktemp -d)"
log() { printf '==> %s\n' "$1" >&2; }
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

confirm() {
    [[ "$ASSUME_YES" -eq 1 ]] && return 0
    local reply
    read -r -p "This overwrites the current database$( [[ "$WITH_STORAGE" -eq 1 ]] && echo " and object storage" ). Type 'yes' to continue: " reply
    [[ "$reply" == "yes" ]]
}

setup_mc_aliases() {
    mc alias set target "$BACKUP_S3_ENDPOINT" "$BACKUP_S3_ACCESS_KEY" "$BACKUP_S3_SECRET_KEY" >/dev/null
    if [[ "$WITH_STORAGE" -eq 1 ]]; then
        mc alias set source "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null
    fi
}

fetch_dump() {
    local remote="target/${BACKUP_S3_BUCKET}/postgres/${POSTGRES_OBJECT}"
    local local_path="${WORK_DIR}/${POSTGRES_OBJECT}"

    log "downloading ${remote}"
    if [[ "$DRY_RUN" -eq 1 ]]; then
        log "[dry-run] mc cp ${remote} ${local_path}"
        return
    fi
    mc cp "$remote" "$local_path"

    if [[ "$POSTGRES_OBJECT" == *.age ]]; then
        : "${AGE_IDENTITY_FILE:?AGE_IDENTITY_FILE is required to decrypt an age-encrypted dump}"
        log "decrypting ${POSTGRES_OBJECT}"
        age --decrypt -i "$AGE_IDENTITY_FILE" -o "${local_path%.age}" "$local_path"
        local_path="${local_path%.age}"
    fi

    echo "$local_path"
}

restore_postgres() {
    local dump_path="$1"

    if [[ "$DRY_RUN" -eq 1 ]]; then
        log "[dry-run] pg_restore --clean --if-exists --no-owner --dbname \$DATABASE_URL ${dump_path:-<dump>}"
        return
    fi

    log "restoring Postgres from ${dump_path}"
    pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" "$dump_path"
}

smoke_check_postgres() {
    if [[ "$DRY_RUN" -eq 1 ]]; then
        log "[dry-run] psql \$DATABASE_URL -c 'select ...' (connectivity, tenants/users counts, schema_migrations.dirty)"
        return
    fi

    log "smoke-checking restored database"

    local psql_out
    if ! psql_out="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -tAc "select 1" 2>&1)"; then
        echo "SMOKE CHECK FAILED: could not connect to the restored database: ${psql_out}" >&2
        exit 1
    fi

    local tenant_count
    if ! tenant_count="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -tAc "select count(*) from tenants" 2>&1)"; then
        echo "SMOKE CHECK FAILED: could not count rows in tenants: ${tenant_count}" >&2
        exit 1
    fi
    if [[ "$tenant_count" -eq 0 ]]; then
        echo "SMOKE CHECK FAILED: tenants table is empty after restore -- the dump did not bring back tenant data" >&2
        exit 1
    fi
    log "tenants: ${tenant_count} row(s)"

    local user_count
    if ! user_count="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -tAc "select count(*) from users" 2>&1)"; then
        echo "SMOKE CHECK FAILED: could not count rows in users: ${user_count}" >&2
        exit 1
    fi
    if [[ "$user_count" -eq 0 ]]; then
        echo "SMOKE CHECK FAILED: users table is empty after restore -- the dump did not bring back user data" >&2
        exit 1
    fi
    log "users: ${user_count} row(s)"

    local dirty
    if ! dirty="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -tAc "select dirty from schema_migrations" 2>&1)"; then
        echo "SMOKE CHECK FAILED: could not read schema_migrations.dirty: ${dirty}" >&2
        exit 1
    fi
    if [[ "$dirty" == "t" ]]; then
        echo "SMOKE CHECK FAILED: schema_migrations.dirty is true -- the restored schema is left mid-migration, do not point traffic at this database" >&2
        exit 1
    fi
    log "schema_migrations: not dirty"

    log "smoke check passed"
}

restore_storage() {
    if [[ "$WITH_STORAGE" -ne 1 ]]; then
        return
    fi

    if [[ "$DRY_RUN" -eq 1 ]]; then
        log "[dry-run] mc mirror --overwrite target/${BACKUP_S3_BUCKET}/minio/${S3_BUCKET} source/${S3_BUCKET}"
        return
    fi

    log "restoring object storage from target/${BACKUP_S3_BUCKET}/minio/${S3_BUCKET}"
    mc mirror --overwrite "target/${BACKUP_S3_BUCKET}/minio/${S3_BUCKET}" "source/${S3_BUCKET}"
}

main() {
    setup_mc_aliases

    if [[ "$DRY_RUN" -eq 0 ]]; then
        confirm || { echo "aborted"; exit 1; }
    fi

    local dump_path
    dump_path="$(fetch_dump)"
    restore_postgres "$dump_path"
    smoke_check_postgres
    restore_storage
    log "restore complete"
}

main "$@"
