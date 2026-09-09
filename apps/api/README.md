# apps/api

Go backend for the newsekolah platform. Modular monolith: one binary, one
database, code split by domain module. See `docs/03-layered-architecture.md`
at the repo root for the full design; this file is command reference only.

## Layout

```
cmd/
  api/        HTTP server (wiring only; see cmd/api/wire.go)
  migrate/    apply/roll back SQL schema, River migrations, permission catalog
  worker/     River job queue worker
  seed/       demo tenant + users for local development (refuses in production)
  bootstrap/  first tenant + admin for a production deployment
  keygen/     generate an ES256 JWT signing key
internal/
  platform/   infrastructure shared by every module (config, database, httpx,
              auth, tenant, authz, clock, i18n, ...)
  modules/    domain modules; each has domain/ service/ repository/ transport/
  gen/        generated code (oapi-codegen, sqlc) -- do not edit by hand
migrations/   embedded SQL migrations (golang-migrate, iofs source)
```

## Prerequisites

- Go 1.26+
- Docker (for Postgres/Redis/MinIO locally, and for `go test ./...`'s
  testcontainers-based integration tests)
- `sqlc`, `oapi-codegen`, `golangci-lint` on `PATH` (installed to `~/go/bin`
  by the project's tooling setup)

## Local setup

```sh
cp ../../.env.example .env      # then set JWT_SIGNING_KEY (see below)
make -C ../.. infra-up          # Postgres, Redis, MinIO, Mailpit
go run ./cmd/keygen              # prints a base64 ES256 private key
# paste the key into .env as JWT_SIGNING_KEY

go run ./cmd/migrate up          # schema + River tables + permission catalog
go run ./cmd/seed                # tenant "sma-contoh" + demo users
go run ./cmd/api                 # listens on :8080
```

Demo accounts after `cmd/seed` (password from `SEED_PASSWORD`, default
`Password123!`, all `must_change_password=true`): `admin`, `guru`, `siswa`,
`ortu`.

```sh
curl -X POST localhost:8080/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Password123!","client":"web"}'
```

## Commands

| Command | What it does |
|---|---|
| `go run ./cmd/api` | Start the HTTP server |
| `go run ./cmd/migrate up\|down\|status\|version\|force <n>` | Schema migrations (SQL + River + permission catalog upsert on `up`) |
| `go run ./cmd/seed` | Demo tenant and users (dev/test only) |
| `go run ./cmd/bootstrap -tenant-slug=... -tenant-name=... -admin-name=...` | Production tenant + first admin; prints a one-time set-password link, never a password |
| `go run ./cmd/worker` | River job worker |
| `go run ./cmd/keygen` | Print a new ES256 signing key |
| `go generate ./internal/gen/api/...` | Regenerate OpenAPI types/server from `openapi/openapi.yaml` |
| `sqlc generate` | Regenerate DB query code from `internal/modules/*/queries/*.sql` |
| `go test ./...` | Unit tests always run; integration tests (testcontainers) skip if Docker is unreachable or `-short` is passed |
| `golangci-lint run ./...` | Lint (see `.golangci.yml`) |

Root `Makefile` wraps the common ones as `make api-run`, `make api-migrate`,
`make api-test`, `make api-lint`, `make api-gen`, `make seed`.

## Configuration

Read once at startup by `internal/platform/config`; every other package
receives values through a struct, never `os.Getenv` directly. Required:
`DATABASE_URL`, `JWT_SIGNING_KEY`. `APP_ORIGINS` is required when
`APP_ENV=production`. Any secret accepts a `<VAR>_FILE` variant that reads
the value from a file (Docker/Kubernetes secrets). See `.env.example` at the
repo root for the full list and defaults.

`REDIS_URL` is optional: when empty the login rate limiter and session
cache fall back to an in-process store. This only works correctly for a
single API replica -- set `REDIS_URL` before scaling `cmd/api` horizontally.

## Row-level security and the dev database

Every tenant-scoped table has RLS `USING (tenant_id = current_setting('app.tenant_id'))`,
set per-transaction by `database.WithTenantTx`/`WithPlatformTx`. **Postgres
superusers always bypass RLS**, `FORCE ROW LEVEL SECURITY` notwithstanding.
The docker-compose Postgres user (`newsekolah`) is the initdb superuser for
local convenience, so RLS is not actually enforced against it -- it is
enforced in the schema (verified by `cmd/api`'s integration test
`TestTenantIsolationRLS`, which connects as a real non-superuser role) but a
local `psql` session as `newsekolah` will see every tenant's rows.

Migration `0004_db_roles` optionally creates `app_rw` (least-privilege,
`NOBYPASSRLS`) when the connected role can create roles; it is skipped, not
failed, when it cannot (e.g. a managed Postgres where only the provider's
admin role has `CREATEROLE`). Point the runtime `DATABASE_URL` at `app_rw`
(not the migration role) in any environment where RLS must actually hold.

## Tests

- Unit tests live next to the code they test (`*_test.go`), no Docker
  required: password hashing, refresh-token rotation state machine,
  permission union, config fail-fast, the OpenAPI `x-permission` startup
  check.
- Integration tests (`cmd/api/integration_test.go`) start a real Postgres 16
  via testcontainers-go, run every migration, and exercise the actual HTTP
  handlers: login (web cookie + mobile body), refresh rotation and reuse
  detection revoking the whole session family, logout revoking the session
  immediately, `/v1/me` permissions including an active duty assignment, and
  RLS tenant isolation against a non-superuser role with a query that has no
  `WHERE tenant_id` clause. They skip (not fail) when Docker is unreachable,
  and skip under `go test -short`.

## Known gaps in this phase

- `internal/platform/{events,jobs,storage,notify,telemetry}` are scaffolded
  per the layered architecture but are not wired to any real behavior yet --
  no module in this phase publishes a domain event, enqueues a River job, or
  sends a notification. `cmd/worker` starts a real River client with zero
  registered job kinds.
- JWT key rotation (a second active `kid`, JWKS) is not implemented; there is
  one active signing key (`kid: "1"`).
- Sessions the ChangePassword flow revokes in bulk, and sessions caught by
  refresh-token reuse detection, are not evicted from the 60-second session
  cache immediately -- they stop working within that window via the
  database fallback check, not instantly like a single logout/revoke.
- Academic year CRUD has no HTTP surface yet (not in `openapi/openapi.yaml`
  for this phase); `modules/school/service` is ready for it.
