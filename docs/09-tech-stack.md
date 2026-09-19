# 09. Tech Stack

Status: Usulan final untuk rebuild. Setiap pilihan disertai alasan dan alternatif yang ditolak, supaya keputusan bisa ditinjau ulang tanpa menebak.

## 1. Prinsip pemilihan

1. Satu bahasa untuk semua klien (TypeScript) agar tipe, validasi, dan SDK API dibagi antara web, iOS, dan Android.
2. Backend tetap Go: tim sudah menguasainya, binary tunggal, mudah di-deploy ke sekolah yang self-host.
3. Kontrak API dulu (OpenAPI 3.1). Semua klien digenerate dari kontrak, bukan ditulis tangan.
4. PostgreSQL, bukan MySQL, karena Row Level Security (RLS) adalah fondasi multi-tenant yang aman.
5. Semua komponen bisa dijalankan di satu VPS 2 vCPU / 4 GB untuk sekolah kecil, dan bisa diskalakan horizontal untuk SaaS.

## 2. Ringkasan stack

| Lapisan                      | Pilihan                                                                                                                                                                      | Versi target                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Monorepo                     | pnpm workspaces + Turborepo                                                                                                                                                  | pnpm 10, Turbo 2                   |
| Backend API                  | Go, chi router, pgx + sqlc, oapi-codegen, River (job queue di Postgres)                                                                                                      | Go 1.25                            |
| Database                     | PostgreSQL dengan RLS, golang-migrate                                                                                                                                        | PostgreSQL 16                      |
| Cache / pub-sub / rate limit | Redis                                                                                                                                                                        | Redis 7                            |
| Object storage               | S3-compatible (MinIO self-host, atau Cloudflare R2 / S3 untuk SaaS)                                                                                                          | -                                  |
| Web                          | Next.js App Router, React 19, TypeScript strict                                                                                                                              | Next.js 15 LTS (16 setelah stabil) |
| UI web                       | Tailwind CSS v4, shadcn/ui (Radix primitives), Lucide icons                                                                                                                  | -                                  |
| Data web                     | TanStack Query, TanStack Table, react-hook-form, zod                                                                                                                         | -                                  |
| i18n                         | next-intl (web), i18next (mobile); default `id`, cadangan `en`                                                                                                               | -                                  |
| Mobile                       | Expo (React Native), Expo Router, NativeWind, TanStack Query                                                                                                                 | Expo SDK 54                        |
| Mobile native                | expo-camera (QR/barcode), expo-notifications, expo-secure-store, expo-local-authentication                                                                                   | -                                  |
| Realtime                     | WebSocket (nhooyr/websocket) dengan Redis pub-sub; SSE untuk dashboard monitor                                                                                               | -                                  |
| Push                         | Web Push (VAPID), APNs (token p8), FCM v1; satu outbox                                                                                                                       | -                                  |
| Auth                         | Argon2id, access JWT 15 menit + refresh token rotasi (tabel sesi), httpOnly cookie di web, SecureStore di mobile, opsional SSO Google Workspace (OIDC), TOTP 2FA untuk admin | -                                  |
| Dokumen                      | PDF server-side (chromedp atau gotenberg), XLSX via excelize, DOCX via template                                                                                              | -                                  |
| Observability                | slog JSON, OpenTelemetry (trace + metric), Prometheus + Grafana, Sentry (web, mobile, Go)                                                                                    | -                                  |
| CI/CD                        | GitHub Actions; image Docker distroless; EAS Build untuk mobile                                                                                                              | -                                  |
| Reverse proxy                | Caddy (TLS otomatis, wildcard untuk subdomain tenant)                                                                                                                        | Caddy 2                            |
| Testing                      | Go: testify + testcontainers-go; Web: Vitest + Testing Library + Playwright; Mobile: Jest + Maestro; Kontrak: Schemathesis terhadap OpenAPI                                  | -                                  |

## 3. Struktur monorepo

```
newsekolah/
  apps/
    api/            Go: cmd/, internal/ (lihat 03-layered-architecture.md)
    web/            Next.js
    mobile/         Expo
    admin/          (opsional) konsol platform untuk onboarding sekolah; bisa digabung ke web dengan route group
  packages/
    api-client/     SDK TypeScript hasil generate dari openapi.yaml (openapi-typescript + fetch client)
    schemas/        zod schema yang dipakai web + mobile untuk form dan validasi klien
    ui-tokens/      design tokens (warna, tipografi, radius, spacing) sebagai CSS variables + objek TS untuk NativeWind
    ui/             komponen React web bersama (shadcn base + komponen domain), Storybook
    mobile-ui/      komponen React Native bersama
    config/         eslint, tsconfig, prettier, tailwind preset
  openapi/
    openapi.yaml    sumber kebenaran kontrak API (dipecah per modul lalu dibundle)
  infra/
    docker/         Dockerfile per app, docker-compose untuk single-school
    caddy/
    k8s/ atau nomad/ (opsional, SaaS)
  docs/
```

## 4. Alasan per keputusan

### PostgreSQL menggantikan MySQL

- RLS memberikan isolasi tenant di level database, bukan hanya di `WHERE tenant_id = ?` yang mudah terlupa.
- `ENUM` MySQL kaku saat migrasi; di Postgres pakai tabel lookup atau `CHECK` constraint.
- `jsonb` terindeks untuk snapshot dokumen (surat, rapor), `tstzrange` untuk periode, `generated columns`, full-text search bawaan untuk katalog perpustakaan.
- Migrasi data dari MySQL lama dilakukan sekali lewat skrip ETL (lihat 12-roadmap.md).

### sqlc + pgx, bukan ORM

- Query SQL eksplisit, hasil generate typed. Cocok dengan kebiasaan tim yang sudah menulis raw SQL, tetapi menghilangkan `rows.Scan` manual dan salah kolom.
- Alternatif ditolak: GORM (magic, N+1 tersembunyi), ent (kurva belajar, skema di Go bukan SQL).

### chi, bukan net/http ServeMux murni

- Router bergrup, middleware per grup (tenant, auth, permission), path param, sudah kompatibel `net/http`.
- Alternatif ditolak: Gin/Echo (context non-standar, menyulitkan reuse handler yang di-generate oapi-codegen).

### River untuk job dan outbox

- Job queue berbasis tabel Postgres, transaksional dengan data domain: insert notifikasi dan job pengiriman dalam satu transaksi, tidak ada outbox buatan sendiri dengan polling 3 detik.
- Retry, backoff, unique job, periodic job (pengingat jatuh tempo, penutupan sesi terlambat yang menggantung).
- Alternatif ditolak: asynq (butuh Redis sebagai sumber kebenaran, kehilangan transaksionalitas).

### Next.js + shadcn/ui menggantikan Tabler

- Tabler mengunci ke Bootstrap dan CSS global 11 ribu baris; shadcn memberi kepemilikan penuh komponen, token di Tailwind, dan aksesibilitas dari Radix.
- Komponen domain (DataTable server-side, form builder, scanner) ditulis sekali di `packages/ui`.
- Tetap PWA (service worker via Serwist) untuk sekolah yang belum memakai aplikasi native.

### Expo untuk iOS dan Android

- Satu codebase untuk dua platform, berbagi `packages/api-client`, `packages/schemas`, dan hook TanStack Query dengan web.
- Kamera barcode (`expo-camera` mendukung QR, Code 39, Code 128, EAN-13), push (APNs + FCM lewat `expo-notifications`), biometrik, SecureStore, background sync.
- OTA update lewat EAS Update untuk perbaikan cepat tanpa menunggu review store.
- Aplikasi SwiftUI `nouschool` yang sudah ada dijadikan referensi UX dan dapat dipertahankan untuk fitur yang butuh VisionKit khusus; keputusan lengkap di 10-mobile-strategy.md.

### OpenAPI-first

- `openapi/openapi.yaml` adalah kontrak. Go server interface dan DTO digenerate `oapi-codegen`; klien TS digenerate `openapi-typescript`. Perubahan API yang tidak kompatibel terdeteksi di CI lewat `oasdiff`.
- Kode error stabil (`code: "AUTH_TOKEN_EXPIRED"`) wajib ada di skema respons error, bukan pencocokan teks Bahasa Indonesia seperti sekarang.

## 5. Yang tidak dipakai lagi dari kode lama

| Lama                                     | Pengganti                                                                                       | Alasan                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------- |
| `package main` 17 ribu baris             | Paket domain per modul                                                                          | Tidak bisa diuji, tidak bisa dibagi |
| JWT 365 hari di `localStorage`           | Access 15 menit + refresh rotasi httpOnly / SecureStore                                         | Pencabutan sesi, XSS                |
| `notification_outbox` + trigger MySQL    | River job dalam transaksi                                                                       | Lebih sederhana dan andal           |
| `cwebp` binary eksternal                 | Library Go murni (`github.com/kolesa-team/go-webp` atau `golang.org/x/image` + `chai2010/webp`) | Image distroless                    |
| `xlsx` (SheetJS) di browser untuk import | Upload ke API, parsing di server dengan excelize, preview lalu commit                           | Konsistensi validasi                |
| `qr-scanner` hanya QR                    | `BarcodeDetector` API dengan fallback `@zxing/browser`, satu hook `useScanner`                  | Barcode buku, satu implementasi     |
| Rewrite `/api` di Next.js                | Caddy me-routing `/api` langsung ke Go (WebSocket lewat)                                        | Rewrite Next tidak bisa proxy WS    |
| Teks Indonesia hardcoded                 | Katalog pesan next-intl / i18next                                                               | White-label, dua bahasa             |

## 6. Kebutuhan lingkungan pengembangan

- Go 1.25, Node 22 LTS, pnpm 10, Docker Desktop, Xcode 16 (iOS), Android Studio (Android), `mise` atau `asdf` untuk mengunci versi.
- `make dev` menjalankan Postgres, Redis, MinIO, API, web, dan Storybook lewat docker compose + Turborepo.
- Seed data contoh satu sekolah fiktif (bukan data nyata) untuk development dan demo.
