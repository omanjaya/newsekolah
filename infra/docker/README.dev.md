# Development stack

Everything the app needs, with hot reload, in one command:

```bash
pnpm dev:docker
```

That runs `infra/docker/docker-compose.dev.yml`, which starts:

| Service  | Port         | What it is |
|----------|--------------|------------|
| web      | 3000         | Next.js dev server, Fast Refresh on every save |
| api      | 8080         | Go API rebuilt by Air on every save |
| postgres | 5433         | Postgres 16 (5433 on the host so a local Postgres on 5432 keeps working) |
| redis    | 6379         | Sessions, rate limits, realtime fan-out |
| minio    | 9000, 9001   | S3-compatible storage; console on 9001 |
| mailpit  | 1025, 8025   | Catches every outgoing email; inbox on 8025 |

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

That creates the tenant `sma-contoh` with the users `admin`, `guru`,
`gurubk`, `siswa` and `ortu`, all with the password `Password123!`.

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
