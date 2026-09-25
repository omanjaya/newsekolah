#!/usr/bin/env bash
# Local daily backup for a single-host install (the shared VPS): dumps
# Postgres and incrementally backs up the MinIO bucket, encrypts everything
# with age, keeps it on this host for BACKUP_RETENTION_DAYS, and records the
# last success.
#
# This protects against application mistakes, a bad migration, or deleted
# data. It does not protect against losing the host itself; add an offsite
# copy (infra/scripts/backup.sh) for that.
#
# The age private key must NOT live on this host, otherwise encrypting the
# backups here adds nothing. Only the public key (recipient) is configured
# here; the private key stays with the operator.
#
# Object storage scheme (avoids re-archiving the whole bucket every day,
# which used to make storage backups grow BACKUP_RETENTION_DAYS times the
# bucket size):
#   1. Mirror the live bucket into a persistent local staging dir using the
#      pgsty/mc image, run as a one-off container on the compose project's
#      own network (the already-defined `minio-init` service, with its
#      entrypoint/command overridden -- same image, same credentials, same
#      network, nothing new to provision). `mc mirror --overwrite --remove`
#      keeps the staging dir an exact, plaintext copy of the bucket and only
#      transfers objects that changed since the previous run.
#   2. For every file in the staging dir, compute its sha256. If an
#      encrypted blob for that hash does not already exist under
#      $BACKUP_DIR/objects/<hash>.age, encrypt it there (content-addressed,
#      so identical content across runs or object keys is only ever
#      encrypted and stored once).
#   3. Write today's manifest (object key -> hash, size, mtime) and encrypt
#      it. This is what a restore replays.
#   4. Also write a small *unencrypted* index of just the hashes referenced
#      today (no object keys, no content). Object keys can contain
#      identifying paths (e.g. a student's name or ID), so the manifest
#      that maps key -> hash stays encrypted; the hash-only index does not
#      need to, because a sha256 alone reveals nothing about the object's
#      name or content, and it is already public as the blob's filename.
#      This host holds no age private key, so it cannot decrypt manifests
#      to see which hashes are still referenced -- the plaintext hash index
#      is what makes retention pruning possible without the key.
#   5. Retention deletes old dumps, manifests, and hash indexes by age, then
#      deletes any blob whose hash is not referenced by a manifest still in
#      the retention window.
#
# The staging dir holds plaintext object content (it is a working mirror of
# the live bucket, not a backup artifact); it is root-only (0700) and never
# copied off this host. That is no worse than the live bucket, which is
# already plaintext on this same disk. Only $BACKUP_DIR/postgres-*.dump.age,
# $BACKUP_DIR/manifest-*.tsv.age and $BACKUP_DIR/objects/ are backups and
# safe to copy elsewhere (with the private key kept separately).
#
# See "Local encrypted backup (single host)" in infra/README.md for restore
# instructions (full bucket restore for a given day, and single-file
# restore).
#
# Env (all optional except the recipient):
#   BACKUP_AGE_RECIPIENT_FILE  file holding the age public key
#                              (default /etc/newsekolah/backup-age-recipient.txt)
#   BACKUP_DIR                 destination (default /root/backups/newsekolah)
#   BACKUP_STAGING_DIR         plaintext working mirror of the bucket
#                              (default $BACKUP_DIR/.staging)
#   BACKUP_RETENTION_DAYS      default 14
#   COMPOSE_DIR                default: infra/docker next to this script
#   COMPOSE_FILES              default "docker-compose.prod.yml compose.vps.yml"
#   S3_BUCKET                  bucket to mirror (default: read from
#                              $COMPOSE_DIR/.env, falling back to
#                              "newsekolah")
#
# Usage: infra/scripts/backup-local.sh   (cron: see infra/README.md)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RECIPIENT_FILE="${BACKUP_AGE_RECIPIENT_FILE:-/etc/newsekolah/backup-age-recipient.txt}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups/newsekolah}"
STAGING_DIR="${BACKUP_STAGING_DIR:-$BACKUP_DIR/.staging}"
OBJECTS_DIR="$BACKUP_DIR/objects"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
COMPOSE_DIR="${COMPOSE_DIR:-$SCRIPT_DIR/../docker}"
COMPOSE_FILES="${COMPOSE_FILES:-docker-compose.prod.yml compose.vps.yml}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1"; }
fail() {
    log "BACKUP FAILED: $1"
    exit 1
}

sha256_of() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | cut -d' ' -f1
    else
        shasum -a 256 "$1" | cut -d' ' -f1
    fi
}

file_size() { stat -c%s "$1" 2>/dev/null || stat -f%z "$1"; }
file_mtime() { stat -c%Y "$1" 2>/dev/null || stat -f%m "$1"; }

[[ -s "$RECIPIENT_FILE" ]] || fail "age recipient file $RECIPIENT_FILE is missing or empty"
command -v age >/dev/null || fail "age is not installed"

compose_args=()
for f in $COMPOSE_FILES; do
    compose_args+=(-f "$COMPOSE_DIR/$f")
done
compose() { docker compose --project-directory "$COMPOSE_DIR" "${compose_args[@]}" "$@"; }

env_value() {
    grep -E "^$1=" "$COMPOSE_DIR/.env" 2>/dev/null | tail -n 1 | cut -d= -f2-
}
PG_USER="$(env_value POSTGRES_USER)"
PG_DB="$(env_value POSTGRES_DB)"
[[ -n "$PG_USER" && -n "$PG_DB" ]] || fail "POSTGRES_USER/POSTGRES_DB not found in $COMPOSE_DIR/.env"
S3_BUCKET="${S3_BUCKET:-$(env_value S3_BUCKET)}"
S3_BUCKET="${S3_BUCKET:-newsekolah}"

umask 077
mkdir -p "$BACKUP_DIR" "$STAGING_DIR" "$OBJECTS_DIR"
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

log "mirroring bucket $S3_BUCKET into local staging"
# Single-quoted on purpose: these $vars are read inside the container
# (MINIO_ROOT_USER/S3_ACCESS_KEY/... from minio-init's env_file, MIRROR_BUCKET
# from the -e flag below), not expanded by this host's shell.
# shellcheck disable=SC2016
mirror_script='set -eu
user="${MINIO_ROOT_USER:-${S3_ACCESS_KEY:-}}"
pass="${MINIO_ROOT_PASSWORD:-${S3_SECRET_KEY:-}}"
mc alias set local "http://minio:9000" "$user" "$pass" >/dev/null
mc mirror --overwrite --remove --quiet "local/${MIRROR_BUCKET}" /staging
'
compose run --rm --no-deps -T \
    -v "$STAGING_DIR:/staging" \
    -e "MIRROR_BUCKET=$S3_BUCKET" \
    --entrypoint /bin/sh \
    minio-init -c "$mirror_script" || fail "mirroring MinIO bucket $S3_BUCKET failed"

log "encrypting new or changed objects"
manifest_tmp="$tmp_dir/manifest.tsv"
: >"$manifest_tmp"
object_count=0
while IFS= read -r -d '' file; do
    rel="${file#"$STAGING_DIR"/}"
    hash="$(sha256_of "$file")"
    size="$(file_size "$file")"
    mtime="$(file_mtime "$file")"
    printf '%s\t%s\t%s\t%s\n' "$rel" "$hash" "$size" "$mtime" >>"$manifest_tmp"
    object_count=$((object_count + 1))

    shard="${hash:0:2}"
    blob_dir="$OBJECTS_DIR/$shard"
    blob="$blob_dir/$hash.age"
    if [[ ! -s "$blob" ]]; then
        mkdir -p "$blob_dir"
        age -R "$RECIPIENT_FILE" -o "$tmp_dir/blob.age" "$file" ||
            fail "encrypting object $rel failed"
        mv "$tmp_dir/blob.age" "$blob"
    fi
done < <(find "$STAGING_DIR" -type f -print0)
sort -o "$manifest_tmp" "$manifest_tmp"

manifest_out="$BACKUP_DIR/manifest-$TIMESTAMP.tsv.age"
age -R "$RECIPIENT_FILE" -o "$tmp_dir/manifest.tsv.age" "$manifest_tmp" ||
    fail "encrypting the manifest failed"
mv "$tmp_dir/manifest.tsv.age" "$manifest_out"

hashes_out="$BACKUP_DIR/manifest-$TIMESTAMP.hashes"
cut -f2 "$manifest_tmp" | sort -u >"$tmp_dir/manifest.hashes"
mv "$tmp_dir/manifest.hashes" "$hashes_out"

log "pruning dumps and manifests older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'postgres-*.dump.age' \
    -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'manifest-*.tsv.age' \
    -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'manifest-*.hashes' \
    -mtime +"$RETENTION_DAYS" -delete

log "pruning objects no remaining manifest references"
declare -A keep_hash=()
for f in "$BACKUP_DIR"/manifest-*.hashes; do
    [[ -e "$f" ]] || continue
    while IFS= read -r h; do
        [[ -n "$h" ]] && keep_hash["$h"]=1
    done <"$f"
done
pruned=0
while IFS= read -r -d '' blob; do
    hash="$(basename "$blob" .age)"
    if [[ -z "${keep_hash[$hash]:-}" ]]; then
        rm -f "$blob"
        pruned=$((pruned + 1))
    fi
done < <(find "$OBJECTS_DIR" -type f -name '*.age' -print0)
find "$OBJECTS_DIR" -mindepth 1 -type d -empty -delete

date -u +%Y-%m-%dT%H:%M:%SZ >"$BACKUP_DIR/LAST_SUCCESS"
log "backup complete: $(basename "$pg_out") ($(du -h "$pg_out" | cut -f1)), $object_count object(s) mirrored, $(basename "$manifest_out"), pruned $pruned stale blob(s)"
