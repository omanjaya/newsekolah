# @newsekolah/mobile

Expo (React Native) app for iOS and Android. See `docs/10-mobile-strategy.md`
and `DESIGN.md` at the repo root for the product and design direction.

## Status

Scaffold stage: navigation shell, auth flow, and the local UI kit are in
place. Feature screens (attendance, permits, library, grades) are placeholders
until the corresponding API endpoints exist. Anything under `src/lib/`
marked `Temporary: replace with @newsekolah/api-client once published in the
workspace` is a stand-in for the generated client that another workstream is
building; do not build real features on top of those files without checking
whether the generated client has landed first.

## Requirements

- Node >= 22, pnpm 10 (see repo root `package.json`)
- Xcode with an iOS Simulator for `pnpm ios`, or Android Studio with an
  emulator for `pnpm android`

## Setup

From the repo root:

```
pnpm install
cp apps/mobile/.env.example apps/mobile/.env
```

Edit `apps/mobile/.env` if the API is not on `http://localhost:8080`.

## Run

```
pnpm --filter @newsekolah/mobile ios       # iOS Simulator
pnpm --filter @newsekolah/mobile android   # Android emulator
pnpm --filter @newsekolah/mobile start     # Metro only, pick a platform from the CLI
```

## Validate

```
pnpm --filter @newsekolah/mobile typecheck
pnpm --filter @newsekolah/mobile lint
pnpm --filter @newsekolah/mobile test
```

## Structure

```
src/
  app/            expo-router routes: (auth), (student), (teacher), (staff), (parent)
  components/ui/  local UI kit (Button, Input, Sheet, ...) -- promote to packages/ui later
  components/nav/ tab bar and role-tabs shell shared by every role group
  components/screens/ shared screen bodies used by more than one role group
  lib/api.ts      typed fetch client (temporary, see Status above)
  lib/auth/       session store, biometric unlock gate, role -> tab group mapping
  lib/offline/    SQLite-backed mutation queue for offline writes
  lib/push/       push notification registration helper (not wired to a screen yet)
  lib/tenant/     chosen school (X-Tenant) and server URL override
  i18n/           id.json (default) and en.json string catalogs, tiny t() helper
theme/            tenant accent color applied at runtime via NativeWind CSS vars
```

## Notes for the next pass

- `GET /me/home` (docs/10-mobile-strategy.md section 2, item 6) does not exist
  in `openapi/openapi.yaml` yet, so the home screens show a placeholder empty
  state instead of a real "today" summary.
- The raised center tab (QR for teacher, Scan for student) opens a sheet with
  placeholder copy; `expo-camera` and `expo-notifications` are installed but
  not wired to any flow yet, as requested.
- Once `@newsekolah/api-client` and `@newsekolah/ui` exist in the workspace,
  replace `src/lib/api*.ts`, `src/lib/auth/`, and `src/components/ui/` with
  imports from those packages rather than extending the local copies.
