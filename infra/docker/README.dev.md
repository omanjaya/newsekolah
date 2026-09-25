# Development stack

Everything the app needs, with hot reload, in one command:

```bash
pnpm dev:docker
```

That runs `infra/docker/docker-compose.dev.yml`, which starts:

| Service  | Port       | What it is                                                               |
| -------- | ---------- | ------------------------------------------------------------------------ |
| web      | 3000       | Next.js dev server, Fast Refresh on every save                           |
| api      | 8080       | Go API rebuilt by Air on every save                                      |
| postgres | 5433       | Postgres 16 (5433 on the host so a local Postgres on 5432 keeps working) |
| redis    | 6379       | Sessions, rate limits, realtime fan-out                                  |
| minio    | 9000, 9001 | S3-compatible storage; console on 9001                                   |
| mailpit  | 1025, 8025 | Catches every outgoing email; inbox on 8025                              |

The repository is bind-mounted into the `api` and `web` containers, so
editing a file on the host is what triggers the rebuild. Go's module and
build caches, and the web app's `node_modules` and `.next`, live in named
volumes: they survive restarts and are never shadowed by whatever the host
happens to have installed.

## First run

`keygen` writes a development JWT signing key into a volume, then `migrate`
applies the schema. Both are one-shot services the API waits for, so
`pnpm dev:docker` is all you need. To load the demo school:

```bash
pnpm dev:docker:seed
```

That creates the tenant `sma-contoh` with one account per role/duty the
school day needs -- `admin`, `kepsek` (principal), `guru` (homeroom
teacher of X-A and its Matematika teacher), `gurupiket` (picket duty),
`gurubk` (counselor duty), `wakepsek` (leadership duty), `satpam`
(security duty), `pustakawan` (librarian role and duty), and two students
in X-A, `siswa` and `siswa2` -- all with the password `Password123!`
(override with `SEED_PASSWORD`). It also seeds an active academic year
and term, X-A's full-day timetable, a Matematika grading component, and
a library catalogue with one fully-checked-out title. Re-running it is
safe (idempotent).

## Simulation

`apps/web/e2e/simulation` is a Playwright suite that logs several of
those seeded actors in at once, in real browser contexts, and proves a
cross-role flow (a leave request, an exit permit, attendance, grades, a
library reservation, and a reconnect after going offline) shows up live
on another actor's already-open screen -- never against a mocked API,
always a real running stack.

```bash
pnpm dev:docker        # start the stack (first run: wait for it to be healthy)
pnpm dev:docker:seed   # seed sma-contoh (idempotent, safe to re-run)
pnpm --filter @newsekolah/web e2e:sim
```

Or, from `apps/web`, pointed at a different stack (SEED_PASSWORD must
match whatever seeded that stack):

```bash
SIM_BASE_URL=http://localhost:3000 SEED_PASSWORD=Password123! pnpm e2e:sim
```

It refuses to run against production (`sion.nouma.id`) or any host
listed in `SIM_FORBIDDEN_HOSTS` (comma-separated) -- point it at a local
stack or a disposable staging box only. Trace, video, and screenshots are
kept on failure, and a readable report lands in `apps/web/sim-report/`
(`npx playwright show-report sim-report` to open it).

## Menambah dependensi npm

`node_modules` hidup di volume bernama, bukan di host, sehingga `pnpm install`
di host tidak terlihat oleh container. Setelah menambah dependensi:

```bash
docker compose -f infra/docker/docker-compose.dev.yml exec web pnpm install
```

lalu restart `web`, karena Next menyimpan galat "Module not found" dari
kompilasi sebelumnya.

## Running only the backing services

To keep the API or the web app on the host (a debugger, a profiler, a
different Go version) and containerise only the databases:

```bash
pnpm dev:services
```

Then point the host process at `postgres://newsekolah:newsekolah@127.0.0.1:5433/newsekolah`.

## The worker

Background jobs run inside the API by default (`WORKER_INLINE=true`), which
is how a small school deploys. To exercise the split deployment instead:

```bash
docker compose -f infra/docker/docker-compose.dev.yml --profile worker up
```

## Notes

- Dev secrets are hard-coded in the compose file and are worthless outside
  development. Production reads real values from the environment.
- Push providers (VAPID, APNs, FCM) are unset, so the API logs that those
  channels are disabled and delivers in-app notifications only.
- `docker compose ... down -v` removes the volumes, including the database
  and the signing key; the next `up` regenerates both.
