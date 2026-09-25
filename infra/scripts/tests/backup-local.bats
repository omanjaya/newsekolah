#!/usr/bin/env bats
# Test harness for infra/scripts/backup-local.sh's incremental object
# backup: runs it with faked docker/mc/age (infra/scripts/tests/fixtures/
# backup-local-bin) and a throwaway compose dir / backup dir / fake bucket,
# so it never touches a real Docker daemon, MinIO server, or age key.
#
# The fake `docker compose ... run ... minio-init -c SCRIPT` (see the
# fixture) actually executes the container's `-c` script on the host via
# `sh -c`, with `mc` resolved to the fake fixture: FAKE_BUCKET_DIR stands
# in for the live bucket, FAKE_STAGING_DIR (set by the fixture from the
# real -v mount) for the container's /staging. The fake `age` is a
# reversible wrapper, not real encryption, so tests can decrypt what the
# script wrote and check it, without a real age keypair.
#
# Run with: bats infra/scripts/tests/backup-local.bats

SCRIPT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
BACKUP_SH="$SCRIPT_DIR/backup-local.sh"
FIXTURES_BIN="$BATS_TEST_DIRNAME/fixtures/backup-local-bin"

sha256_of() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | cut -d' ' -f1
    else
        shasum -a 256 "$1" | cut -d' ' -f1
    fi
}

# Decrypts a manifest-*.tsv.age with the fake age and prints its path.
decrypt_manifest() {
    local encrypted="$1" out="$TEST_ROOT/decrypted-manifest.tsv"
    age -d -i "$RECIPIENT_FILE" -o "$out" "$encrypted"
    printf '%s' "$out"
}

latest_manifest() {
    find "$BACKUP_DIR" -maxdepth 1 -name 'manifest-*.tsv.age' | sort | tail -n1
}

count_blobs() {
    find "$OBJECTS_DIR" -type f -name '*.age' | wc -l | tr -d ' '
}

setup() {
    TEST_ROOT="$(mktemp -d)"
    export PATH="$FIXTURES_BIN:$PATH"

    export COMPOSE_DIR="$TEST_ROOT/compose"
    mkdir -p "$COMPOSE_DIR"
    cat >"$COMPOSE_DIR/.env" <<'EOF'
POSTGRES_USER=test_user
POSTGRES_DB=test_db
S3_BUCKET=testbucket
EOF

    RECIPIENT_FILE="$TEST_ROOT/recipient.txt"
    echo "age1dummyrecipient" >"$RECIPIENT_FILE"
    export BACKUP_AGE_RECIPIENT_FILE="$RECIPIENT_FILE"

    BACKUP_DIR="$TEST_ROOT/backups"
    export BACKUP_DIR
    OBJECTS_DIR="$BACKUP_DIR/objects"

    BUCKET_DIR="$TEST_ROOT/bucket"
    mkdir -p "$BUCKET_DIR"
    export FAKE_BUCKET_DIR="$BUCKET_DIR"

    export BACKUP_RETENTION_DAYS=14
}

teardown() {
    rm -rf "$TEST_ROOT"
}

# --- first run / second run -------------------------------------------------

@test "first run mirrors and encrypts every object in the bucket" {
    echo -n "hello" >"$BUCKET_DIR/a.txt"
    mkdir -p "$BUCKET_DIR/sub"
    echo -n "report contents" >"$BUCKET_DIR/sub/report.pdf"

    run "$BACKUP_SH"
    [ "$status" -eq 0 ]

    [ -f "$BACKUP_DIR/LAST_SUCCESS" ]
    [ "$(count_blobs)" -eq 2 ]

    manifest="$(decrypt_manifest "$(latest_manifest)")"
    grep -qF "a.txt" "$manifest"
    grep -qF "sub/report.pdf" "$manifest"
}

@test "second run with unchanged content encrypts nothing new" {
    echo -n "hello" >"$BUCKET_DIR/a.txt"
    run "$BACKUP_SH"
    [ "$status" -eq 0 ]
    [ "$(count_blobs)" -eq 1 ]

    blob="$(find "$OBJECTS_DIR" -type f -name '*.age')"
    before_mtime="$(stat -f%m "$blob" 2>/dev/null || stat -c%Y "$blob")"

    sleep 1
    run "$BACKUP_SH"
    [ "$status" -eq 0 ]

    [ "$(count_blobs)" -eq 1 ]
    after_blob="$(find "$OBJECTS_DIR" -type f -name '*.age')"
    [ "$blob" = "$after_blob" ]
    after_mtime="$(stat -f%m "$after_blob" 2>/dev/null || stat -c%Y "$after_blob")"
    [ "$before_mtime" -eq "$after_mtime" ]
}

@test "a changed object is encrypted under its new hash without touching the old blob" {
    echo -n "version one" >"$BUCKET_DIR/a.txt"
    run "$BACKUP_SH"
    [ "$status" -eq 0 ]
    [ "$(count_blobs)" -eq 1 ]
    old_blob="$(find "$OBJECTS_DIR" -type f -name '*.age')"

    # A distinct timestamp so this run writes its own manifest file rather
    # than overwriting run 1's (backup-local.sh names manifests by
    # second-resolution timestamp; two runs in the same second would
    # collide, which the daily-cron use case never does).
    sleep 1
    echo -n "version two, longer content" >"$BUCKET_DIR/a.txt"
    run "$BACKUP_SH"
    [ "$status" -eq 0 ]

    [ "$(count_blobs)" -eq 2 ]
    [ -f "$old_blob" ]

    manifest="$(decrypt_manifest "$(latest_manifest)")"
    expected_hash="$(sha256_of "$BUCKET_DIR/a.txt")"
    grep -qF "$expected_hash" "$manifest"
}

# --- deleted objects ---------------------------------------------------------

@test "a deleted object drops out of the next manifest and out of staging" {
    echo -n "keep me" >"$BUCKET_DIR/keep.txt"
    echo -n "delete me" >"$BUCKET_DIR/gone.txt"
    run "$BACKUP_SH"
    [ "$status" -eq 0 ]

    first_manifest="$(decrypt_manifest "$(latest_manifest)")"
    grep -qF "gone.txt" "$first_manifest"

    rm -f "$BUCKET_DIR/gone.txt"
    sleep 1
    run "$BACKUP_SH"
    [ "$status" -eq 0 ]

    second_manifest="$(decrypt_manifest "$(latest_manifest)")"
    grep -qF "keep.txt" "$second_manifest"
    ! grep -qF "gone.txt" "$second_manifest"

    staging_dir="$BACKUP_DIR/.staging"
    [ ! -f "$staging_dir/gone.txt" ]
    [ -f "$staging_dir/keep.txt" ]
}

# --- retention pruning -------------------------------------------------------

@test "pruning removes objects no manifest in the retention window references, and keeps referenced ones" {
    echo -n "current content" >"$BUCKET_DIR/current.txt"
    run "$BACKUP_SH"
    [ "$status" -eq 0 ]
    [ "$(count_blobs)" -eq 1 ]
    kept_blob="$(find "$OBJECTS_DIR" -type f -name '*.age')"

    # Seed an orphaned, out-of-window manifest+hash pair and a matching
    # blob, all older than the retention window, that nothing current
    # references.
    orphan_hash="0000000000000000000000000000000000000000000000000000000000ff"
    shard="${orphan_hash:0:2}"
    mkdir -p "$OBJECTS_DIR/$shard"
    orphan_blob="$OBJECTS_DIR/$shard/$orphan_hash.age"
    echo "FAKE-AGE-ENCRYPTED" >"$orphan_blob"
    echo "orphaned content" >>"$orphan_blob"

    old_manifest="$BACKUP_DIR/manifest-20200101T000000Z.tsv.age"
    old_hashes="$BACKUP_DIR/manifest-20200101T000000Z.hashes"
    printf 'old-key.bin\t%s\t10\t1\n' "$orphan_hash" >"$TEST_ROOT/old-manifest.tsv"
    age -R "$RECIPIENT_FILE" -o "$old_manifest" "$TEST_ROOT/old-manifest.tsv"
    printf '%s\n' "$orphan_hash" >"$old_hashes"

    old_stamp="$(date -v-30d +%Y%m%d%H%M 2>/dev/null || date -d '30 days ago' +%Y%m%d%H%M)"
    touch -t "$old_stamp" "$old_manifest" "$old_hashes" "$orphan_blob"

    export BACKUP_RETENTION_DAYS=14
    run "$BACKUP_SH"
    [ "$status" -eq 0 ]

    [ ! -f "$old_manifest" ]
    [ ! -f "$old_hashes" ]
    [ ! -f "$orphan_blob" ]
    [ -f "$kept_blob" ]
}

# --- manifest correctness ----------------------------------------------------

@test "manifest correctness: key, hash and size match the object's real content" {
    echo -n "exact bytes for this test" >"$BUCKET_DIR/exact.txt"

    run "$BACKUP_SH"
    [ "$status" -eq 0 ]

    manifest="$(decrypt_manifest "$(latest_manifest)")"
    line="$(grep -F "exact.txt" "$manifest")"
    key="$(printf '%s' "$line" | cut -f1)"
    hash="$(printf '%s' "$line" | cut -f2)"
    size="$(printf '%s' "$line" | cut -f3)"

    [ "$key" = "exact.txt" ]
    [ "$hash" = "$(sha256_of "$BUCKET_DIR/exact.txt")" ]
    [ "$size" = "$(printf '%s' "exact bytes for this test" | wc -c | tr -d ' ')" ]

    blob="$OBJECTS_DIR/${hash:0:2}/${hash}.age"
    [ -f "$blob" ]
}
