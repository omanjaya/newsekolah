#!/usr/bin/env bash
# Local daily backup for a single-host install (the shared VPS): dumps
# Postgres and archives the MinIO data volume, encrypts both with age, keeps
# them on this host for BACKUP_RETENTION_DAYS, and records the last success.
#
# This protects against application mistakes, a bad migration, or deleted
# data. It does not protect against losing the host itself; add an offsite
# copy (infra/scripts/backup.sh) for that.
#
# The age private key must NOT live on this host, otherwise encrypting the
# backups here adds nothing. Only the public key (recipient) is configured
# here; the private key stays with the operator.
#
# Env (all optional except the recipient):
#   BACKUP_AGE_RECIPIENT_FILE  file holding the age public key
#                              (default /etc/newsekolah/backup-age-recipient.txt)
#   BACKUP_DIR                 destination (default /root/backups/newsekolah)
#   BACKUP_RETENTION_DAYS      default 14
#   COMPOSE_DIR                default: infra/docker next to this script
#   COMPOSE_FILES              default "docker-compose.prod.yml compose.vps.yml"
#   MINIO_VOLUME               default newsekolah_minio_data
#
# Usage: infra/scripts/backup-local.sh   (cron: see infra/README.md)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RECIPIENT_FILE="${BACKUP_AGE_RECIPIENT_FILE:-/etc/newsekolah/backup-age-recipient.txt}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups/newsekolah}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
COMPOSE_DIR="${COMPOSE_DIR:-$SCRIPT_DIR/../docker}"
COMPOSE_FILES="${COMPOSE_FILES:-docker-compose.prod.yml compose.vps.yml}"
MINIO_VOLUME="${MINIO_VOLUME:-newsekolah_minio_data}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1"; }
fail() {
    log "BACKUP FAILED: $1"
    exit 1
}

[[ -s "$RECIPIENT_FILE" ]] || fail "age recipient file $RECIPIENT_FILE is missing or empty"
command -v age >/dev/null || fail "age is not installed"

compose_args=()
for f in $COMPOSE_FILES; do
    compose_args+=(-f "$COMPOSE_DIR/$f")
done
compose() { docker compose --project-directory "$COMPOSE_DIR" "${compose_args[@]}" "$@"; }

env_value() {
    grep -E "^$1=" "$COMPOSE_DIR/.env" | tail -n 1 | cut -d= -f2-
}
PG_USER="$(env_value POSTGRES_USER)"
PG_DB="$(env_value POSTGRES_DB)"
[[ -n "$PG_USER" && -n "$PG_DB" ]] || fail "POSTGRES_USER/POSTGRES_DB not found in $COMPOSE_DIR/.env"

umask 077
mkdir -p "$BACKUP_DIR"
tmp_dir="$(mktemp -d "$BACKUP_DIR/.tmp.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT

pg_out="$BACKUP_DIR/postgres-$TIMESTAMP.dump.age"
log "dumping Postgres database $PG_DB"
compose exec -T postgres pg_dump -U "$PG_USER" -d "$PG_DB" --format=custom \
    >"$tmp_dir/postgres.dump" || fail "pg_dump exited non-zero"
[[ -s "$tmp_dir/postgres.dump" ]] || fail "pg_dump produced an empty file"
age -R "$RECIPIENT_FILE" -o "$tmp_dir/postgres.dump.age" "$tmp_dir/postgres.dump" ||
    fail "encrypting the Postgres dump failed"
rm -f "$tmp_dir/postgres.dump"
mv "$tmp_dir/postgres.dump.age" "$pg_out"

minio_out="$BACKUP_DIR/minio-$TIMESTAMP.tar.gz.age"
log "archiving volume $MINIO_VOLUME"
docker run --rm -v "$MINIO_VOLUME":/data:ro alpine tar -C /data -czf - . \
    >"$tmp_dir/minio.tar.gz" || fail "archiving $MINIO_VOLUME failed"
age -R "$RECIPIENT_FILE" -o "$tmp_dir/minio.tar.gz.age" "$tmp_dir/minio.tar.gz" ||
    fail "encrypting the MinIO archive failed"
rm -f "$tmp_dir/minio.tar.gz"
mv "$tmp_dir/minio.tar.gz.age" "$minio_out"

log "pruning backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'postgres-*.dump.age' -o -name 'minio-*.tar.gz.age' \) \
    -mtime +"$RETENTION_DAYS" -delete

date -u +%Y-%m-%dT%H:%M:%SZ >"$BACKUP_DIR/LAST_SUCCESS"
log "backup complete: $(basename "$pg_out") ($(du -h "$pg_out" | cut -f1)), $(basename "$minio_out") ($(du -h "$minio_out" | cut -f1))"
