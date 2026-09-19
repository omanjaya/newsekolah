# Audit performa web (apps/web)

Tanggal: 2026-09-19. Metode: tiga audit statis paralel (animasi, rendering/data-fetching, bundle/aset), `next build` produksi, dan pengukuran runtime di browser terhadap dev environment (`docker compose dev`, data seed SMA 1 Denpasar, 2.416 siswa).

## Angka terukur

- Shared JS produksi: **105 kB gz**; mayoritas halaman **250–265 kB gz** First Load JS. Sehat.
- Outlier: `/library/import` **500 kB** dan `/school/users/import` **511 kB** (chunk exceljs 912 kB raw / 250 kB gz).
- Chunk barrel UI: **356 kB raw / 110 kB gz**, dimuat di **110 dari 118 route** termasuk `/login` (berisi sonner, cmdk, react-table, qrcode.react).
- Katalog i18n penuh (**158 kB raw / 44 kB gz**) diserialisasi ke HTML setiap halaman lewat `NextIntlClientProvider` di root layout.
- Service worker precache **4,14 MB raw / 1,26 MB gz** (160 entri, semua chunk route) pada kunjungan pertama.
- API lokal cepat: semua endpoint < 35 ms (terberat `GET /v1/directory/users?limit=500` 33 ms).
- Long task 80 ms terukur saat toggle rail sidebar (dev mode).
- CSS sehat: satu file 49 kB raw / 9,6 kB gz.

## Temuan prioritas tinggi

### Arsitektur rendering (dampak: semua route)

1. **Seluruh app (app) adalah client SPA.** `app/(app)/layout.tsx:1` ber-`"use client"`; tidak ada `HydrationBoundary`/`prefetchQuery` sama sekali. Rantai kritis tiap cold load: HTML → ~800 kB JS → hydrate → `GET /v1/me` → baru query halaman. Fix tertinggi leverage-nya: prefetch `/v1/me` server-side di layout + `HydrationBoundary`.
2. **Remount seluruh tree 2–3× per load.** `components/data-table-state-scope.tsx:16-24` memakai `key={identityScope}` di atas `{children}`; key berubah saat branding lalu `/v1/me` resolve → seluruh app unmount+remount. Pindahkan scoping ke dalam store `ViewStateProvider`, bukan React `key`.
3. **Context value tidak stabil.** `lib/session/session-provider.tsx:42` (dan tenant provider, command palette provider) membuat object literal inline; tiap refetch `/v1/me` (default `refetchOnWindowFocus: true`) memicu re-render cascade app-wide lewat `useCan()`. Tidak ada satu pun `React.memo` di `apps/web` maupun `packages/ui`.

### Layar berat spesifik

4. **`/school/promotion` — N+1 terparah.** `promotion-view.tsx:34-37,183`: satu `GET /v1/users/{id}` per baris, tanpa paginasi — ~900 request + ~1.800 Radix Select untuk sekolah 900 siswa; satu perubahan me-render ulang semua baris. Pakai `useDirectoryQuery("student")` (batch) yang sudah ada.
5. **`/attendance/[sessionId]`** — state roster (`statuses/notes/violations`) di komponen atas tanpa row memo: 300+ komponen re-render per ketikan catatan (`session-view.tsx:93-113,256-320`). Target desain "36 siswa < 30 detik" terancam oleh bentuk state ini.
6. **`/grading`** — matriks desktop + mobile keduanya selalu ter-mount: 576 controlled `<Input>`; tiap ketikan me-render semuanya (`gradebook-table.tsx:52,207,294`).
7. **`/schedule`** — tiga grid ter-mount sekaligus (mobile list, day grid, week grid hanya di-`hidden` CSS) + lookup per sel berupa closure `.find()` baru tiap render (`schedule-view.tsx:136-138,201-203,323-420`).

### Bundle & delivery

8. **Barrel `@newsekolah/ui` tanpa `sideEffects`** (`packages/ui/package.json`) + tanpa `optimizePackageImports` → login ikut memuat QR renderer, table engine, cmdk, sonner. Fix 2 baris: `"sideEffects": ["*.css"]` + `experimental.optimizePackageImports: ["@newsekolah/ui"]`. Tambahan: pindahkan `Toaster` + `DataTableStateScope` dari `app/providers.tsx` ke `app/(app)/layout.tsx`; `next/dynamic` untuk `CommandPaletteProvider`.
9. **exceljs eager** di `features/library/import-lib.ts:1` dan `features/school/lib/user-import.ts:2` — pindah ke `await import("exceljs")` di handler (pisahkan `IMPORT_FIELDS` ke file konstanta dulu agar boundary tidak bocor lewat `import-mapping-step.tsx`). Hemat ~250 kB gz per route import.
10. **Serwist precache seluruh app** (`next.config.ts:23-29`) — beri `exclude` untuk chunk per-route (`/^.+\/static\/chunks\/app\/.+$/` + chunk exceljs). Juga: `...defaultCache` membawa rule `apis` NetworkFirst 24 jam untuk GET API — data presensi/nilai bisa tersaji basi hingga 24 jam dan bertahan setelah logout di perangkat kiosk. Saring `defaultCache` (buang `apis`, `next-data`, `google-fonts-*`).
11. **i18n**: scope pesan per segment — root provider cukup `common/errors/auth/app.shell`, provider bersarang di `(app)` / per segmen (mis. `app.library` 29 kB sendiri di layout library). Hemat ~40 kB gz HTML di `/login`.

### Animasi (user ingin animasi dipertahankan — fix di bawah mempertahankan motion yang sama)

12. **`components/sidebar.tsx` adalah satu-satunya hotspot animasi:**
    - `transition-[grid-template-rows]` (:260) + ResizeObserver (:143-165) membentuk loop layout-thrash selama 200 ms + ekor stagger. Fix: `contain: layout paint` pada wrapper `overflow-hidden` (:264) + coalesce observer via rAF.
    - `transition-[width]` (:190-198) pada rail `sticky h-dvh` me-reflow seluruh halaman 240 ms per toggle (long task 80 ms terukur). Fix: `contain: layout paint` pada `<aside>` + suspend observer selama transisi. `will-change` tidak menolong (masalahnya layout, bukan compositing).
    - Scroll listener (:148-151) set object baru tiap event → re-render seluruh sidebar meski boolean tak berubah. Fix: bail-if-unchanged + rAF.
    - Catatan: `DESIGN.md:44` sudah menandai sidebar sebagai pengecualian sadar dari dial `MOTION 1` — fix di atas mempertahankan motion persis sama.

## Temuan menengah

- **Skeleton table**: hingga 8 baris × ~12 kolom `animate-pulse` independen (64–96 animasi infinite serentak) di `packages/ui/.../data-table.tsx:333-337`. Pindahkan pulse ke `<tr>`/`<tbody>` (8 animasi, tampilan hampir identik).
- **QR kiosk**: `qr-panel.tsx:42-47` re-render SVG QR 220 px penuh tiap detik selamanya (layar kiosk/duty). `React.memo` QR atau pisahkan countdown ke child sendiri.
- **Progress bar** `packages/ui/src/components/progress.tsx:33` transisi `width` → ganti `scaleX` (composited, visual identik).
- **Polling** ~11 hook `refetchInterval` 15–60 dtk; tidak ada yang berhenti saat tab tersembunyi (`refetchIntervalInBackground` tidak diset) dan `refetchOnWindowFocus` default true dengan staleTime global 30 dtk → burst ~8 request per fokus jendela di dashboard. `useSchedulesQuery` tanpa `staleTime` padahal jadwal berubah beberapa kali per semester.
- **DataTable render dua kali** (cards `md:hidden` + table `hidden md:block`) — pajak konstan 2× DOM di ~57 call site.
- **Cache key duplikat/invalidasi terlalu lebar**: `/v1/academic/classes` di 2 key berbeda (`api-offerings.ts:79-89` vs `reference/api.ts:21-33`); `["users", id]` di `promotion/api.ts:59` bentrok dengan prefix list; invalidasi blanket `["library"]` / `["academic"]` di desk API.
- **CSV bulk import** re-parse penuh tiap ketikan + preview tanpa paginasi (`schedule-bulk-view.tsx:39-48,138`).

## Temuan ringan

- Tidak ada `loading.tsx`/`error.tsx` per segmen route (hanya root).
- Sort/filter/Map tanpa `useMemo` di ~11 render body (terburuk: `monitor-view.tsx:125`, layar polling 15 dtk).
- Tiga `<img>` tanpa width/height (CLS); `images.remotePatterns` `hostname: "**"` perlu ditinjau (open proxy optimizer).
- Tidak ada font loading sama sekali (bukan blocking, tapi wajah huruf beda per OS; CSP `font-src 'self' data:` akan memblok Google Fonts link).
- Listener resize tanpa rAF di `google-sign-in-button.tsx:66-73`.

## Yang sudah bagus (jangan "diperbaiki")

- Semua keyframes `packages/ui/src/styles.css:38-69` hanya opacity/transform, finite, 200 ms — benar.
- `prefers-reduced-motion` global + token durasi dinolkan — lebih baik dari kebanyakan codebase.
- Nol `transition: all`, nol `backdrop-filter`/blur, nol box-shadow transition, nol library animasi.
- Baris tabel sengaja tanpa transition hover — pertahankan.
- lucide-react named import semua — tree-shake beres.
- CSS output satu file 9,6 kB gz.
- Dashboard fan-out 7 query paralel; `homeroom-view` dan `users-view` adalah template paginasi yang benar.
- SW: `skipWaiting:false` + banner update + `navigationPreload:true` — pertahankan.

## Bug non-performa yang tersingkap

- `features/reference/api.ts:77` cap direktori siswa `limit: 500` — sekolah > 500 siswa akan menampilkan siswa "tak dikenal" di 22 layar (seed sekarang 2.416 siswa: sudah melewati cap ini).
- `eslint.ignoreDuringBuilds: true` di `next.config.ts` — regresi lint tidak pernah gagal di CI.

## Urutan serangan yang disarankan

1. `sideEffects` + `optimizePackageImports` (2 baris, efek ke 110 route).
2. Hapus remount bomb `data-table-state-scope.tsx` + stabilkan session context value.
3. Prefetch `/v1/me` server-side + `HydrationBoundary` di `(app)/layout`.
4. `contain` + observer coalescing di sidebar (mempertahankan animasi).
5. Dynamic import exceljs; Serwist `exclude` + saring `defaultCache`.
6. Layar berat: promotion (batch lookup + paginasi), attendance session (row memo), gradebook (mount satu matriks), schedule (unmount grid tersembunyi).
7. Scope i18n per segmen.

## Status perbaikan (19 September 2026)

Semua item prioritas tinggi dan menengah dikerjakan oleh tujuh pengerjaan paralel dalam dua gelombang dan digabung ke `fix/schedule-grid-alignment`. Gelombang kedua menuntaskan scoping i18n (item 11): root membawa namespace bersama saja, `(app)` membawa namespace aplikasi, katalog `library` (35 kB, terbesar) di-scope ke `/library/*` dengan label nav-nya diturunkan dari registry navigasi ke set `(app)` (regresi `MISSING_MESSAGE` tertangkap smoke test browser dan diperbaiki). Prefetch `/v1/me` (item 3) selesai lewat middleware: `middleware.ts` menerbitkan cookie akses httpOnly `sat` (maxAge = TTL 15 menit dikurangi margin 45 detik) hanya pada navigasi dokumen GET sungguhan ke rute `(app)`, merelai rotasi refresh cookie dari API, dan tidak pernah retry; layout `(app)` membacanya untuk mem-prefetch `GET /v1/me` ke `HydrationBoundary`. Ini butuh pelebaran `Path` refresh cookie dari `/v1/auth` ke `/` di API, yang memunculkan bahaya migrasi nyata (cookie ganda lama+baru memicu deteksi reuse dan mencabut keluarga sesi -- direproduksi dengan curl); ditutup dengan middleware API `LegacyRefreshCookieCleanup` yang menghapus cookie path lama pada setiap penerbitan cookie baru. Detail desain dan verifikasinya di docs/08-security.md bagian 2. Terverifikasi terhadap stack dev nyata: navigasi pertama membawa data `/v1/me` di HTML, navigasi kedua tanpa refresh ulang, request RSC/prefetch tidak pernah memicu refresh, dan test penuh Go (termasuk integrasi Postgres) lulus.

Hasil terukur setelah build produksi ulang (First Load JS gz, sebelum -> sesudah):

| Route                  | Sebelum | Sesudah |
| ---------------------- | ------- | ------- |
| `/login`               | 289 kB  | 202 kB  |
| `/dashboard`           | 263 kB  | 170 kB  |
| `/schedule`            | 261 kB  | 210 kB  |
| `/library/import`      | 500 kB  | 186 kB  |
| `/school/users/import` | 511 kB  | 167 kB  |

Precache service worker turun dari 4,14 MB (160 entri) ke 2,26 MB (112 entri); chunk exceljs 912 kB keluar dari precache lewat batas `maximumFileSizeToCacheInBytes` 700 kB (penamaan chunk vendor tidak bisa diandalkan untuk exclude berbasis nama). Rule `apis` 24 jam milik `defaultCache` dibuang dari `app/sw.ts`.

Perubahan perilaku yang disengaja:

- `/school/promotion` kini memanggil satu request batch directory (bukan satu per siswa) dan memakai `DataTable` berpaginasi 50 baris.
- Gradebook dan grid jadwal me-mount satu layout saja lewat `useMediaQuery` bersama di `packages/ui` (bukan dua layout yang disembunyikan CSS).
- Row presensi dibungkus `React.memo` eksplisit; temuan penting: React Compiler TIDAK aktif di build (hanya lint rules-nya), jadi bailout harus manual. Mengaktifkan compiler adalah opsi lanjutan yang belum diambil.
- Dialog command palette (cmdk) dimuat saat pertama dibuka, bukan saat shell mount.
- `DataTable` masih me-render layout tabel + kartu bersamaan (temuan 12) - dibiarkan sadar karena single-mount berisiko flash hidrasi di 57 call site; test journal disesuaikan.
- Test `journal-view` yang gagal sudah gagal sejak snapshot WIP sebelumnya (bukan regresi perbaikan ini) dan diperbaiki di sini.

Validasi: `pnpm typecheck`, `pnpm lint`, `pnpm test` lulus penuh; smoke test browser di dashboard, schedule, promotion, grading, dan command palette tanpa error console baru (404 `periods/today` adalah respons domain saat tidak ada jam pelajaran).
