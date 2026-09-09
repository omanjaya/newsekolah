#!/usr/bin/env bash
# First install on a fresh Ubuntu 24.04 VPS: checks/installs Docker, lays out
# the deploy directory, prepares .env, brings the stack up, and creates the
# first tenant + admin. Safe to re-run; steps that already succeeded are
# skipped. See infra/README.md for the full self-host install guide.
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/newsekolah}"
REPO_URL="${REPO_URL:-https://github.com/arimartana/newsekolah.git}"
COMPOSE_FILE="infra/docker/docker-compose.prod.yml"

log() { printf '==> %s\n' "$1"; }
fail() {
    printf 'error: %s\n' "$1" >&2
    exit 1
}

require_root_or_sudo() {
    if [[ "$(id -u)" -ne 0 ]] && ! command -v sudo >/dev/null 2>&1; then
        fail "run as root or install sudo first"
    fi
}

as_root() {
    if [[ "$(id -u)" -eq 0 ]]; then
        "$@"
    else
        sudo "$@"
    fi
}

install_docker_if_missing() {
    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
        log "Docker and Compose plugin already installed"
        return
    fi

    log "installing Docker Engine (official convenience script)"
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    as_root sh /tmp/get-docker.sh
    rm -f /tmp/get-docker.sh

    if [[ "$(id -u)" -ne 0 ]]; then
        as_root usermod -aG docker "$(whoami)"
        log "added $(whoami) to the docker group; log out and back in for it to take effect"
    fi
}

prepare_deploy_dir() {
    log "preparing $DEPLOY_DIR"
    as_root mkdir -p "$DEPLOY_DIR"
    as_root chown "$(id -u):$(id -g)" "$DEPLOY_DIR"

    if [[ -d "$DEPLOY_DIR/.git" ]]; then
        log "repository already present, pulling latest"
        git -C "$DEPLOY_DIR" pull --ff-only
    else
        log "cloning $REPO_URL"
        git clone --depth 1 "$REPO_URL" "$DEPLOY_DIR"
    fi
}

generate_secret() {
    openssl rand -hex 32
}

prepare_env_file() {
    local env_file="$DEPLOY_DIR/infra/docker/.env"
    local example_file="$DEPLOY_DIR/infra/docker/.env.prod.example"

    if [[ -f "$env_file" ]]; then
        log ".env already exists, leaving it untouched"
        return
    fi

    [[ -f "$example_file" ]] || fail "missing $example_file"
    log "creating .env from .env.prod.example"
    cp "$example_file" "$env_file"

    read -r -p "Site domain (e.g. sekolah-anda.sch.id): " site_domain
    [[ -n "$site_domain" ]] || fail "site domain is required"

    local postgres_password jwt_signing_key s3_secret_key
    postgres_password="$(generate_secret)"
    s3_secret_key="$(generate_secret)"
    if jwt_signing_key="$(cd "$DEPLOY_DIR/apps/api" && go run ./cmd/keygen 2>/dev/null)"; then
        :
    else
        jwt_signing_key="$(generate_secret)"
    fi

    sed -i.bak \
        -e "s|^SITE_DOMAIN=.*|SITE_DOMAIN=${site_domain}|" \
        -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${postgres_password}|" \
        -e "s|^JWT_SIGNING_KEY=.*|JWT_SIGNING_KEY=${jwt_signing_key}|" \
        -e "s|^S3_ACCESS_KEY=.*|S3_ACCESS_KEY=newsekolah|" \
        -e "s|^S3_SECRET_KEY=.*|S3_SECRET_KEY=${s3_secret_key}|" \
        "$env_file"
    rm -f "${env_file}.bak"

    log "generated secrets written to $env_file — back it up somewhere safe"
}

bring_stack_up() {
    log "starting the stack (this also builds images on first run)"
    (cd "$DEPLOY_DIR" && docker compose -f "$COMPOSE_FILE" up -d --build --wait)
}

create_first_tenant() {
    log "creating the first tenant and admin account"
    read -r -p "School name: " school_name
    read -r -p "Admin email: " admin_email
    [[ -n "$school_name" && -n "$admin_email" ]] || fail "school name and admin email are required"

    (cd "$DEPLOY_DIR" && docker compose -f "$COMPOSE_FILE" exec -T api \
        /bootstrap --school-name "$school_name" --admin-email "$admin_email")
}

print_next_steps() {
    local site_domain
    site_domain="$(grep -E '^SITE_DOMAIN=' "$DEPLOY_DIR/infra/docker/.env" | cut -d= -f2-)"
    cat <<EOF

Setup complete.

  Web:      https://${site_domain}
  API:      https://${site_domain}/v1
  Deploy:   $DEPLOY_DIR

Next steps:
  1. Point SITE_DOMAIN's DNS A/AAAA record at this server if not already done.
  2. Check the admin account email/WhatsApp for the initial password-set link.
  3. Enable scheduled backups: infra/scripts/backup.sh (see infra/README.md),
     or run with the "backup" profile: docker compose --profile backup up -d.
  4. Review infra/docker/.env and remove infra/docker/.env.prod.example.bak
     files if any sed backups remain.

EOF
}

main() {
    require_root_or_sudo
    install_docker_if_missing
    prepare_deploy_dir
    prepare_env_file
    bring_stack_up
    create_first_tenant
    print_next_steps
}

main "$@"
