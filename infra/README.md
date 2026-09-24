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

The same migration also creates `app_platform` with the same default password, for a future
platform-console connection that does not exist yet — nothing in this codebase connects as it
today (`database.WithPlatformTx` just sets `app.platform_admin` on whatever role the caller's pool
already uses, i.e. `app_rw`). Since there is nothing to rotate a real deployment password into,
`migrate` instead runs `ALTER ROLE app_platform NOLOGIN` on every run, so that unused role's
hardcoded default password can never be used to connect. Re-enable `LOGIN` with its own rotated
password if a platform-console process ever needs this role.

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

### Object storage through the shared Caddy

MinIO has no published port in this setup (`expose`-only in `docker-compose.prod.yml`), which is
fine for server-side object operations — `api`/`worker` reach it directly over the compose network
— but not for a presigned URL: those are handed to the _browser_, which cannot resolve the
Docker-internal host `minio:9000` at all, and even if it could, the shared system Caddy owns
80/443 on this host, not MinIO. Every browser-facing presigned PUT/GET (branding logo/favicon,
avatar, leave evidence, counseling and violation attachments, issued letter PDF downloads —
anything using `storage.Client.PresignedPutURL`/`PresignedGetURL`/`PresignedGetURLAsAttachment`)
would otherwise point at an unreachable URL in production.

Fix: set `S3_PUBLIC_ENDPOINT` to this site's own domain, publish MinIO on a loopback port the
same way `api`/`web` already are (`compose.vps.yml` does this, default `127.0.0.1:9011:9000` —
pick any free loopback port and keep the Caddy route below in sync with it), and route a bucket
path prefix to that port from the same system Caddy vhost as the one above. The bucket name is
`S3_BUCKET` (`newsekolah` by default); this path lives at the vhost root, so add it _before_ the
web catch-all in the same site block:

```
sekolah-anda.sch.id {
    @api path /v1/* /health /ws/*
    reverse_proxy @api 127.0.0.1:8081

    handle /newsekolah/* {
        reverse_proxy 127.0.0.1:9011
    }

    reverse_proxy 127.0.0.1:3011
}
```

Why this works, and what to check before relying on it:

- **Host header.** SigV4 signs the request's `Host` header into the signature. Caddy's
  `reverse_proxy` preserves the client's original `Host` by default (it does not rewrite it to the
  upstream address unless told to), and `S3_PUBLIC_ENDPOINT=https://sekolah-anda.sch.id` signs
  URLs expecting exactly that `Host` — so no extra Caddy directive is needed for this to line up,
  but it does mean this silently breaks if a future edit to the vhost adds a header rewrite.
- **No route collision.** `apps/web/app` has no route starting with a bucket-name segment
  (`(app)`, `(auth)`, `(public)`, `api`, `branding-icon` are the only top-level segments), so
  `/<S3_BUCKET>/*` cannot shadow a real page as long as the bucket is never renamed to collide
  with one of those — re-check with `find apps/web/app -maxdepth 1 -type d` after any bucket
  rename.
- **Path style, not virtual-hosted.** Presigned URLs look like
  `https://sekolah-anda.sch.id/newsekolah/<key>?X-Amz-...`, not
  `https://newsekolah.sekolah-anda.sch.id/...` — nothing needs to provision DNS for a
  `<bucket>.<domain>` subdomain.
- **Request body size.** `handle /newsekolah/*` forwards PUT uploads straight to MinIO, not
  through the api process, so `BODY_LIMIT_BYTES` (the api's own limit) does not apply to them —
  MinIO enforces its own (very large) default. The actual ceiling for a given upload is instead
  the presigned URL's TTL (`storage.DefaultUploadURLTTL`, 5 minutes) and whatever size check the
  module's confirm step performs after the fact (docs/08-security.md section 6: avatar 2 MB,
  evidence 6 MB, import 10 MB) — a client can technically PUT more than that limit to MinIO
  itself, but the confirm step then rejects and deletes it rather than recording it as valid.
  System Caddy's own default request body handling applies no additional cap beyond that.

`.env` lines to add for this setup (see `infra/docker/.env.prod.example`):

```
S3_PUBLIC_ENDPOINT=https://sekolah-anda.sch.id
S3_REGION=us-east-1
```

`docker-compose.prod.yml` reads `S3_PUBLIC_ENDPOINT` straight through to `api`/`worker`, and reuses
the same value as `NEXT_PUBLIC_S3_PUBLIC_ORIGIN` for the `web` build/runtime so
`apps/web/middleware.ts`'s CSP allows it in `connect-src` — a no-op here since it is the same
origin as the site itself (already covered by `'self'`), but required if `S3_PUBLIC_ENDPOINT` is
ever a different origin than the web app.

## Development

Hot-reload stack for day-to-day work: see [docker/README.dev.md](docker/README.dev.md).
