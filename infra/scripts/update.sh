#!/usr/bin/env bash
# Pulls the latest code/images, runs migrations, and rolling-restarts
# api/worker/web with a health check gate. Rolls back to the previous images
# automatically if the new ones fail their health check.
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/newsekolah}"
COMPOSE_FILE="infra/docker/docker-compose.prod.yml"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-60}"

# Space-separated list of additional compose files layered on top of
# COMPOSE_FILE, e.g. COMPOSE_EXTRA_FILES="infra/docker/compose.vps.yml" for
# a host running a shared system Caddy (infra/README.md "Shared system
# Caddy (VPS)"). Paths are relative to DEPLOY_DIR.
COMPOSE=(docker compose -f "$COMPOSE_FILE")
for extra_file in ${COMPOSE_EXTRA_FILES:-}; do
    COMPOSE+=(-f "$extra_file")
done

log() { printf '==> %s\n' "$1"; }
fail() {
    printf 'error: %s\n' "$1" >&2
    exit 1
}

cd "$DEPLOY_DIR"

previous_image_id() {
    local service="$1"
    "${COMPOSE[@]}" images -q "$service" 2>/dev/null | head -n1
}

pull_latest() {
    log "pulling latest source"
    git pull --ff-only

    log "pulling/building latest images"
    "${COMPOSE[@]}" build api web
}

run_migrations() {
    log "running database migrations"
    "${COMPOSE[@]}" run --rm migrate
}

wait_healthy() {
    local service="$1"
    local waited=0

    log "waiting for ${service} to become healthy"
    while true; do
        local status
        status="$("${COMPOSE[@]}" ps --format json "$service" 2>/dev/null \
            | grep -o '"Health":"[a-z]*"' | cut -d'"' -f4 || true)"

        [[ "$status" == "healthy" ]] && return 0
        [[ "$waited" -ge "$HEALTH_TIMEOUT_SECONDS" ]] && return 1

        sleep 2
        waited=$((waited + 2))
    done
}

rolling_restart() {
    local prev_api prev_web
    prev_api="$(previous_image_id api)"
    prev_web="$(previous_image_id web)"

    log "restarting api"
    "${COMPOSE[@]}" up -d --no-deps --no-build api
    if ! wait_healthy api; then
        log "api failed health check, rolling back"
        rollback_service api "$prev_api"
        fail "update aborted: api did not become healthy"
    fi

    log "restarting worker"
    "${COMPOSE[@]}" up -d --no-deps --no-build worker

    log "restarting web"
    "${COMPOSE[@]}" up -d --no-deps --no-build web
    sleep 5
    if [[ "$("${COMPOSE[@]}" ps --status running -q web)" == "" ]]; then
        log "web failed to start, rolling back"
        rollback_service web "$prev_web"
        fail "update aborted: web did not start"
    fi
}

rollback_service() {
    local service="$1"
    local image_id="$2"

    [[ -n "$image_id" ]] || {
        log "no previous image recorded for ${service}, cannot auto-rollback"
        return
    }

    "${COMPOSE[@]}" stop "$service"
    docker tag "$image_id" "newsekolah-${service}:rollback"
    NEWSEKOLAH_ROLLBACK_IMAGE="newsekolah-${service}:rollback" \
        "${COMPOSE[@]}" up -d --no-deps --no-build "$service"
}

main() {
    pull_latest
    run_migrations
    rolling_restart
    log "update complete"
}

main "$@"
