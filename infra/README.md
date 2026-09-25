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
    deploy.sh                 CI/CD entry point: fetch a ref, build, migrate, deploy, health-gate, roll back
    deploy-ssh-wrapper.sh     authorized_keys forced command for the CI deploy key (only runs deploy.sh)
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

`api` validates every request against `openapi/openapi.yaml` (`OPENAPI_VALIDATION` in `.env`,
default `log` in production per `infra/docker/.env.prod.example`): a request that does not match
the spec is only logged (`openapi_validation_failed`, with the operation and field), never
rejected, so a spec that is momentarily behind the code an update just deployed cannot itself take
the site down. Watch the `api` logs for that message after an update that touched
`openapi/openapi.yaml`; a repeated hit means the spec needs a fix (regenerate with
`pnpm openapi:bundle` after editing `openapi/modules/*.yaml`, then `cd apps/api && go generate
./internal/gen/api/...` and `pnpm api:gen`). Set `OPENAPI_VALIDATION=enforce` only once the spec is
known to be in sync, and `=off` to disable the check entirely.

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

After `pg_restore` finishes, `restore.sh` runs a smoke check against `$DATABASE_URL` before
touching object storage: it connects, counts rows in `tenants` and `users` (a restore that leaves
either table empty did not actually bring the data back), and checks `schema_migrations.dirty`
(a dirty flag means golang-migrate was interrupted mid-migration and the schema cannot be trusted).
Any of those checks failing prints `SMOKE CHECK FAILED: ...` and exits non-zero before
`--with-storage` restores MinIO, so a bad Postgres restore is caught before it can be compounded by
overwriting object storage too. `--dry-run` only prints the checks it would run.

### Local encrypted backup (single host)

`infra/scripts/backup-local.sh` is the backup the shared VPS runs today. It
dumps Postgres (`pg_dump --format=custom` through the compose `postgres`
service) and archives the MinIO data volume, encrypts both with `age`, and
keeps them in `/root/backups/newsekolah` for 14 days. `LAST_SUCCESS` in that
directory holds the time of the last good run. It protects against deleted
data, a bad migration, or an application bug; it does not survive losing the
host, so add the offsite `backup.sh` target before production data matters
for more than one school.

Only the age public key lives on the server
(`/etc/newsekolah/backup-age-recipient.txt`). The private key stays with the
operator (on the maintainer's machine at `~/.config/newsekolah/backup-age-key.txt`,
with a copy in a password manager). Without it the backups cannot be read,
so never copy it to the server.

Setup on a host:

```bash
apt-get install -y age
mkdir -p /etc/newsekolah
echo "age1..." > /etc/newsekolah/backup-age-recipient.txt   # public key only
/root/sion/infra/scripts/backup-local.sh                      # first run
( crontab -l; echo "0 18 * * * /root/sion/infra/scripts/backup-local.sh >> /var/log/newsekolah-backup.log 2>&1" ) | crontab -
```

`0 18 * * *` is 02:00 WITA (the VPS clock is UTC). Check health with
`cat /root/backups/newsekolah/LAST_SUCCESS` and
`tail /var/log/newsekolah-backup.log`.

Restore from a local backup:

```bash
# on the operator machine, which holds the private key
scp root@HOST:/root/backups/newsekolah/postgres-<STAMP>.dump.age .
age -d -i ~/.config/newsekolah/backup-age-key.txt -o pg.dump postgres-<STAMP>.dump.age
scp pg.dump root@HOST:/tmp/pg.dump
# on the host, with the api and worker stopped
docker compose -f docker-compose.prod.yml -f compose.vps.yml stop api worker
docker compose -f docker-compose.prod.yml -f compose.vps.yml exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner < /tmp/pg.dump
docker compose -f docker-compose.prod.yml -f compose.vps.yml up -d --no-build api worker
```

A restore drill on 25 September 2026 decrypted the first backup on the
operator machine and restored it into a throwaway Postgres 16: schema
version, roles, users, duty types and permissions matched production. The
only restore errors were grants to `app_rw`/`app_platform`, which do not
exist in a bare container and do exist on the real host.

### Restore drill

docs/08-security.md section 9 requires a monthly automated restore test; this is how to run one
manually and what "passing" means.

1. Take the latest object from `target/${BACKUP_S3_BUCKET}/postgres/` (or run `make prod-backup`
   first to produce a fresh one).
2. Point `DATABASE_URL` at a **scratch** database, never the production one -- `restore.sh` runs
   `pg_restore --clean --if-exists`, which drops and recreates every object it finds. A throwaway
   Postgres container (`docker run --rm -e POSTGRES_PASSWORD=drill -p 5433:5432 postgres:16`) or a
   dedicated `*_restore_drill` database on a non-production instance both work.
3. Run the restore against that database:
   ```
   DATABASE_URL=postgresql://postgres:drill@localhost:5433/postgres \
     bash infra/scripts/restore.sh postgres-20260101T020000Z.dump
   ```
4. A drill passes when the script prints `smoke check passed` and exits 0. If it exits non-zero
   with a `SMOKE CHECK FAILED` line, the backup (or the backup pipeline) is broken -- treat that as
   an incident, not something to retry quietly, since it means the last N days of backups may be
   unusable in a real disaster.
5. Tear down the scratch database/container afterward; a drill never needs `--with-storage` unless
   you are specifically validating the MinIO mirror too.
6. Record the drill (date, backup object tested, pass/fail) wherever the school's operational log
   lives, so a gap in monthly drills is visible.

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

## Staging (shared VPS)

`https://staging.sion.nouma.id` runs the same images and topology as
production (system Caddy, HTTPS/WSS, Redis, app_rw with RLS,
OPENAPI_VALIDATION=enforce) with demo data only. Use it to run the
simulation suite and to try a change before it reaches production.

- Checkout: `/root/sion-staging` (branch `fix/schedule-grid-alignment`), its
  own `infra/docker/.env` with its own secrets. Never copy production's
  `.env`: the base compose file loads `env_file: .env`, so staging must run
  from its own directory.
- Compose: `docker-compose.prod.yml` + `compose.staging.yml` (project
  `newsekolah-staging`, images `newsekolah-*:staging`, loopback ports api
  8082, web 3012, MinIO 9012). Do not add `compose.vps.yml`.
- Outbound messaging is off: no SMTP, WhatsApp `noop`, no push keys.
- DNS: `staging.sion` A record in the `nouma.id` zone (Hostinger) to the VPS.
  Caddy vhost `staging.sion.nouma.id` sends `X-Robots-Tag: noindex, nofollow`.
- Demo accounts come from `cmd/seed` with the staging `SEED_PASSWORD`
  (kept on the maintainer's machine in `~/.config/newsekolah/staging.env`).

Update and reseed:

```bash
cd /root/sion-staging && git pull --ff-only
cd infra/docker
C="docker compose -f docker-compose.prod.yml -f compose.staging.yml"
$C build api web
$C up -d --no-build postgres redis minio minio-init migrate api worker web
SU=$(grep ^DATABASE_URL= .env | cut -d= -f2-)
$C run --rm --no-deps -e APP_ENV=development -e DATABASE_URL="$SU" --entrypoint /seed api
```

The seed runs with `APP_ENV=development` only for that one-off command
because `cmd/seed` refuses production; the long-running services stay in
production mode.

## Continuous deployment

Two GitHub Actions workflows drive deploys; both end up SSHing into the VPS and
running `infra/scripts/deploy.sh` there (see that script's header comment for
exactly what it does -- fetch, build, pre-deploy dump, migrate, bring up,
health-gate, roll back on failure):

- **`.github/workflows/deploy-staging.yml`** runs automatically once the `CI`
  workflow finishes successfully on `main` (or on demand via
  `workflow_dispatch`): `deploy.sh staging <sha>`, then, if
  `apps/web/package.json` already has an `e2e:sim` script, the multi-actor
  simulation suite against `https://staging.sion.nouma.id` (skipped with a
  `::notice::` otherwise). The Playwright report is uploaded as a workflow
  artifact either way.
- **`.github/workflows/deploy-production.yml`** is `workflow_dispatch` only
  (input: the git ref to deploy, default `main`). It refuses to run unless the
  _same resolved commit_ already has a successful `Deploy staging` run, then
  deploys behind the `production` GitHub Environment -- add required reviewers
  there to gate it on human approval -- and posts a one-line result to
  Telegram afterwards if the bot secrets are configured.

Both workflows connect with a deploy key that is restricted, on the VPS side,
to running nothing but `deploy.sh staging <sha>` or `deploy.sh production
<sha>` with a 40-hex commit SHA (`infra/scripts/deploy-ssh-wrapper.sh`, forced
via `authorized_keys`) -- a compromised workflow run cannot use this key for
anything else, including deploying a ref that was never actually pushed.

### One-time setup

Run these from an operator machine with `ssh`, `gh`, and admin access on both
the VPS and the GitHub repo.

1. Generate a deploy keypair dedicated to CI -- never reuse an operator's own
   key:

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/newsekolah-deploy -C "newsekolah-ci-deploy" -N ""
   ```

2. Install the public key on the VPS, forced to the wrapper script and with
   every other SSH feature it does not need turned off. Run this on the VPS
   (as the user the deploy stacks run under, e.g. `root`), pasting the
   contents of `~/.ssh/newsekolah-deploy.pub` from step 1:

   ```bash
   umask 077
   mkdir -p ~/.ssh
   printf 'command="/root/sion/infra/scripts/deploy-ssh-wrapper.sh",no-agent-forwarding,no-X11-forwarding,no-port-forwarding,no-pty %s\n' \
     "<paste the newsekolah-deploy.pub contents here>" >>~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```

   `deploy-ssh-wrapper.sh` always runs from the **production** checkout
   (`/root/sion`) regardless of which target is being deployed -- it only
   parses `$SSH_ORIGINAL_COMMAND` and execs `deploy.sh` with the two validated
   arguments, and `deploy.sh` itself `cd`s into the right checkout
   (`/root/sion` or `/root/sion-staging`) based on the target argument. This
   means a change to `deploy.sh` only takes effect once it has been deployed
   to production (`git pull` in `/root/sion`) -- deploying a `deploy.sh` fix
   to staging alone does not update what the wrapper runs.

3. Make sure both checkouts actually have these scripts before wiring up the
   workflows (a fresh `/root/sion`/`/root/sion-staging` created before this
   change was merged will not): `cd /root/sion && git pull --ff-only` and the
   same in `/root/sion-staging`, then confirm
   `infra/scripts/deploy.sh` and `infra/scripts/deploy-ssh-wrapper.sh` are
   present and executable in both (`chmod +x` if `git pull` did not preserve
   the mode bit).

4. Capture the VPS host key for `known_hosts` (run from the operator machine,
   not the VPS):

   ```bash
   ssh-keyscan -t ed25519 <vps-host-or-ip> > /tmp/newsekolah-vps-known-hosts
   ```

   Inspect the fingerprint against what you already trust for this host before
   using it -- `ssh-keyscan` does not itself verify anything.

5. Set the repository secrets (from the operator machine, `gh` authenticated
   against this repo):

   ```bash
   gh secret set VPS_SSH_KEY < ~/.ssh/newsekolah-deploy
   gh secret set VPS_KNOWN_HOSTS < /tmp/newsekolah-vps-known-hosts
   gh secret set VPS_HOST --body "deploy@<vps-host-or-ip>"
   # staging simulation suite login:
   gh secret set STAGING_SEED_PASSWORD --body "<the staging SEED_PASSWORD, from ~/.config/newsekolah/staging.env>"
   # optional -- production deploy notifications:
   gh secret set TELEGRAM_BOT_TOKEN --body "<bot token>"
   gh secret set TELEGRAM_CHAT_ID --body "<chat id>"
   ```

   `VPS_HOST` is passed straight to `ssh` (`ssh -o IdentitiesOnly=yes "$VPS_HOST" ...`),
   so it must be `user@host`, not just the hostname. Create a dedicated,
   non-`root` deploy user restricted to that key if the VPS setup allows it;
   the forced command in step 2 already limits what the key can run
   regardless.

6. Create the `production` GitHub Environment and add required reviewers
   (replace `<reviewer-login>` with each approver's GitHub username; repeat
   the `reviewers` entry for more than one):
   ```bash
   gh api --method PUT "repos/{owner}/{repo}/environments/production" \
     --input - <<'EOF'
   {
     "reviewers": [{ "type": "User", "id": null }],
     "deployment_branch_policy": null
   }
   EOF
   ```
   `id` must be a numeric GitHub user ID, not a login -- look it up first:
   ```bash
   gh api users/<reviewer-login> --jq .id
   ```
   then substitute it into the `reviewers` payload above. Repeat
   `gh api users/<login> --jq .id` for each reviewer and add one
   `{ "type": "User", "id": <id> }` entry per reviewer to the array.

### Manual fallback

The workflows are a thin wrapper around `deploy.sh`; the same deploy can
always be run by hand, either from the operator machine through the same
forced-command key:

```bash
ssh deploy@<vps-host-or-ip> "deploy.sh staging <sha>"
ssh deploy@<vps-host-or-ip> "deploy.sh production <sha>"
```

or directly on the VPS with an operator's own login, which is not restricted
to the wrapper and so also accepts a branch or tag name, not just a SHA:

```bash
cd /root/sion-staging && bash infra/scripts/deploy.sh staging main
cd /root/sion && bash infra/scripts/deploy.sh production main
```

Sanity-check any change to `deploy.sh` itself with `DRY_RUN=1` first, from any
checkout, before trusting it against a real target:

```bash
DRY_RUN=1 bash infra/scripts/deploy.sh staging <sha>
DRY_RUN=1 bash infra/scripts/deploy.sh production <sha>
```

### Rollback

`deploy.sh` already rolls the `api`/`web` image tags back to their pre-deploy
state and restarts the services automatically if the build, the health check
on `/health`, or the check on `/login` fails -- see the script's own summary
output for what it did. Two things that automatic rollback does **not**
cover:

- **A deploy that "succeeds" (passes health checks) but is wrong in some other
  way.** Redeploy the previous known-good commit the same way as any other
  deploy: `deploy.sh production <previous-sha>` (or the workflow with that
  ref). `migrate up` is idempotent, so re-running it against an already
  fast-forwarded schema is a no-op.
- **A migration that already ran and broke something.** Migrations are never
  rolled back automatically (repo policy: only forward, additive migrations
  are supposed to ship, so an image rollback should never need a schema
  rollback to match). If one does turn out to be destructive, restore the
  pre-deploy dump `deploy.sh` took before running it (production only --
  staging holds demo data, so reseed instead):
  ```bash
  cd /root/sion/infra/docker
  docker compose -f docker-compose.prod.yml -f compose.vps.yml stop api worker
  docker compose -f docker-compose.prod.yml -f compose.vps.yml exec -T postgres \
    pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner \
    < /root/sion-backups/predeploy-<stamp>.dump
  docker compose -f docker-compose.prod.yml -f compose.vps.yml up -d --no-build api worker
  ```
  (`predeploy-<stamp>.dump` is printed in the failure summary `deploy.sh`
  prints, and the last 10 are always kept in `/root/sion-backups/`.)

## Development

Hot-reload stack for day-to-day work: see [docker/README.dev.md](docker/README.dev.md).
