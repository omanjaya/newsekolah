# Infra

Deployment tooling for newsekolah: self-host Docker Compose stack, Caddy reverse proxy, and
operational scripts. Design rationale: `docs/02-system-design.md` section 8, `docs/08-security.md`.

## Layout

```
infra/
  docker/
    docker-compose.dev.yml    local development with hot reload (web, api, Postgres, Redis, MinIO, Mailpit)
    docker-compose.prod.yml   self-host single-school stack
    compose.vps.yml           override: shared system Caddy instead of the bundled one (no secrets)
    .env.prod.example         template for infra/docker/.env
    backup/                   backup sidecar image
  caddy/
    Caddyfile                 reverse proxy: TLS, routing, security headers
  scripts/
    bootstrap.sh              first install on a fresh VPS
    backup.sh                 pg_dump + MinIO mirror to an S3 target
    restore.sh                restore from a backup.sh archive
    update.sh                 pull, migrate, rolling restart, rollback on failure
    check-no-emoji.sh         CI: no pictographic emoji outside reference/
    check-migrations.sh       CI: migrations are sequential and paired
```

## Self-host install (single school)

Target: a fresh Ubuntu 24.04 VPS, 2 vCPU / 4 GB minimum (docs/09-tech-stack.md section 1).

1. Point the school's domain at the VPS (A/AAAA record).
2. On the VPS:
   ```
   curl -fsSL https://raw.githubusercontent.com/<org>/newsekolah/main/infra/scripts/bootstrap.sh | bash
   ```
   Or, having cloned the repo already:
   ```
   bash infra/scripts/bootstrap.sh
   ```
   This installs Docker if missing, clones/updates the deploy directory (`/opt/newsekolah` by
   default, override with `DEPLOY_DIR`), creates `infra/docker/.env` from
   `infra/docker/.env.prod.example` with generated secrets, brings the stack up, and runs
   `/bootstrap` inside the `api` container to create the school's tenant and first admin.
3. Follow the printed next steps (DNS check, admin password-set link, enabling backups).

Manual install: copy `infra/docker/.env.prod.example` to `infra/docker/.env`, fill in every
value (the api refuses to start with an empty secret — docs/08-security.md section 8), then:

```
docker compose -f infra/docker/docker-compose.prod.yml up -d --build --wait
docker compose -f infra/docker/docker-compose.prod.yml exec api /bootstrap \
  --school-name "SMA Contoh" --admin-email admin@sekolah.sch.id
```

`api` and `worker` connect to Postgres as `app_rw`, a least-privilege role with no superuser or
`BYPASSRLS` grant (created by `apps/api/migrations/0004_db_roles.up.sql`), never as
`POSTGRES_USER` — a superuser always bypasses row level security, which would silently disable
tenant isolation (docs/08-security.md section 4). Set `APP_DB_PASSWORD` in `.env`; the `migrate`
service rotates `app_rw`'s password to that value via `ALTER ROLE` on every run, so its
migration-time default (`change-me-in-production`) is never left active, and `migrate` refuses to
run in production without `APP_DB_PASSWORD` set. `api`/`worker` also refuse to start in production
if they ever find themselves connected as a superuser or `BYPASSRLS` role regardless.

## Update

```
bash infra/scripts/update.sh
```

Pulls the latest source, rebuilds images, runs `migrate up`, then restarts `api`, `worker`, and
`web` one at a time (`up -d --no-build`, reusing the images just built rather than letting compose
decide whether to rebuild), waiting for each to report healthy before moving on. If `api` or `web`
fails its health check the script rolls back to the previous image automatically.
`HEALTH_TIMEOUT_SECONDS` (default 60) controls how long it waits before giving up.

Set `COMPOSE_EXTRA_FILES` (space-separated, paths relative to `DEPLOY_DIR`) to layer override
files such as `infra/docker/compose.vps.yml` on top of `docker-compose.prod.yml` for every command
the script runs, e.g. `COMPOSE_EXTRA_FILES=infra/docker/compose.vps.yml bash infra/scripts/update.sh`.

## Backup and restore

Enable the optional backup sidecar (daily `pg_dump` + MinIO mirror to an offsite S3-compatible
bucket):

```
docker compose -f infra/docker/docker-compose.prod.yml --profile backup up -d
```

Schedule and retention come from `.env` (`BACKUP_CRON_SCHEDULE`, `BACKUP_RETENTION_DAYS`).
`BACKUP_AGE_RECIPIENT` (an `age` public key) is required: `infra/scripts/backup.sh` refuses to run
without it rather than upload an unencrypted Postgres dump. Keep the matching private key
somewhere other than this server.

Run a backup on demand:

```
make prod-backup
```

Restore (always confirms before writing; use `--dry-run` first):

```
bash infra/scripts/restore.sh --dry-run postgres-20260101T020000Z.dump
bash infra/scripts/restore.sh postgres-20260101T020000Z.dump
bash infra/scripts/restore.sh --with-storage postgres-20260101T020000Z.dump   # also restores MinIO
```

An age-encrypted dump (`*.dump.age`) needs `AGE_IDENTITY_FILE` pointing at the matching private
key.

## Switching to multi-tenant SaaS mode

Single-school self-host and multi-tenant SaaS run the same images; only `TENANCY_MODE` and the
Caddy routing differ (docs/02-system-design.md section 8, docs/08-security.md section 4).

1. Set `TENANCY_MODE=multi` in `.env`. The api resolves the tenant from the request host or the
   `tid` token claim instead of assuming a single tenant.
2. Set `BASE_DOMAIN` (the platform's own domain, e.g. `app.newsekolah.id`) and provision wildcard
   DNS for `*.${BASE_DOMAIN}` at your DNS provider.
3. Swap in the commented multi-tenant block at the bottom of `infra/caddy/Caddyfile`:
   - The wildcard site block needs a DNS-01 challenge (HTTP-01 cannot issue wildcard certs), so
     the Caddy image must be built with the matching `caddy-dns/*` module via `xcaddy` and the
     provider's API token supplied as `CF_API_TOKEN` (or equivalent).
   - The on-demand TLS block issues certificates for verified custom domains (a school's own
     domain instead of the platform wildcard) by calling back to
     `http://api:8080/internal/tls-check`, which must return 200 only for a domain that is
     registered and verified for a tenant — never allow unauthenticated on-demand issuance.
4. Provision a platform admin account (separate role from school admins) through the platform
   console once `apps/web` ships its admin route group (docs/09-tech-stack.md section 3).
5. Everything else — Postgres RLS, Redis/S3 key prefixing, River job tenant scoping — already
   assumes multi-tenant isolation (docs/08-security.md section 4); no schema change is needed.

## Shared system Caddy (VPS)

For a VPS that already runs one Caddy instance in front of several projects, use
`infra/docker/compose.vps.yml` instead of the bundled `caddy` service: it publishes `api` and
`web` on loopback only and leaves 80/443 to the host's own Caddy.

```
docker compose -f infra/docker/docker-compose.prod.yml -f infra/docker/compose.vps.yml up -d
```

or export `COMPOSE_EXTRA_FILES=infra/docker/compose.vps.yml` before running
`infra/scripts/update.sh` so every subsequent update picks it up automatically. This override:

- Publishes `api` on `127.0.0.1:8081` and `web` on `127.0.0.1:3011` (matching ports already in use
  for this project's production deployment — see the team's VPS runbook for the current host).
- Uses `quay.io/minio/minio` and `quay.io/minio/mc` instead of the Docker Hub images, to avoid
  anonymous pull rate limits on a shared host.
- Moves the bundled `caddy` service behind a `bundled-caddy` profile that nothing activates, so
  `docker compose up -d` never starts it or binds 80/443.

Add a site block to the system Caddy's own Caddyfile routing the same way
`infra/caddy/Caddyfile` does, just against the published loopback ports instead of the compose
service names:

```
sekolah-anda.sch.id {
    @api path /v1/* /health /ws/*
    reverse_proxy @api 127.0.0.1:8081
    reverse_proxy 127.0.0.1:3011
}
```

Set `TRUSTED_PROXIES=127.0.0.1/32` in `.env` so the api trusts `X-Forwarded-*` headers from the
system Caddy (client IP, scheme) — it connects over loopback, so that CIDR is exact, not just a
convenience default.

## Development

Hot-reload stack for day-to-day work: see [docker/README.dev.md](docker/README.dev.md).
