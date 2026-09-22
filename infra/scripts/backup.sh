#!/usr/bin/env bash
# Dumps Postgres and mirrors the MinIO bucket to an offsite S3-compatible
# target, encrypting the Postgres dump with age before it ever leaves this
# host. Runs inside the backup sidecar container on BACKUP_CRON_SCHEDULE, or
# manually via `docker compose exec backup /usr/local/bin/backup.sh`.
#
# Required env: DATABASE_URL, S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY,
#   S3_BUCKET, BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY,
#   BACKUP_S3_SECRET_KEY, BACKUP_AGE_RECIPIENT (age public key the Postgres
#   dump is encrypted to before upload -- this script refuses to run
#   without it rather than upload an unencrypted dump of every student's
#   data to an offsite bucket).
# Optional env: BACKUP_RETENTION_DAYS (default 30).
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${S3_ENDPOINT:?S3_ENDPOINT is required}"
: "${S3_ACCESS_KEY:?S3_ACCESS_KEY is required}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY is required}"
: "${S3_BUCKET:?S3_BUCKET is required}"
: "${BACKUP_S3_ENDPOINT:?BACKUP_S3_ENDPOINT is required}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"
: "${BACKUP_S3_ACCESS_KEY:?BACKUP_S3_ACCESS_KEY is required}"
: "${BACKUP_S3_SECRET_KEY:?BACKUP_S3_SECRET_KEY is required}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is required: refusing to upload an unencrypted Postgres dump. Generate a keypair with 'age-keygen' and set the public key here.}"

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
WORK_DIR="$(mktemp -d)"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

log() { printf '==> %s\n' "$1"; }

cleanup() {
    rm -rf "$WORK_DIR"
}
trap cleanup EXIT

setup_mc_aliases() {
    mc alias set source "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null
    mc alias set target "$BACKUP_S3_ENDPOINT" "$BACKUP_S3_ACCESS_KEY" "$BACKUP_S3_SECRET_KEY" >/dev/null
}

dump_postgres() {
    local dump_file="$WORK_DIR/postgres-${TIMESTAMP}.dump"
    log "dumping Postgres to ${dump_file}"
    pg_dump --format=custom --file="$dump_file" "$DATABASE_URL"

    log "encrypting dump for recipient ${BACKUP_AGE_RECIPIENT}"
    age -r "$BACKUP_AGE_RECIPIENT" -o "${dump_file}.age" "$dump_file"
    rm -f "$dump_file"
    dump_file="${dump_file}.age"

    log "uploading $(basename "$dump_file") to target/${BACKUP_S3_BUCKET}/postgres/"
    mc cp "$dump_file" "target/${BACKUP_S3_BUCKET}/postgres/$(basename "$dump_file")"
}

mirror_object_storage() {
    log "mirroring source/${S3_BUCKET} to target/${BACKUP_S3_BUCKET}/minio/"
    mc mirror --overwrite --remove \
        "source/${S3_BUCKET}" "target/${BACKUP_S3_BUCKET}/minio/${S3_BUCKET}"
}

apply_retention() {
    log "pruning backups older than ${RETENTION_DAYS} days"
    mc rm --recursive --force --older-than "${RETENTION_DAYS}d" \
        "target/${BACKUP_S3_BUCKET}/postgres/" || true
}

main() {
    setup_mc_aliases
    dump_postgres
    mirror_object_storage
    apply_retention
    log "backup complete"
}

main "$@"
