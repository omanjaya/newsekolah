#!/usr/bin/env bats
# Test harness for infra/scripts/monitor.sh: runs it with --dry-run against
# faked df/free/docker/openssl/curl (infra/scripts/tests/fixtures/bin) and a
# throwaway monitor.env/state dir, so it never touches a real host, Docker
# daemon, or the network. Exercises the alert/repeat-suppression/recovery
# state machine and the monitor-config API fetch/cache/fallback.
#
# Run with: bats infra/scripts/tests/monitor.bats

SCRIPT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
MONITOR_SH="$SCRIPT_DIR/monitor.sh"
FIXTURES_BIN="$BATS_TEST_DIRNAME/fixtures/bin"

setup() {
    TEST_ROOT="$(mktemp -d)"
    export STATE_DIR="$TEST_ROOT/state"
    export MONITOR_ENV_FILE="$TEST_ROOT/monitor.env"
    export PATH="$FIXTURES_BIN:$PATH"

    # Every check disabled by default; each test turns on only the ones it
    # exercises, so a fixture that would fail loudly (docker, openssl) is
    # never actually invoked unless the test means to cover it.
    cat >"$MONITOR_ENV_FILE" <<'EOF'
HOST_LABEL=test-host
CHECK_HEALTH_ENABLED=0
CHECK_CONTAINERS_ENABLED=0
CHECK_DISK_ENABLED=0
CHECK_MEMORY_ENABLED=0
CHECK_BACKUP_ENABLED=0
CHECK_CERTIFICATE_ENABLED=0
CHECK_ERRORS_ENABLED=0
DAILY_SUMMARY_ENABLED=0
ALERT_REPEAT_SECONDS=21600
EOF

    unset FAKE_DISK_PERCENT FAKE_MEM_AVAILABLE_MB FAKE_CONFIG_MODE FAKE_CONFIG_BODY
}

teardown() {
    rm -rf "$TEST_ROOT"
}

# Rewrites a check's state file's last_alert far enough in the past that
# ALERT_REPEAT_SECONDS has elapsed, without an actual sleep.
age_state() {
    local check_id="$1" seconds_ago="$2" now
    now="$(date +%s)"
    printf 'status=bad\nlast_alert=%s\n' "$((now - seconds_ago))" >"$STATE_DIR/${check_id}.state"
}

enable_only() {
    local check="$1"
    sed -i.bak "s/^CHECK_${check}_ENABLED=0/CHECK_${check}_ENABLED=1/" "$MONITOR_ENV_FILE"
    rm -f "$MONITOR_ENV_FILE.bak"
}

# --- disk check: alert / repeat suppression / recovery ---------------------

@test "disk check fires an alert when usage crosses the threshold" {
    enable_only DISK
    echo "DISK_THRESHOLD_PERCENT=80" >>"$MONITOR_ENV_FILE"
    export FAKE_DISK_PERCENT=85

    run "$MONITOR_SH" --dry-run

    [ "$status" -eq 0 ]
    [[ "$output" == *"PERINGATAN"* ]]
    [[ "$output" == *"Disk /"* ]]
    [[ "$output" == *"85%"* ]]
    [ -f "$STATE_DIR/disk_root.state" ]
    grep -q '^status=bad$' "$STATE_DIR/disk_root.state"
}

@test "disk check does not repeat the alert before ALERT_REPEAT_SECONDS elapses" {
    enable_only DISK
    echo "DISK_THRESHOLD_PERCENT=80" >>"$MONITOR_ENV_FILE"
    export FAKE_DISK_PERCENT=85

    run "$MONITOR_SH" --dry-run
    [ "$status" -eq 0 ]
    [[ "$output" == *"PERINGATAN"* ]]

    run "$MONITOR_SH" --dry-run
    [ "$status" -eq 0 ]
    [[ "$output" != *"PERINGATAN"* ]]
}

@test "disk check repeats the alert once ALERT_REPEAT_SECONDS has elapsed" {
    enable_only DISK
    echo "DISK_THRESHOLD_PERCENT=80" >>"$MONITOR_ENV_FILE"
    echo "ALERT_REPEAT_SECONDS=60" >>"$MONITOR_ENV_FILE"
    export FAKE_DISK_PERCENT=85

    run "$MONITOR_SH" --dry-run
    [ "$status" -eq 0 ]

    age_state disk_root 120

    run "$MONITOR_SH" --dry-run
    [ "$status" -eq 0 ]
    [[ "$output" == *"PERINGATAN"* ]]
}

@test "disk check sends a recovery message once, when usage drops back down" {
    enable_only DISK
    echo "DISK_THRESHOLD_PERCENT=80" >>"$MONITOR_ENV_FILE"
    export FAKE_DISK_PERCENT=85

    run "$MONITOR_SH" --dry-run
    [ "$status" -eq 0 ]
    [[ "$output" == *"PERINGATAN"* ]]

    export FAKE_DISK_PERCENT=10
    run "$MONITOR_SH" --dry-run
    [ "$status" -eq 0 ]
    [[ "$output" == *"PULIH"* ]]
    grep -q '^status=ok$' "$STATE_DIR/disk_root.state"

    run "$MONITOR_SH" --dry-run
    [ "$status" -eq 0 ]
    [[ "$output" != *"PULIH"* ]]
}

# --- monitor-config API: fetch, cache, 404, fallback ------------------------

@test "monitor-config: local monitor.env overrides a value the API also sets" {
    enable_only DISK
    echo "MONITOR_API_TOKEN=test-token" >>"$MONITOR_ENV_FILE"
    echo "DISK_THRESHOLD_PERCENT=50" >>"$MONITOR_ENV_FILE"
    export FAKE_CONFIG_MODE=live
    export FAKE_CONFIG_BODY='{"enabled":true,"checks":{"disk":true},"thresholds":{"disk_percent":85}}'
    export FAKE_DISK_PERCENT=60

    run "$MONITOR_SH" --dry-run

    [ "$status" -eq 0 ]
    # 60 is below the API's threshold (85) but at/above the local override
    # (50): if the local value had lost, no alert would fire.
    [[ "$output" == *"PERINGATAN"* ]]
    [[ "$output" == *"60%"* ]]
}

@test "monitor-config: a live fetch is cached to disk" {
    enable_only DISK
    echo "MONITOR_API_TOKEN=test-token" >>"$MONITOR_ENV_FILE"
    export FAKE_CONFIG_MODE=live
    export FAKE_CONFIG_BODY='{"enabled":true,"checks":{"disk":false}}'

    run "$MONITOR_SH" --dry-run

    [ "$status" -eq 0 ]
    [ -f "$STATE_DIR/config.json" ]
    grep -q '"enabled":true' "$STATE_DIR/config.json"
}

@test "monitor-config: HTTP 404 disables monitoring for the whole run" {
    echo "MONITOR_API_TOKEN=test-token" >>"$MONITOR_ENV_FILE"
    export FAKE_CONFIG_MODE=404
    # Would alert if it ran -- proves the run was actually skipped, not
    # just that this particular check stayed quiet.
    sed -i.bak 's/^CHECK_DISK_ENABLED=0/CHECK_DISK_ENABLED=1/' "$MONITOR_ENV_FILE"
    rm -f "$MONITOR_ENV_FILE.bak"
    echo "DISK_THRESHOLD_PERCENT=10" >>"$MONITOR_ENV_FILE"
    export FAKE_DISK_PERCENT=99

    run "$MONITOR_SH" --dry-run

    [ "$status" -eq 0 ]
    [[ "$output" != *"PERINGATAN"* ]]
}

@test "monitor-config: API unreachable falls back to the cache and alerts about the API itself" {
    enable_only DISK
    echo "MONITOR_API_TOKEN=test-token" >>"$MONITOR_ENV_FILE"
    echo "DISK_THRESHOLD_PERCENT=80" >>"$MONITOR_ENV_FILE"
    export FAKE_DISK_PERCENT=10

    # First run: live fetch succeeds and is cached.
    export FAKE_CONFIG_MODE=live
    export FAKE_CONFIG_BODY='{"enabled":true,"checks":{"disk":true}}'
    run "$MONITOR_SH" --dry-run
    [ "$status" -eq 0 ]
    [ -f "$STATE_DIR/config.json" ]

    # Second run: the API is down. The cached config (disk check enabled,
    # monitoring enabled) must still apply, and the monitor_api check
    # itself must alert.
    export FAKE_CONFIG_MODE=down
    run "$MONITOR_SH" --dry-run
    [ "$status" -eq 0 ]
    [[ "$output" == *"PERINGATAN"* ]]
    [[ "$output" == *"API konfigurasi monitor"* ]]

    # Third run, still down: the monitor_api alert must not repeat inside
    # the suppression window.
    run "$MONITOR_SH" --dry-run
    [ "$status" -eq 0 ]
    [[ "$output" != *"API konfigurasi monitor"* ]]
}

# --- misc --------------------------------------------------------------

@test "--test sends a test message without touching real Telegram credentials" {
    run "$MONITOR_SH" --test --dry-run
    [ "$status" -eq 0 ]
    [[ "$output" == *"TES newsekolah"* ]]
}

@test "--help exits 0 and does not require a config file" {
    export MONITOR_ENV_FILE="$TEST_ROOT/does-not-exist.env"
    run "$MONITOR_SH" --help
    [ "$status" -eq 0 ]
    [[ "$output" == *"Usage:"* ]]
}
