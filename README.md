# newsekolah

Rebuild platform sistem informasi sekolah (asal: SION, Go + Next.js) menjadi platform
multi-sekolah dengan web, iOS, dan Android. Rencana lengkap ada di `docs/README.md`; arah desain
di `DESIGN.md`.

## Prasyarat

- Go 1.26
- Node.js 24, pnpm 10 (lewat `corepack enable`)
- Docker dan Docker Compose plugin
- `mise` (opsional, mengunci versi tool sesuai `mise.toml`)
- Xcode 16 untuk iOS, Android Studio untuk Android (hanya bila menjalankan `apps/mobile`)

## Menjalankan secara lokal

1. Salin `.env.example` menjadi `.env` dan isi nilai yang kosong.
2. Nyalakan Postgres, Redis, MinIO, dan Mailpit:
   ```
   make infra-up
   ```
3. Jalankan API (Go):
   ```
   make api-migrate
   make api-run
   ```
4. Jalankan web (setelah `apps/web` tersedia):
   ```
   make web-dev
   ```
5. Jalankan mobile (Expo):
   ```
   make mobile-dev
   ```

Perintah lain ada di `Makefile`: `api-test`, `api-lint`, `api-gen`, `seed`, `infra-down`.

## Validasi sebelum commit

```
pnpm typecheck && pnpm lint && pnpm test   # TypeScript
cd apps/api && go test ./...               # Go
```

Git hook (`lefthook`) menjalankan pemeriksaan cepat (prettier, eslint pada berkas yang di-stage,
gofmt/go vet untuk Go, commitlint untuk pesan commit) otomatis saat commit. Pesan commit memakai
[Conventional Commits](https://www.conventionalcommits.org/) berbahasa Inggris, contoh:
`feat(permits): add gate token expiry`.

## Struktur monorepo

```
apps/
  api/        Go: chi, pgx, sqlc, golang-migrate, River (job queue)
  web/        Next.js (belum dibuat, lihat docs/09-tech-stack.md)
  mobile/     Expo (React Native)
packages/
  api-client/ SDK TypeScript hasil generate dari openapi/openapi.yaml
  schemas/    skema zod bersama web dan mobile
  ui-tokens/  design tokens (warna, tipografi, radius, spacing)
  ui/         komponen React web bersama
  config/     preset eslint, tsconfig, prettier, tailwind
openapi/
  openapi.yaml  sumber kebenaran kontrak API
infra/
  docker/     Dockerfile dan docker-compose untuk pengembangan dan self-host produksi
  caddy/      konfigurasi reverse proxy dan TLS
  scripts/    bootstrap, backup, restore, update untuk self-host
docs/         dokumen desain dan keputusan arsitektur (mulai dari docs/README.md)
```

## Dokumen lanjutan

- Rencana dan roadmap: `docs/README.md`, `docs/12-roadmap.md`
- Arsitektur berlapis: `docs/03-layered-architecture.md`
- Clean code dan aturan yang ditegakkan CI: `docs/04-clean-code.md`
- Tech stack dan alasannya: `docs/09-tech-stack.md`
- Keamanan: `docs/08-security.md`
- Instalasi self-host dan operasional produksi: `infra/README.md`
