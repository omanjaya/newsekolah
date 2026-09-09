# Infra

Deployment tooling for newsekolah: self-host Docker Compose stack, Caddy reverse proxy, and
operational scripts. Design rationale: `docs/02-system-design.md` section 8, `docs/08-security.md`.

## Layout

```
infra/
  docker/
    docker-compose.dev.yml    local development with hot reload (web, api, Postgres, Redis, MinIO, Mailpit)
    docker-compose.prod.yml   self-host single-school stack
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

## Update

```
bash infra/scripts/update.sh
```

Pulls the latest source, rebuilds images, runs `migrate up`, then restarts `api`, `worker`, and
`web` one at a time, waiting for each to report healthy before moving on. If `api` or `web` fails
its health check the script rolls back to the previous image automatically. `HEALTH_TIMEOUT_SECONDS`
(default 60) controls how long it waits before giving up.

## Backup and restore

Enable the optional backup sidecar (daily `pg_dump` + MinIO mirror to an offsite S3-compatible
bucket):

```
docker compose -f infra/docker/docker-compose.prod.yml --profile backup up -d
```

Schedule and retention come from `.env` (`BACKUP_CRON_SCHEDULE`, `BACKUP_RETENTION_DAYS`). Set
`BACKUP_AGE_RECIPIENT` to an `age` public key to encrypt the Postgres dump before upload; keep the
matching private key somewhere other than this server.

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

## Known gaps and coordination needed

- `api`/`worker` healthchecks in `docker-compose.prod.yml` call `/api --healthcheck`, assuming
  apps/api exposes a self-check subcommand that performs a local `GET /health` and exits
  non-zero on failure. This is needed because the production image is expected to be distroless
  (no shell, curl, or wget available for an exec-form `CMD-SHELL` check). Confirm this flag
  exists in `apps/api/cmd/api`, or adjust the healthcheck to match whatever the final Dockerfile
  provides.
- `docker-compose.prod.yml` builds `web` from `apps/web/Dockerfile`, which does not exist yet
  (apps/web is not built out). The compose file and this doc are ready for it (Next.js
  standalone output, `NEXT_PUBLIC_API_URL` build arg and runtime env) — nothing further should be
  needed here once the Dockerfile lands.
- `.github/workflows/release.yml` builds `apps/web/Dockerfile` too, for the same reason.

## Development

Hot-reload stack for day-to-day work: see [docker/README.dev.md](docker/README.dev.md).
