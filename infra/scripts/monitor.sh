#!/usr/bin/env bash
# Host-side monitoring for the shared VPS: production and staging API
# health (loopback and public), every container of both compose projects,
# disk and memory, local backup freshness, TLS certificate expiry (checked
# once a day), and a burst of HTTP 5xx/panics in the production api logs.
# Also sends a once-a-day summary. Alerts go to Telegram; see infra/README.md
# "Monitoring" for install and what each alert means.
#
# Usage:
#   infra/scripts/monitor.sh                  run all periodic checks (cron, every minute)
#   infra/scripts/monitor.sh --daily-summary   send the daily summary if the current WITA
#                                               hour matches daily_summary.hour_wita (cron,
#                                               once an hour -- see infra/README.md)
#   infra/scripts/monitor.sh --test            send a test Telegram message and exit
#   infra/scripts/monitor.sh --dry-run         print messages instead of sending them
#                                               (combine with --daily-summary or --test)
#   infra/scripts/monitor.sh --help
#
# Config, highest precedence first: /etc/newsekolah/monitor.env (override
# the path with MONITOR_ENV_FILE, used by the test suite), then the
# platform console's monitor-config API (apps/api's
# /internal/monitor-config, loopback only) or its local cache when that API
# is unreachable, then hardcoded defaults. See
# infra/scripts/monitor.env.example for every variable.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/scripts/lib/monitor-lib.sh
source "$SCRIPT_DIR/lib/monitor-lib.sh"

usage() {
    cat <<'EOF'
Usage: monitor.sh [--daily-summary] [--test] [--dry-run] [--help]

  (no flags)       run all periodic checks (cron, every minute)
  --daily-summary  send the daily summary if the current WITA hour matches
                   daily_summary.hour_wita (cron, once an hour)
  --test           send a test Telegram message and exit
  --dry-run        print what would be sent instead of sending it; combine
                   with --daily-summary or --test to preview that message
  --help           show this help
EOF
}

# --- compose helpers ---------------------------------------------------

compose_cmd() {
    local dir="$1" files="$2" project="$3"
    shift 3
    local args=(-p "$project" --project-directory "$dir")
    local f
    for f in $files; do
        args+=(-f "$dir/$f")
    done
    docker compose "${args[@]}" "$@"
}

prod_compose() { compose_cmd "$PROD_COMPOSE_DIR" "$PROD_COMPOSE_FILES" "$PROD_COMPOSE_PROJECT" "$@"; }
staging_compose() { compose_cmd "$STAGING_COMPOSE_DIR" "$STAGING_COMPOSE_FILES" "$STAGING_COMPOSE_PROJECT" "$@"; }

# --- individual checks ---------------------------------------------------

check_health() {
    local id="$1" label="$2" url="$3" code
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time "$CURL_TIMEOUT_SECONDS" "$url" 2>/dev/null)" || code="000"
    local bad=0
    [[ "$code" == "200" ]] || bad=1
    evaluate_check "$id" "$bad" \
        "$(alert_msg "$label" "HTTP $code")" \
        "$(recovery_msg "$label")"
}

# Any container belonging to the named compose project that is not
# running, is reported unhealthy, or has restarted
# CONTAINER_RESTART_THRESHOLD times or more (crash-looping). One state key
# per container, so a single bad container does not mask another.
check_containers() {
    local env_id="$1" label_prefix="$2" compose_fn="$3" raw containers

    raw="$("$compose_fn" ps --format json 2>/dev/null)" || raw=""
    if [[ -z "$raw" ]]; then
        evaluate_check "containers_${env_id}" 1 \
            "$(alert_msg "Container $label_prefix" "tidak dapat membaca status docker compose")" \
            "$(recovery_msg "Container $label_prefix")"
        return
    fi

    containers="$(printf '%s\n' "$raw" | jq -c -s 'if (.[0]|type)=="array" then .[0][] else .[] end' 2>/dev/null)" || containers=""

    local c name state health restart_count bad detail
    while IFS= read -r c; do
        [[ -n "$c" ]] || continue
        name="$(jq -r '.Name // .Service // "unknown"' <<<"$c")"
        state="$(jq -r '.State // empty' <<<"$c")"
        health="$(jq -r '.Health // empty' <<<"$c")"
        restart_count="$(docker inspect -f '{{.RestartCount}}' "$name" 2>/dev/null)" || restart_count="0"
        [[ "$restart_count" =~ ^[0-9]+$ ]] || restart_count=0

        bad=0
        detail="ok"
        if [[ "$state" != "running" ]]; then
            bad=1
            detail="status=$state"
        elif [[ "$health" == "unhealthy" ]]; then
            bad=1
            detail="unhealthy"
        elif (( restart_count >= CONTAINER_RESTART_THRESHOLD )); then
            bad=1
            detail="restart berulang (${restart_count}x)"
        fi

        evaluate_check "container_${env_id}_${name}" "$bad" \
            "$(alert_msg "Container $name ($label_prefix)" "$detail")" \
            "$(recovery_msg "Container $name ($label_prefix)")"
    done <<<"$containers"
}

check_disk() {
    local pct
    pct="$(df -P / | awk 'NR==2 { gsub("%","",$5); print $5 }')"
    [[ "$pct" =~ ^[0-9]+$ ]] || pct=0
    local bad=0
    if (( pct >= DISK_THRESHOLD_PERCENT )); then bad=1; fi
    evaluate_check "disk_root" "$bad" \
        "$(alert_msg "Disk /" "${pct}% terpakai")" \
        "$(recovery_msg "Disk /")"
}

check_memory() {
    local avail
    avail="$(free -m | awk '/^Mem:/ { print $7 }')"
    [[ "$avail" =~ ^[0-9]+$ ]] || avail=999999
    local bad=0
    if (( avail < MEM_AVAILABLE_THRESHOLD_MB )); then bad=1; fi
    evaluate_check "memory_available" "$bad" \
        "$(alert_msg "Memori tersedia" "${avail} MB")" \
        "$(recovery_msg "Memori tersedia")"
}

check_backup_age() {
    local bad=0 detail
    if [[ ! -s "$BACKUP_LAST_SUCCESS_FILE" ]]; then
        bad=1
        detail="berkas LAST_SUCCESS tidak ada atau kosong"
    else
        local iso epoch now age_h
        iso="$(<"$BACKUP_LAST_SUCCESS_FILE")"
        if epoch="$(iso_to_epoch "$iso")"; then
            now="$(date +%s)"
            age_h=$(( (now - epoch) / 3600 ))
            detail="terakhir sukses ${age_h} jam lalu"
            if (( age_h > BACKUP_MAX_AGE_HOURS )); then bad=1; fi
        else
            bad=1
            detail="isi LAST_SUCCESS tidak terbaca: $iso"
        fi
    fi
    evaluate_check "backup_age" "$bad" \
        "$(alert_msg "Backup lokal" "$detail")" \
        "$(recovery_msg "Backup lokal")"
}

# Returns days-left on stdout; used by both check_tls and the daily
# summary. Returns non-zero if the certificate could not be read.
cert_days_left() {
    local host="$1" enddate epoch now
    enddate="$(printf '' | openssl s_client -connect "${host}:443" -servername "$host" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
    [[ -n "$enddate" ]] || return 1
    epoch="$(cert_enddate_to_epoch "$enddate")" || return 1
    now="$(date +%s)"
    echo $(( (epoch - now) / 86400 ))
}

# TLS certificates barely move day to day, so this only actually checks
# once per UTC calendar day (tracked in its own state file) even though
# monitor.sh itself runs every minute; pass FORCE_TLS_CHECK=1 to override
# (used by --test/the bats suite).
check_tls() {
    local id="$1" host="$2" today lastcheck_file today_done

    today="$(date -u +%Y-%m-%d)"
    lastcheck_file="$STATE_DIR/${id}.lastcheck"
    mkdir -p "$STATE_DIR"
    today_done="$(cat "$lastcheck_file" 2>/dev/null || true)"
    if [[ "${FORCE_TLS_CHECK:-0}" != "1" && "$today_done" == "$today" ]]; then
        return 0
    fi

    local days bad=0 detail
    if days="$(cert_days_left "$host")"; then
        detail="${days} hari lagi"
        if (( days < CERT_EXPIRY_DAYS )); then bad=1; fi
    else
        bad=1
        detail="tidak dapat membaca sertifikat"
    fi

    evaluate_check "$id" "$bad" \
        "$(alert_msg "Sertifikat TLS $host" "$detail")" \
        "$(recovery_msg "Sertifikat TLS $host")"
    printf '%s' "$today" >"$lastcheck_file"
}

# Count of HTTP 5xx http_request log lines plus chi Recoverer panic lines
# in the production api container's logs over $1 (a docker-compose
# --since duration, e.g. "5m" or "24h").
error_event_count() {
    local since="$1" raw count_5xx count_panic
    raw="$(prod_compose logs --no-color --no-log-prefix --since "$since" api 2>/dev/null)" || raw=""
    count_5xx="$(printf '%s\n' "$raw" \
        | jq -Rc 'fromjson? | select(.msg=="http_request" and ((.status // 0) >= 500))' 2>/dev/null \
        | wc -l | tr -d ' ')"
    count_panic="$(printf '%s\n' "$raw" | grep -c 'panic:' || true)"
    [[ "$count_5xx" =~ ^[0-9]+$ ]] || count_5xx=0
    [[ "$count_panic" =~ ^[0-9]+$ ]] || count_panic=0
    echo $(( count_5xx + count_panic ))
}

check_error_burst() {
    local total bad=0
    total="$(error_event_count 5m)"
    if (( total >= ERROR_BURST_THRESHOLD )); then bad=1; fi
    evaluate_check "error_burst_prod" "$bad" \
        "$(alert_msg "Error 5xx/panic api produksi" "${total} kejadian / 5 menit")" \
        "$(recovery_msg "Error 5xx/panic api produksi")"
}

# --- daily summary ---------------------------------------------------------

daily_summary() {
    if [[ "$DAILY_SUMMARY_ENABLED" != "1" ]]; then
        log "daily summary disabled (platform console), skipping"
        return 0
    fi
    local current_hour
    current_hour="$(wita_hour)"
    if [[ "${FORCE_DAILY_SUMMARY:-0}" != "1" && "$current_hour" != "$((10#$DAILY_SUMMARY_HOUR_WITA))" ]]; then
        return 0
    fi

    local prod_code staging_code backup_line backup_size disk_pct mem_avail
    local cert_prod cert_staging err24 backup_dir latest_dump msg

    prod_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time "$CURL_TIMEOUT_SECONDS" "$PROD_PUBLIC_HEALTH_URL" 2>/dev/null)" || prod_code="000"
    staging_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time "$CURL_TIMEOUT_SECONDS" "$STAGING_PUBLIC_HEALTH_URL" 2>/dev/null)" || staging_code="000"

    backup_line="tidak ada"
    backup_size="-"
    if [[ -s "$BACKUP_LAST_SUCCESS_FILE" ]]; then
        backup_line="$(<"$BACKUP_LAST_SUCCESS_FILE")"
        backup_dir="$(dirname "$BACKUP_LAST_SUCCESS_FILE")"
        latest_dump="$(find "$backup_dir" -maxdepth 1 -name 'postgres-*.dump.age' -type f 2>/dev/null \
            | sort | tail -n1 || true)"
        if [[ -n "$latest_dump" ]]; then
            backup_size="$(du -h "$latest_dump" 2>/dev/null | cut -f1)"
        fi
    fi

    disk_pct="$(df -P / | awk 'NR==2 { gsub("%","",$5); print $5 }')"
    mem_avail="$(free -m | awk '/^Mem:/ { print $7 }')"

    cert_prod="$(cert_days_left "$PROD_SITE_HOST" 2>/dev/null || echo '?')"
    cert_staging="$(cert_days_left "$STAGING_SITE_HOST" 2>/dev/null || echo '?')"

    err24="$(error_event_count 24h)"

    msg="$(printf 'RINGKASAN HARIAN newsekolah\nHost: %s\nWaktu: %s WITA\n\nProduksi: HTTP %s\nStaging: HTTP %s\n\nBackup terakhir: %s (%s)\nDisk /: %s%%\nMemori tersedia: %s MB\nSertifikat produksi: %s hari lagi\nSertifikat staging: %s hari lagi\n5xx/panic 24 jam (produksi): %s' \
        "$HOST_LABEL" "$(wita_now)" "$prod_code" "$staging_code" \
        "$backup_line" "$backup_size" "$disk_pct" "$mem_avail" \
        "$cert_prod" "$cert_staging" "$err24")"
    send_telegram "$msg"
}

# --- main ------------------------------------------------------------------

run_checks() {
    if [[ "$CHECK_HEALTH_ENABLED" == "1" ]]; then
        check_health health_prod_loopback "API produksi (loopback)" "$PROD_API_LOOPBACK_URL"
        check_health health_prod_public "API produksi (publik)" "$PROD_PUBLIC_HEALTH_URL"
        check_health health_staging_loopback "API staging (loopback)" "$STAGING_API_LOOPBACK_URL"
        check_health health_staging_public "API staging (publik)" "$STAGING_PUBLIC_HEALTH_URL"
    fi
    if [[ "$CHECK_CONTAINERS_ENABLED" == "1" ]]; then
        check_containers prod "produksi" prod_compose
        check_containers staging "staging" staging_compose
    fi
    if [[ "$CHECK_DISK_ENABLED" == "1" ]]; then check_disk; fi
    if [[ "$CHECK_MEMORY_ENABLED" == "1" ]]; then check_memory; fi
    if [[ "$CHECK_BACKUP_ENABLED" == "1" ]]; then check_backup_age; fi
    if [[ "$CHECK_CERTIFICATE_ENABLED" == "1" ]]; then
        check_tls tls_prod "$PROD_SITE_HOST"
        check_tls tls_staging "$STAGING_SITE_HOST"
    fi
    if [[ "$CHECK_ERRORS_ENABLED" == "1" ]]; then check_error_burst; fi
}

main() {
    local mode=check
    DRY_RUN=0

    for arg in "$@"; do
        case "$arg" in
            --dry-run) DRY_RUN=1 ;;
            --test) mode=selftest ;;
            --daily-summary) mode=daily ;;
            --help | -h)
                usage
                exit 0
                ;;
            *)
                echo "unknown option: $arg" >&2
                usage >&2
                exit 2
                ;;
        esac
    done
    export DRY_RUN

    load_config

    # A --test still verifies Telegram wiring even when the platform
    # console has monitoring switched off; the periodic checks and the
    # daily summary respect that switch.
    if [[ "$mode" != "selftest" && "$MONITOR_ENABLED" != "1" ]]; then
        log "monitoring disabled (platform console), skipping"
        exit 0
    fi

    case "$mode" in
        selftest) send_telegram "$(printf 'TES newsekolah\nHost: %s\nWaktu: %s WITA' "$HOST_LABEL" "$(wita_now)")" ;;
        daily) daily_summary ;;
        check) run_checks ;;
    esac
}

main "$@"
