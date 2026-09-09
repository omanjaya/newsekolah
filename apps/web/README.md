# apps/web

Aplikasi web Next.js 15 (App Router) untuk platform sekolah.

## Menjalankan

```bash
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8080
pnpm --filter @newsekolah/web dev
```

Perintah lain: `typecheck`, `lint`, `test` (Vitest), `test:e2e` (Playwright; membangun ulang dengan API URL yang menunjuk ke origin uji dan memakai `next start`), `build`.

## Struktur

- `app/`: route groups `(auth)`, `(app)`, `(public)`, plus `manifest.webmanifest` dan `branding-icon` per tenant.
- `components/`: shell aplikasi (sidebar, tab bar mobile, header, command palette, tema).
- `features/<modul>/`: `api.ts` (hook TanStack Query dari `@newsekolah/api-client/react`) dan komponen fitur.
- `lib/`: sesi, tenant, i18n, tema, klien API.
- `messages/`: teks khusus web; teks umum berasal dari `@newsekolah/i18n`.

## Variabel lingkungan

| Nama                  | Keterangan                                                                      |
| --------------------- | ------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | Origin API yang dijangkau browser                                               |
| `API_INTERNAL_URL`    | Origin API untuk pemanggilan sisi server (opsional, default sama dengan publik) |
| `NEXT_OUTPUT`         | `standalone` hanya saat build image Docker                                      |

## Docker

```bash
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://sekolah.example.sch.id .
```
