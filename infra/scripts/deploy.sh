#!/usr/bin/env bash
# Deploys the api/web images to either the production or staging stack on
# the shared VPS: fetches a git ref, builds api and web, takes a pre-deploy
# database dump (production only), runs migrations, brings up
# api/worker/web, and waits for both to answer their health check within a
# timeout. If either fails to come up healthy, it rolls the api/web image
# tags back to whatever was running before this deploy and brings the
# services back up on them, then exits non-zero.
#
# Usage (run ON the VPS):
#   infra/scripts/deploy.sh <staging|production> [git-ref]
#
# git-ref defaults to "main" if omitted; always pass an explicit commit SHA
# from CI. Production only ever fast-forwards to the given ref (like
# `git pull --ff-only`) -- it refuses a ref that is not a descendant of the
# currently deployed commit, so production never moves backward or
# diverges. Staging has no such restriction: it hard-resets to whatever ref
# is given, forward or backward, because its whole job is to preview
# arbitrary commits before they reach production.
#
# Checkout directories, compose files, and image tags are fixed per target
# and never mixed:
#   staging:    /root/sion-staging   docker-compose.prod.yml + compose.staging.yml   newsekolah-*:staging
#   production: /root/sion           docker-compose.prod.yml + compose.vps.yml       newsekolah-*:local
# Before building, this script reads API_IMAGE/WEB_IMAGE out of the target
# checkout's infra/docker/.env and refuses to continue if either does not
# end in the tag suffix expected for that target -- a checkout whose .env
# was copy-pasted from the other stack is refused instead of silently
# building (or worse, rolling back onto) the wrong stack's images.
#
# Locking: a per-target flock (/tmp/newsekolah-deploy-<target>.lock) refuses
# a second concurrent deploy of the *same* target; staging and production
# deploys never block each other since they are independent stacks.
#
# Rollback covers the api/web *image tags* only, by retagging them back to
# the image IDs recorded before this run started and bringing the services
# back up on them -- it does not touch the database. `migrate up` only ever
# runs forward, additive migrations by repo policy (docs/03-layered-
# architecture.md), so leaving a migration applied after an image rollback
# is expected to be safe. If a migration itself is what broke things, that
# needs a manual decision, not an automatic one:
#   - production: restore the pre-deploy dump this script took, printed in
#     the failure summary (also see infra/README.md "Continuous
#     deployment"):
#       docker compose -f infra/docker/docker-compose.prod.yml \
#         -f infra/docker/compose.vps.yml exec -T postgres \
#         pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
#         --clean --if-exists --no-owner < /root/sion-backups/predeploy-<stamp>.dump
#   - staging: reseed instead (infra/README.md "Staging (shared VPS)") --
#     staging only ever holds demo data, so there is no dump to restore.
#
# Set DRY_RUN=1 to print every command this script would run for the given
# target and ref, without running git, Docker, curl, or pg_dump, and without
# requiring the target checkout directory to exist. Useful to sanity-check
# the plan for both targets from a laptop before trusting it on the VPS.
set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-120}"
HEALTH_POLL_INTERVAL_SECONDS="${HEALTH_POLL_INTERVAL_SECONDS:-3}"
PREDEPLOY_BACKUP_DIR="${PREDEPLOY_BACKUP_DIR:-/root/sion-backups}"
PREDEPLOY_KEEP="${PREDEPLOY_KEEP:-10}"

CONFIGURED=0

log() { printf '==> %s\n' "$1"; }
fail() {
    printf 'error: %s\n' "$1" >&2
    [[ "$CONFIGURED" == "1" ]] && print_summary "FAILED" "$1" >&2
    exit 1
}

usage() {
    printf 'usage: %s <staging|production> [git-ref]\n' "$0" >&2
}

# Runs its arguments for real, or in DRY_RUN mode prints them shell-quoted
# and returns success without running anything. Every command with a
# real-world side effect (git, docker, compose, curl, pg_dump, mkdir, rm,
# flock) goes through this, so DRY_RUN=1 is a complete, side-effect-free
# trace of the plan.
run_cmd() {
    if [[ "$DRY_RUN" == "1" ]]; then
        printf 'DRY-RUN  %s\n' "$(printf '%q ' "$@")"
        return 0
    fi
    "$@"
}

# Same idea for a command whose stdout this script needs to read further
# (image IDs, .env values, http status codes): in DRY_RUN it prints the
# command it would have run and returns a placeholder instead of executing
# it, so later steps still have something to interpolate into the commands
# *they* print.
read_cmd() {
    local placeholder="$1"
    shift
    if [[ "$DRY_RUN" == "1" ]]; then
        printf 'DRY-RUN  %s\n' "$(printf '%q ' "$@")" >&2
        printf '%s' "$placeholder"
        return 0
    fi
    "$@"
}

[[ $# -ge 1 && $# -le 2 ]] || {
    usage
    exit 1
}

TARGET="$1"
REF="${2:-main}"

case "$TARGET" in
    staging)
        CHECKOUT_DIR="${DEPLOY_CHECKOUT_DIR:-/root/sion-staging}"
        COMPOSE_FILE_NAMES=(docker-compose.prod.yml compose.staging.yml)
        EXPECTED_IMAGE_SUFFIX=":staging"
        API_PORT=8082
        WEB_PORT=3012
        FAST_FORWARD_ONLY=0
        TAKE_PREDEPLOY_DUMP=0
        ;;
    production)
        CHECKOUT_DIR="${DEPLOY_CHECKOUT_DIR:-/root/sion}"
        COMPOSE_FILE_NAMES=(docker-compose.prod.yml compose.vps.yml)
        EXPECTED_IMAGE_SUFFIX=":local"
        API_PORT=8081
        WEB_PORT=3011
        FAST_FORWARD_ONLY=1
        TAKE_PREDEPLOY_DUMP=1
        ;;
    *)
        usage
        fail "unknown target '${TARGET}' (expected 'staging' or 'production')"
        ;;
esac

COMPOSE=(docker compose)
for f in "${COMPOSE_FILE_NAMES[@]}"; do
    COMPOSE+=(-f "infra/docker/${f}")
done

ENV_FILE="${CHECKOUT_DIR}/infra/docker/.env"
CONFIGURED=1

env_value() {
    local key="$1"
    if [[ "$DRY_RUN" == "1" ]]; then
        printf '<%s>' "$key"
        return 0
    fi
    grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2-
}

acquire_lock() {
    [[ "$DRY_RUN" == "1" ]] && return 0
    local lock_file="/tmp/newsekolah-deploy-${TARGET}.lock"
    exec 200>"$lock_file"
    flock -n 200 || fail "another deploy of ${TARGET} is already running (lock: ${lock_file})"
}

enter_checkout() {
    if [[ "$DRY_RUN" == "1" ]]; then
        printf 'DRY-RUN  cd %s\n' "$(printf '%q' "$CHECKOUT_DIR")"
        return 0
    fi
    [[ -d "$CHECKOUT_DIR" ]] || fail "checkout directory ${CHECKOUT_DIR} does not exist"
    cd "$CHECKOUT_DIR"
}

verify_image_tags() {
    local api_image web_image
    api_image="$(env_value API_IMAGE)"
    web_image="$(env_value WEB_IMAGE)"
    [[ -n "$api_image" && "$api_image" != "<API_IMAGE>" ]] || api_image="newsekolah-api${EXPECTED_IMAGE_SUFFIX}"
    [[ -n "$web_image" && "$web_image" != "<WEB_IMAGE>" ]] || web_image="newsekolah-web${EXPECTED_IMAGE_SUFFIX}"

    case "$api_image" in
        *"$EXPECTED_IMAGE_SUFFIX") ;;
        *) fail "refusing to deploy: ${ENV_FILE} sets API_IMAGE=${api_image}, expected a tag ending in '${EXPECTED_IMAGE_SUFFIX}' for target '${TARGET}' (production and staging images must never mix)" ;;
    esac
    case "$web_image" in
        *"$EXPECTED_IMAGE_SUFFIX") ;;
        *) fail "refusing to deploy: ${ENV_FILE} sets WEB_IMAGE=${web_image}, expected a tag ending in '${EXPECTED_IMAGE_SUFFIX}' for target '${TARGET}' (production and staging images must never mix)" ;;
    esac

    API_IMAGE_TAG="$api_image"
    WEB_IMAGE_TAG="$web_image"
}

previous_image_id() {
    local service="$1"
    read_cmd "<previous-${service}-image-id>" "${COMPOSE[@]}" images -q "$service"
}

fetch_and_checkout() {
    log "fetching ${REF}"
    run_cmd git fetch --quiet origin "${REF}:refs/deploy/incoming"

    if [[ "$FAST_FORWARD_ONLY" == "1" ]]; then
        log "fast-forwarding to ${REF}"
        run_cmd git merge --ff-only refs/deploy/incoming ||
            fail "ref ${REF} is not a fast-forward from the current HEAD; production only ever moves forward"
    else
        log "resetting to ${REF}"
        run_cmd git reset --hard refs/deploy/incoming
    fi
}

build_images() {
    log "building api and web images"
    run_cmd "${COMPOSE[@]}" build api web
}

predeploy_dump() {
    [[ "$TAKE_PREDEPLOY_DUMP" == "1" ]] || return 0

    local pg_user pg_db stamp dump_file
    pg_user="$(env_value POSTGRES_USER)"
    pg_db="$(env_value POSTGRES_DB)"
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    dump_file="${PREDEPLOY_BACKUP_DIR}/predeploy-${stamp}.dump"
    PREDEPLOY_DUMP_FILE="$dump_file"

    log "taking pre-deploy database dump to ${dump_file}"
    run_cmd mkdir -p "$PREDEPLOY_BACKUP_DIR" || fail "could not create ${PREDEPLOY_BACKUP_DIR}"
    if [[ "$DRY_RUN" == "1" ]]; then
        printf 'DRY-RUN  %s exec -T postgres pg_dump -U %s -d %s --format=custom > %s\n' \
            "${COMPOSE[*]}" "$pg_user" "$pg_db" "$dump_file"
    else
        "${COMPOSE[@]}" exec -T postgres pg_dump -U "$pg_user" -d "$pg_db" --format=custom >"$dump_file" ||
            fail "pre-deploy pg_dump failed"
        [[ -s "$dump_file" ]] || fail "pre-deploy dump ${dump_file} is empty"
    fi

    log "pruning pre-deploy dumps older than the last ${PREDEPLOY_KEEP}"
    if [[ "$DRY_RUN" == "1" ]]; then
        printf 'DRY-RUN  keep newest %s of %s/predeploy-*.dump, delete the rest\n' "$PREDEPLOY_KEEP" "$PREDEPLOY_BACKUP_DIR"
    else
        local old_dumps
        old_dumps="$(find "$PREDEPLOY_BACKUP_DIR" -maxdepth 1 -name 'predeploy-*.dump' -printf '%T@ %p\n' 2>/dev/null |
            sort -rn | tail -n "+$((PREDEPLOY_KEEP + 1))" | cut -d' ' -f2-)"
        if [[ -n "$old_dumps" ]]; then
            while IFS= read -r old_dump; do
                rm -f -- "$old_dump"
            done <<<"$old_dumps"
        fi
    fi
}

run_migrations() {
    log "running database migrations"
    run_cmd "${COMPOSE[@]}" run --rm migrate
}

bring_up() {
    log "starting api, worker, web"
    run_cmd "${COMPOSE[@]}" up -d --no-build api worker web
}

wait_for_http_200() {
    local url="$1" label="$2" waited=0 code

    log "waiting for ${label} to return 200 (${url})"
    if [[ "$DRY_RUN" == "1" ]]; then
        printf 'DRY-RUN  poll curl -s -o /dev/null -w %%{http_code} %s every %ss for up to %ss\n' \
            "$url" "$HEALTH_POLL_INTERVAL_SECONDS" "$HEALTH_TIMEOUT_SECONDS"
        return 0
    fi

    while true; do
        code="$(curl -sS -o /dev/null -w '%{http_code}' -m 5 "$url" 2>/dev/null || echo 000)"
        if [[ "$code" == "200" ]]; then
            log "${label} is up (200)"
            return 0
        fi
        [[ "$waited" -ge "$HEALTH_TIMEOUT_SECONDS" ]] && {
            log "${label} still returning ${code} after ${HEALTH_TIMEOUT_SECONDS}s"
            return 1
        }
        sleep "$HEALTH_POLL_INTERVAL_SECONDS"
        waited=$((waited + HEALTH_POLL_INTERVAL_SECONDS))
    done
}

rollback() {
    local reason="$1"
    log "DEPLOY FAILED: ${reason}"
    log "rolling back api/web to their pre-deploy images"

    if [[ -n "${PREV_API_ID:-}" && "$PREV_API_ID" != "<previous-api-image-id>" ]]; then
        run_cmd docker tag "$PREV_API_ID" "$API_IMAGE_TAG"
    else
        log "no previous api image recorded -- skipping api rollback, leaving it as deployed"
    fi
    if [[ -n "${PREV_WEB_ID:-}" && "$PREV_WEB_ID" != "<previous-web-image-id>" ]]; then
        run_cmd docker tag "$PREV_WEB_ID" "$WEB_IMAGE_TAG"
    else
        log "no previous web image recorded -- skipping web rollback, leaving it as deployed"
    fi

    run_cmd "${COMPOSE[@]}" up -d --no-build api worker web || true

    print_summary "FAILED" "$reason"
    exit 1
}

print_summary() {
    local status="$1" detail="${2:-}"
    printf '\n==================== deploy summary ====================\n'
    printf 'target:        %s\n' "$TARGET"
    printf 'ref:           %s\n' "$REF"
    printf 'checkout:      %s\n' "$CHECKOUT_DIR"
    printf 'compose files: %s\n' "${COMPOSE_FILE_NAMES[*]}"
    printf 'api image:     %s\n' "${API_IMAGE_TAG:-unknown}"
    printf 'web image:     %s\n' "${WEB_IMAGE_TAG:-unknown}"
    [[ -n "${PREDEPLOY_DUMP_FILE:-}" ]] && printf 'predeploy dump: %s\n' "$PREDEPLOY_DUMP_FILE"
    printf 'status:        %s\n' "$status"
    [[ -n "$detail" ]] && printf 'detail:        %s\n' "$detail"
    printf '==========================================================\n\n'
}

main() {
    acquire_lock
    enter_checkout
    verify_image_tags

    log "recording currently running image IDs"
    PREV_API_ID="$(previous_image_id api)"
    PREV_WEB_ID="$(previous_image_id web)"

    fetch_and_checkout
    build_images || fail "image build failed -- nothing was brought up, api/web are still on their pre-deploy images"
    predeploy_dump
    run_migrations || fail "database migration failed -- api/web are still on their pre-deploy images, nothing was brought up yet$( [[ -n "${PREDEPLOY_DUMP_FILE:-}" ]] && printf '; if it corrupted data, restore the pre-deploy dump: %s' "$PREDEPLOY_DUMP_FILE" )"

    bring_up || rollback "compose up -d failed"
    wait_for_http_200 "http://127.0.0.1:${API_PORT}/health" "api /health" ||
        rollback "api /health did not return 200 within ${HEALTH_TIMEOUT_SECONDS}s"
    wait_for_http_200 "http://127.0.0.1:${WEB_PORT}/login" "web /login" ||
        rollback "web /login did not return 200 within ${HEALTH_TIMEOUT_SECONDS}s"

    log "deploy complete"
    print_summary "OK"
}

main "$@"
