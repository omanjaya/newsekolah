# shellcheck shell=bash
# Shared helpers for infra/scripts/monitor.sh: config loading (including the
# platform console's monitor-config API, with a local cache and fallback),
# Telegram delivery, per-check alert-state bookkeeping, and a couple of
# portable (GNU + BSD) date helpers so the test suite can run on a
# developer's Mac as well as the Ubuntu VPS the script actually targets.
#
# Sourced, not executed. Every function here assumes `set -euo pipefail` is
# already active in the caller.

# --- logging -----------------------------------------------------------

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1"; }

fail() {
    log "error: $1"
    exit 1
}

# --- config ------------------------------------------------------------
#
# Precedence, highest first:
#   1. /etc/newsekolah/monitor.env (or $MONITOR_ENV_FILE, for tests) -- an
#      operator setting something here always wins.
#   2. The platform console's monitor-config API (apps/api
#      /internal/monitor-config), or its last-good cache when the API is
#      unreachable.
#   3. Hardcoded defaults below.
#
# This is implemented with `: "${VAR:=value}"`, which only assigns when VAR
# is unset or empty, applied in that order -- so a value set at a higher
# precedence level is never overwritten by a lower one.

bool_to_flag() { [[ "$1" == "true" ]] && echo 1 || echo 0; }

# Applies every field of a monitor-config JSON payload ($1) that this
# script understands. Fields already set (by monitor.env, or by an earlier
# call with fresher data) are left alone.
apply_remote_config() {
    local json="$1" v

    # set_if_nonempty/set_if_numeric only assign (respecting the `:=`
    # precedence rule above) when the field was actually present in the
    # payload; note the trailing `|| true` on both -- under `set -e`, a
    # bare `[[ cond ]] && stmt` as a whole statement aborts the script the
    # moment cond is false (the classic set -e/&&-list gotcha), which here
    # would happen on every single field the payload leaves unset.
    set_if_nonempty() { [[ -n "$2" ]] && : "${!1:=$2}" || true; }
    set_if_numeric() { [[ "$2" =~ ^[0-9]+$ ]] && : "${!1:=$2}" || true; }
    set_if_bool() { [[ -n "$2" ]] && : "${!1:=$(bool_to_flag "$2")}" || true; }

    v="$(jq -r '.telegram_bot_token // empty' <<<"$json" 2>/dev/null)"
    set_if_nonempty TELEGRAM_BOT_TOKEN "$v"
    v="$(jq -r '.telegram_chat_id // empty' <<<"$json" 2>/dev/null)"
    set_if_nonempty TELEGRAM_CHAT_ID "$v"

    v="$(jq -r '.thresholds.disk_percent // empty' <<<"$json" 2>/dev/null)"
    set_if_numeric DISK_THRESHOLD_PERCENT "$v"
    v="$(jq -r '.thresholds.memory_mb // empty' <<<"$json" 2>/dev/null)"
    set_if_numeric MEM_AVAILABLE_THRESHOLD_MB "$v"
    v="$(jq -r '.thresholds.backup_max_age_hours // empty' <<<"$json" 2>/dev/null)"
    set_if_numeric BACKUP_MAX_AGE_HOURS "$v"
    v="$(jq -r '.thresholds.cert_days // empty' <<<"$json" 2>/dev/null)"
    set_if_numeric CERT_EXPIRY_DAYS "$v"

    v="$(jq -r 'if .checks.health == null then "" else .checks.health end' <<<"$json" 2>/dev/null)"
    set_if_bool CHECK_HEALTH_ENABLED "$v"
    v="$(jq -r 'if .checks.containers == null then "" else .checks.containers end' <<<"$json" 2>/dev/null)"
    set_if_bool CHECK_CONTAINERS_ENABLED "$v"
    v="$(jq -r 'if .checks.disk == null then "" else .checks.disk end' <<<"$json" 2>/dev/null)"
    set_if_bool CHECK_DISK_ENABLED "$v"
    v="$(jq -r 'if .checks.memory == null then "" else .checks.memory end' <<<"$json" 2>/dev/null)"
    set_if_bool CHECK_MEMORY_ENABLED "$v"
    v="$(jq -r 'if .checks.backup == null then "" else .checks.backup end' <<<"$json" 2>/dev/null)"
    set_if_bool CHECK_BACKUP_ENABLED "$v"
    v="$(jq -r 'if .checks.certificate == null then "" else .checks.certificate end' <<<"$json" 2>/dev/null)"
    set_if_bool CHECK_CERTIFICATE_ENABLED "$v"
    v="$(jq -r 'if .checks.errors_5xx == null then "" else .checks.errors_5xx end' <<<"$json" 2>/dev/null)"
    set_if_bool CHECK_ERRORS_ENABLED "$v"

    v="$(jq -r 'if .daily_summary.enabled == null then "" else .daily_summary.enabled end' <<<"$json" 2>/dev/null)"
    set_if_bool DAILY_SUMMARY_ENABLED "$v"
    v="$(jq -r '.daily_summary.hour_wita // empty' <<<"$json" 2>/dev/null)"
    set_if_numeric DAILY_SUMMARY_HOUR_WITA "$v"

    v="$(jq -r 'if .enabled == null then "" else .enabled end' <<<"$json" 2>/dev/null)"
    set_if_bool MONITOR_ENABLED "$v"
}

# Fetches apps/api's internal monitor-config endpoint (loopback only, not
# proxied by Caddy) and applies it via apply_remote_config. On any failure
# other than 404 (explicitly disabled), falls back to the last-good
# response cached at $MONITOR_CONFIG_CACHE and raises the "monitor_api"
# check bad, through the normal evaluate_check state machine, so an
# operator is told the config API itself is unreachable -- not just left
# to notice monitoring silently degraded. A missing MONITOR_API_TOKEN
# means the console integration is simply not configured yet: this is a
# no-op, not a failure, so local/hardcoded config is used untouched.
fetch_monitor_config() {
    [[ -n "${MONITOR_API_TOKEN:-}" ]] || return 0

    local url="${MONITOR_API_URL:-http://127.0.0.1:8081/internal/monitor-config}"
    local cache_file="${MONITOR_CONFIG_CACHE:-$STATE_DIR/config.json}"
    local timeout="${MONITOR_API_TIMEOUT_SECONDS:-5}"
    local tmp_body http_code body

    tmp_body="$(mktemp)"
    http_code="$(curl -sS -o "$tmp_body" -w '%{http_code}' --max-time "$timeout" \
        -H "Authorization: Bearer ${MONITOR_API_TOKEN}" \
        "$url" 2>/dev/null)" || http_code="000"
    body="$(cat "$tmp_body" 2>/dev/null || true)"
    rm -f "$tmp_body"

    if [[ "$http_code" == "200" ]] && jq -e . >/dev/null 2>&1 <<<"$body"; then
        apply_remote_config "$body"
        mkdir -p "$STATE_DIR"
        (
            umask 077
            printf '%s' "$body" >"$cache_file"
        )
        chmod 600 "$cache_file" 2>/dev/null || true
        evaluate_check "monitor_api" 0 "" "$(recovery_msg "API konfigurasi monitor")"
        return 0
    fi

    if [[ "$http_code" == "404" ]]; then
        : "${MONITOR_ENABLED:=0}"
        evaluate_check "monitor_api" 0 "" "$(recovery_msg "API konfigurasi monitor")"
        return 0
    fi

    log "monitor-config API unreachable (HTTP $http_code), falling back to cache"
    if [[ -s "$cache_file" ]]; then
        apply_remote_config "$(<"$cache_file")"
    fi
    evaluate_check "monitor_api" 1 \
        "$(alert_msg "API konfigurasi monitor" "HTTP $http_code, memakai cache terakhir")" \
        ""
}

# Loads monitor.env, then the monitor-config API (or its cache), then
# hardcoded defaults for anything still unset. See the precedence note
# above.
load_config() {
    local env_file="${MONITOR_ENV_FILE:-/etc/newsekolah/monitor.env}"

    if [[ -f "$env_file" ]]; then
        # shellcheck disable=SC1090
        source "$env_file"
    else
        fail "config file not found: $env_file"
    fi

    : "${HOST_LABEL:=$(hostname 2>/dev/null || echo unknown-host)}"
    : "${STATE_DIR:=/var/lib/newsekolah-monitor}"
    : "${CURL_TIMEOUT_SECONDS:=10}"

    : "${CONTAINER_RESTART_THRESHOLD:=5}"
    : "${ERROR_BURST_THRESHOLD:=20}"
    : "${ALERT_REPEAT_SECONDS:=21600}"

    : "${PROD_API_LOOPBACK_URL:=http://127.0.0.1:8081/health}"
    : "${STAGING_API_LOOPBACK_URL:=http://127.0.0.1:8082/health}"
    : "${PROD_PUBLIC_HEALTH_URL:=https://sion.nouma.id/health}"
    : "${STAGING_PUBLIC_HEALTH_URL:=https://staging.sion.nouma.id/health}"
    : "${PROD_SITE_HOST:=sion.nouma.id}"
    : "${STAGING_SITE_HOST:=staging.sion.nouma.id}"

    : "${PROD_COMPOSE_DIR:=/root/sion/infra/docker}"
    : "${PROD_COMPOSE_FILES:=docker-compose.prod.yml compose.vps.yml}"
    : "${PROD_COMPOSE_PROJECT:=newsekolah}"
    : "${STAGING_COMPOSE_DIR:=/root/sion-staging/infra/docker}"
    : "${STAGING_COMPOSE_FILES:=docker-compose.prod.yml compose.staging.yml}"
    : "${STAGING_COMPOSE_PROJECT:=newsekolah-staging}"

    : "${BACKUP_LAST_SUCCESS_FILE:=/root/backups/newsekolah/LAST_SUCCESS}"

    fetch_monitor_config

    : "${DISK_THRESHOLD_PERCENT:=85}"
    : "${MEM_AVAILABLE_THRESHOLD_MB:=256}"
    : "${BACKUP_MAX_AGE_HOURS:=26}"
    : "${CERT_EXPIRY_DAYS:=14}"

    : "${CHECK_HEALTH_ENABLED:=1}"
    : "${CHECK_CONTAINERS_ENABLED:=1}"
    : "${CHECK_DISK_ENABLED:=1}"
    : "${CHECK_MEMORY_ENABLED:=1}"
    : "${CHECK_BACKUP_ENABLED:=1}"
    : "${CHECK_CERTIFICATE_ENABLED:=1}"
    : "${CHECK_ERRORS_ENABLED:=1}"

    : "${DAILY_SUMMARY_ENABLED:=1}"
    : "${DAILY_SUMMARY_HOUR_WITA:=7}"

    : "${MONITOR_ENABLED:=1}"

    if [[ "${DRY_RUN:-0}" != "1" && "${MONITOR_ENABLED}" == "1" ]]; then
        [[ -n "${TELEGRAM_BOT_TOKEN:-}" ]] || fail "no TELEGRAM_BOT_TOKEN (set it in $env_file or via the platform console)"
        [[ -n "${TELEGRAM_CHAT_ID:-}" ]] || fail "no TELEGRAM_CHAT_ID (set it in $env_file or via the platform console)"
    fi
}

# --- time ------------------------------------------------------------------

wita_now() { TZ=Asia/Makassar date +'%Y-%m-%d %H:%M'; }

# Current WITA hour (00-23) as a base-10 number. MONITOR_NOW_HOUR_OVERRIDE
# is a test-only hook for exercising daily_summary's hour gate without
# depending on the system clock.
wita_hour() {
    if [[ -n "${MONITOR_NOW_HOUR_OVERRIDE:-}" ]]; then
        printf '%s' "$((10#$MONITOR_NOW_HOUR_OVERRIDE))"
    else
        printf '%s' "$((10#$(TZ=Asia/Makassar date +%H)))"
    fi
}

# Parses an ISO-8601 UTC timestamp (YYYY-MM-DDTHH:MM:SSZ, as written by
# backup-local.sh's LAST_SUCCESS file) into epoch seconds. Tries GNU date
# first (the VPS this runs on), falls back to BSD date (a developer's Mac
# running the test suite).
iso_to_epoch() {
    local iso="$1"
    date -u -d "$iso" +%s 2>/dev/null && return 0
    date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$iso" +%s 2>/dev/null && return 0
    return 1
}

# Parses an `openssl x509 -noout -enddate` value ("Sep 25 12:00:00 2026
# GMT") into epoch seconds, same GNU/BSD fallback as iso_to_epoch.
cert_enddate_to_epoch() {
    local s="$1"
    date -u -d "$s" +%s 2>/dev/null && return 0
    date -u -j -f '%b %d %T %Y %Z' "$s" +%s 2>/dev/null && return 0
    return 1
}

# --- Telegram --------------------------------------------------------------

# Sends $1 as a Telegram message. In dry-run mode it prints the message
# instead. A delivery failure (missing credentials, network error, bad
# token, ...) is logged locally and reported via a non-zero return --
# callers must not let this crash the script, since a broken Telegram
# integration should not also take down monitoring itself.
send_telegram() {
    local text="$1"

    if [[ "${DRY_RUN:-0}" == "1" ]]; then
        printf '%s\n---\n' "$text"
        return 0
    fi

    if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
        log "no Telegram credentials configured, cannot send: $text"
        return 1
    fi

    local resp
    resp="$(curl -sS --max-time "$CURL_TIMEOUT_SECONDS" \
        "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
        --data-urlencode "text=${text}" 2>&1)"
    local curl_status=$?

    if [[ "$curl_status" -ne 0 ]] || ! grep -q '"ok":true' <<<"$resp"; then
        log "Telegram send failed (curl exit $curl_status): $resp"
        log "message was: $text"
        return 1
    fi
    return 0
}

# --- alert-state bookkeeping ------------------------------------------------
#
# One state file per check under $STATE_DIR, format:
#   status=ok|bad
#   last_alert=<epoch seconds, 0 if never>
#
# evaluate_check fires $3 (the alert message) the first time a check goes
# bad and again at most every ALERT_REPEAT_SECONDS while it stays bad, and
# fires $4 (the recovery message) once when it clears. This is the single
# place that decides whether to send anything, so every check function
# below just computes "is this bad" and hands the two messages over.

state_path() { printf '%s/%s.state' "$STATE_DIR" "$1"; }

read_state_field() {
    local file="$1" field="$2" value
    value="$(grep -E "^${field}=" "$file" 2>/dev/null | tail -n1 | cut -d= -f2-)"
    printf '%s' "$value"
}

evaluate_check() {
    local check_id="$1" bad="$2" bad_msg="$3" ok_msg="$4"
    local state_file prev_status prev_last_alert now

    state_file="$(state_path "$check_id")"
    prev_status="ok"
    prev_last_alert=0
    if [[ -f "$state_file" ]]; then
        prev_status="$(read_state_field "$state_file" status)"
        prev_last_alert="$(read_state_field "$state_file" last_alert)"
        [[ -n "$prev_status" ]] || prev_status="ok"
        [[ "$prev_last_alert" =~ ^[0-9]+$ ]] || prev_last_alert=0
    fi
    now="$(date +%s)"

    mkdir -p "$STATE_DIR"

    if [[ "$bad" -eq 1 ]]; then
        local should_alert=0
        if [[ "$prev_status" != "bad" ]]; then
            should_alert=1
        elif (( now - prev_last_alert >= ALERT_REPEAT_SECONDS )); then
            should_alert=1
        fi
        if [[ "$should_alert" -eq 1 ]]; then
            send_telegram "$bad_msg" || true
            prev_last_alert="$now"
        fi
        printf 'status=bad\nlast_alert=%s\n' "$prev_last_alert" >"$state_file"
    else
        if [[ "$prev_status" == "bad" ]]; then
            send_telegram "$ok_msg" || true
        fi
        printf 'status=ok\nlast_alert=0\n' >"$state_file"
    fi
}

# --- message text (concise Indonesian, host/check/value/time) --------------

alert_msg() {
    local check="$1" value="$2"
    printf 'PERINGATAN newsekolah\nHost: %s\nCek: %s\nNilai: %s\nWaktu: %s WITA' \
        "$HOST_LABEL" "$check" "$value" "$(wita_now)"
}

recovery_msg() {
    local check="$1"
    printf 'PULIH newsekolah\nHost: %s\nCek: %s\nWaktu: %s WITA' \
        "$HOST_LABEL" "$check" "$(wita_now)"
}
