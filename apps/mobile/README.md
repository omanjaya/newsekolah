# @newsekolah/mobile

Expo (React Native) app for iOS and Android. See `docs/10-mobile-strategy.md`
and `DESIGN.md` at the repo root for the product and design direction.

## Status

Fase 4 role coverage: student, teacher, homeroom teacher, duty teacher,
security, and parent flows are wired against the API endpoints that exist
today (attendance, permits, grades, discipline, journals, substitutions,
review queues, gate scan). `src/lib/api/`, request/response types, the login
and change-password validation, string catalogs, and Tailwind colors are
wired to `@newsekolah/api-client`, `@newsekolah/schemas`, `@newsekolah/i18n`,
and `@newsekolah/ui-tokens` respectively; `src/components/ui/` is still local
and should move to `@newsekolah/ui` once that package covers these
components. Store release preparation (icons, splash, privacy policy,
EAS profiles, permission strings, demo account note) is documented in
`docs/14-store-release.md`.

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
  lib/api/        @newsekolah/api-client instance (rebuilt on tenant/server change) and local schema type aliases
  lib/auth/       SecureStore-backed token store, biometric unlock gate, role -> tab group mapping
  lib/offline/    SQLite-backed mutation queue for offline writes, the flush loop, and the online check
  lib/push/       push notification registration, wired from AuthProvider on sign-in
  lib/tenant/     chosen school (X-Tenant) and server URL override, read by lib/api/client.ts
  i18n/           id.json/en.json for mobile-only copy; common strings come from @newsekolah/i18n (see i18n/t.ts)
theme/            tenant accent color applied at runtime via NativeWind CSS vars
```

## Offline attendance

Attendance saved without a connection is queued in SQLite
(`src/lib/offline/queue.ts`) and sent automatically once the app can reach
the server again (`src/lib/offline/sync.ts`, mounted once at the app root).
A pending count shows as a banner on the teacher's home screen
(`OfflineQueueBanner`); a 409 from the server (someone else already
submitted the same session) is not retried automatically -- it is parked as
a conflict and surfaced at `/offline/conflicts` for a person to either
discard the local attempt or reopen the session and redo it as a
correction.

## Notes for the next pass

- `GET /me/home` (docs/10-mobile-strategy.md section 2, item 6) does not exist
  in `openapi/openapi.yaml` yet, so the home screens compose today's data
  from several endpoints instead of one summary request.
- `AttendanceLateArrivalSummary` (the late-arrival review queue's list item)
  carries no student name, unlike `LeaveRequestSummary` -- the queue at
  `/review/late-arrivals` shows occurrence number and time only until that
  schema gap closes.
- A dedicated "today's schedule" view for students is not buildable against
  the current API: there is no endpoint that resolves a student's own class
  id, and `listSchedules` needs one. The attendance calendar
  (`/attendance/calendar`) now shows a day's sessions on tap as the closest
  available substitute.
- Once `@newsekolah/ui` covers this app's components, replace
  `src/components/ui/` with imports from that package rather than the local
  copies.
