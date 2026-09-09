# 03. Layered Architecture

Arsitektur yang dipakai: **modular monolith** dengan lapisan yang tegas di dalam setiap modul. Satu binary Go, satu database, tetapi kode dipisah per domain sehingga modul bisa dimatikan per sekolah (feature flag) dan, bila suatu hari diperlukan, dipisah menjadi service sendiri tanpa menulis ulang.

Alasan menolak microservices sejak awal: satu tim kecil, satu database, sekolah self-host butuh deploy sederhana. Alasan menolak `package main` tunggal seperti kode lama: tidak bisa diuji per unit, otorisasi tersebar di 140 route, dan perubahan satu modul berisiko merusak modul lain.

## 1. Lapisan di backend (Go)

```
apps/api/
  cmd/
    api/main.go              wiring: config, db, router, worker; tidak ada logika bisnis
    migrate/main.go
    worker/main.go           River worker (bisa proses yang sama dengan api untuk sekolah kecil)
    seed/main.go             seed sekolah contoh, hanya dev
  internal/
    platform/                lapisan infrastruktur bersama
      config/                env parsing, fail-fast bila variabel wajib kosong
      database/              pool pgx, helper transaksi, SET app.tenant_id per koneksi
      httpx/                 router chi, middleware, penulisan respons dan error terstandar
      auth/                  password hashing, token, sesi, middleware autentikasi
      tenant/                resolusi tenant dari host/header, konteks tenant
      authz/                 evaluasi permission + scope (RBAC + duty-derived), middleware
      events/                event bus in-process + publikasi ke Redis
      jobs/                  River client, registrasi worker
      storage/               S3 client, URL bertanda tangan, pemrosesan gambar
      notify/                pengiriman push (web, apns, fcm), email, WhatsApp adapter
      clock/                 Clock interface (waktu bisa disuntik saat test), zona waktu tenant
      i18n/                  katalog pesan error server
      telemetry/             slog, otel
    modules/
      identity/              users, roles, permissions, sessions, impersonation
      school/                tenant profile, branding, settings, academic years, feature flags
      academic/              subjects, rooms, classes, periods, student class assignments, teacher assignments
      scheduling/            teaching schedules, substitutions, duty assignments
      attendance/            teacher-recorded attendance, student calendar, reports
      permits/               exit permits, late arrivals, leave requests, leave letters
      discipline/            violations catalog, records, warning letters, counseling
      grading/               components, scores, report analysis, e-rapor export, class stars
      journal/               class journals
      announcements/
      notifications/         inbox, preferences, subscriptions
      library/               catalog, items, members, circulation, opname, opac
      reporting/             agregasi lintas modul untuk dashboard dan ekspor
    gen/
      api/                   hasil oapi-codegen (server interface + types), jangan diedit manual
      db/                    hasil sqlc, jangan diedit manual
```

Setiap modul mempunyai struktur yang sama:

```
modules/permits/
  domain/        entity, value object, state machine, aturan bisnis murni (tanpa import db/http)
  service/       use case: orkestrasi domain + repository + events, transaksi
  repository/    implementasi akses data memakai gen/db (sqlc); interface didefinisikan di service
  transport/
    http/        handler yang mengimplementasikan interface dari gen/api; hanya mapping DTO <-> domain
    jobs/        River worker untuk modul ini (pengingat, penutupan otomatis)
  queries/       file .sql sumber sqlc untuk modul ini
  module.go      fungsi Register(deps) yang mendaftarkan route, worker, event handler
```

Aturan ketergantungan (ditegakkan `go vet` + linter `depguard`):

| Lapisan | Boleh import | Tidak boleh import |
|---|---|---|
| domain | stdlib, `platform/clock` | pgx, chi, gen/*, modul lain |
| service | domain, interface repository sendiri, `platform/events`, `platform/jobs`, `platform/authz` | chi, gen/api, repository modul lain secara langsung |
| repository | domain, gen/db, `platform/database` | chi, service |
| transport | service, gen/api, `platform/httpx` | gen/db, repository |

Komunikasi antar modul hanya lewat dua cara:
1. **Interface yang diekspor modul** (mis. `academic.ClassReader`), disuntik saat wiring. Contoh: modul permits membutuhkan wali kelas dari modul academic.
2. **Domain event** (mis. `permits.LeaveRequestIssued`) yang ditangani modul lain (attendance menyinkronkan status izin). Handler event berjalan dalam transaksi yang sama bila di-subscribe in-process, atau lewat River job bila boleh asinkron.

Tidak ada modul yang menulis ke tabel modul lain.

## 2. Alur satu request

```
Caddy -> chi router
  -> RequestID, RealIP, Recoverer, Timeout, slog
  -> Tenant resolver   (host smansa.app.id -> tenant_id; atau header X-Tenant untuk mobile)
  -> Authenticate      (cookie/bearer -> session -> user, roles, permissions, duties; cache Redis 60 detik)
  -> Authorize         (permission dari anotasi OpenAPI x-permission; scope dicek di service)
  -> Handler (transport) : decode DTO, panggil service
     -> Service : mulai transaksi, SET LOCAL app.tenant_id, aturan domain, repository, publish event
     -> Repository : sqlc
  <- Response DTO atau Error{code, message, details}
```

`SET LOCAL app.tenant_id` dijalankan oleh helper transaksi `database.WithTenantTx`, bukan oleh service, agar tidak pernah terlupa. RLS di Postgres menolak baris tenant lain meski query lupa filter.

## 3. Lapisan di web (Next.js)

```
apps/web/
  app/
    (auth)/login, forgot-password
    (app)/                    layout shell (sidebar, header) sekali, bukan per halaman
      dashboard/
      attendance/
      permits/...
    (public)/opac, verify/[code], monitor/[token]
    (platform)/admin/tenants  konsol operator SaaS
  features/                   satu folder per modul, sejajar dengan backend
    attendance/
      api.ts                  hook TanStack Query yang membungkus packages/api-client
      components/             komponen khusus fitur
      schemas.ts              re-export dari packages/schemas bila perlu
  components/                 komponen shell aplikasi (AppShell, Sidebar, CommandPalette)
  lib/                        auth client, tenant, i18n, format tanggal
  messages/id.json, en.json
```

Aturan:
- Halaman di `app/` tipis: memuat data awal (server component bila publik), merender komponen fitur.
- Semua tabel operasional memakai `DataTable` dari `packages/ui` dalam mode server-side.
- Tidak ada `fetch` langsung di komponen; selalu lewat hook di `features/*/api.ts`.
- State server di TanStack Query; state UI lokal di komponen; state global minimal (sesi, tenant, tema) di React context.

## 4. Lapisan di mobile (Expo)

```
apps/mobile/
  app/                        Expo Router: (auth), (student), (teacher), (staff) tab group per peran
  features/                   sama dengan web: api.ts (hook yang sama, di-share via packages)
  components/
  lib/                        secure storage, push registration, offline queue
```

Hook TanStack Query dan zod schema hidup di `packages/`; web dan mobile hanya berbeda di komponen tampilan.

## 5. Modul yang bisa dimatikan

Setiap modul mendaftarkan diri lewat `Register(deps)` dan memeriksa `school.feature_flags`. Bila `library.enabled = false` untuk suatu sekolah: route mengembalikan `404 MODULE_DISABLED`, menu tidak muncul, worker tidak dijadwalkan. Flag disimpan per tenant dan diubah dari konsol admin sekolah.

## 6. Hal yang sengaja dipertahankan dari desain lama

- Scope tahun ajaran aktif pada semua data operasional (`academic_year_id`), dengan error `ACADEMIC_YEAR_REQUIRED` bila belum ada.
- Permission turunan dari tugas tambahan (wali kelas, BK, piket, keamanan). Di desain baru ini menjadi bagian eksplisit `platform/authz` dengan tipe `Scope` (kelas binaan, jadwal yang diampu, gerbang), bukan `if user.Role == ...` di handler.
- Pola token sekali pakai untuk QR, digeneralisasi menjadi `scan_tokens` dengan kolom `purpose` (masuk kelas, terlambat, izin keluar tahap N, kunjungan perpustakaan, opname).
