# 04. Clean Code Practices

Aturan yang ditegakkan alat (linter, CI) diberi tanda [CI]. Aturan lain ditegakkan saat code review.

## 1. Umum

1. Bahasa kode dan identifier: English. Bahasa teks untuk pengguna: lewat katalog i18n, default Bahasa Indonesia. Tidak ada string UI hardcoded di kode. [CI: lint `no-literal-string` untuk JSX, grep di Go untuk `writeError("...")`]
2. Tidak ada emoji di UI, komentar, log, commit message. Ikon memakai Lucide. [CI: grep karakter emoji di `apps/` dan `packages/`]
3. File maksimal 400 baris; fungsi maksimal 60 baris; kompleksitas siklomatik maksimal 15. [CI: `gocyclo`, `eslint max-lines`]
4. Satu commit satu maksud, format Conventional Commits berbahasa Inggris (`feat(permits): add gate token expiry`). [CI: commitlint]
5. Tidak ada `TODO` tanpa nomor issue. [CI]
6. Komentar menjelaskan alasan, bukan mengulang kode (lihat skill `antislop-code`).

## 2. Go

- Nama paket pendek, lowercase, tanpa underscore: `permits`, bukan `exit_permit_api`.
- Error dibungkus dengan konteks: `fmt.Errorf("issue leave letter %s: %w", id, err)`. Error domain bertipe (`domain.ErrPermitAlreadyIssued`) dan dipetakan ke kode HTTP + `code` respons di satu tempat (`httpx/errors.go`).
- Tidak ada `panic` di jalur request; `Recoverer` hanya jaring pengaman.
- Semua fungsi yang menyentuh DB menerima `context.Context` pertama.
- Waktu selalu lewat `clock.Clock` dan zona waktu tenant; dilarang `time.Now()` di domain/service. [CI: `forbidigo`]
- ID: UUID v7 (terurut waktu) digenerate di aplikasi, bukan timestamp nanodetik.
- Transaksi hanya dibuka di service; repository menerima `pgx.Tx` lewat context.
- Tidak ada SQL di handler atau service; hanya di `queries/*.sql` yang dikompilasi sqlc. [CI: `depguard`]
- Struct request/response hanya dari `gen/api`; mapping ke domain di transport.
- Konfigurasi hanya dibaca di `platform/config`; paket lain menerima nilai lewat struct dependency.
- Linter: `golangci-lint` dengan `errcheck, govet, staticcheck, gosec, gocyclo, depguard, forbidigo, revive, sqlclosecheck, bodyclose`. [CI]
- Test: table-driven, `testify/require`; integrasi DB memakai `testcontainers-go` dengan migrasi nyata; tidak ada mock untuk Postgres.

## 3. TypeScript (web dan mobile)

- `strict: true`, `noUncheckedIndexedAccess: true`, dilarang `any` (`unknown` lalu narrow). [CI]
- Tipe API hanya dari `packages/api-client` (generated). Tidak ada interface DTO tulisan tangan.
- Validasi form dengan zod dari `packages/schemas`; schema yang sama dipakai mobile.
- Komponen: satu komponen per file, props bertipe eksplisit, tidak ada prop drilling lebih dari dua tingkat (pakai composition atau context fitur).
- Hook data: satu hook per endpoint (`useExitPermits(params)`), key query terpusat di `features/*/keys.ts`.
- Efek samping di `useEffect` minimal; data fetching bukan lewat `useEffect` + `useState`.
- Tidak ada `dangerouslySetInnerHTML` kecuali untuk template surat yang sudah disanitasi server-side.
- ESLint: `@typescript-eslint/strict-type-checked`, `react-hooks`, `jsx-a11y`, `import/order`, `no-restricted-imports` (melarang import lintas fitur kecuali lewat `index.ts`). [CI]
- Prettier dengan konfigurasi dari `packages/config`. [CI]

## 4. SQL dan migrasi

- Migrasi bernomor berurutan tanpa celah, selalu berpasangan `up`/`down`, direview seperti kode. [CI: skrip cek nomor]
- Nama tabel `snake_case` jamak; kolom `snake_case`; FK `<tabel_tunggal>_id`; index `ix_<tabel>_<kolom>`; unique `ux_`; FK constraint `fk_<tabel>_<ref>`.
- Setiap tabel tenant-scoped: `tenant_id uuid not null` + RLS policy + index komposit `(tenant_id, ...)`.
- Kolom audit standar: `created_at timestamptz`, `updated_at timestamptz`, `created_by uuid`, `updated_by uuid`; soft delete `deleted_at timestamptz` hanya di tabel yang memang butuh pemulihan (master data, katalog).
- Status memakai `text` + `CHECK (status in (...))`, bukan `ENUM` Postgres, agar mudah ditambah.
- Tidak ada trigger untuk logika bisnis; trigger hanya untuk `updated_at`.

## 5. API

- Path `kebab-case` jamak: `/api/v1/exit-permits/{id}/approve`.
- Aksi workflow sebagai sub-resource verb (`/approve`, `/reject`, `/issue`), bukan PATCH status bebas.
- Pagination cursor-based untuk daftar yang tumbuh (`?cursor=&limit=`), offset hanya untuk master data kecil.
- Respons daftar: `{ data: [], page: { next_cursor, total? } }`. Error: `{ error: { code, message, details[] } }`.
- Versi di path (`/v1`); perubahan breaking hanya lewat versi baru. [CI: `oasdiff`]
- Setiap operasi OpenAPI wajib punya `operationId`, `x-permission`, contoh request dan response.

## 6. Review checklist

- Apakah ada aturan bisnis di handler atau komponen UI? Pindahkan ke domain/service.
- Apakah query menyertakan tenant dan tahun ajaran lewat helper, bukan manual?
- Apakah ada string pengguna hardcoded?
- Apakah error punya `code` stabil dan sudah didokumentasikan di OpenAPI?
- Apakah komponen baru menggandakan sesuatu yang sudah ada di `packages/ui`?
- Apakah test menutupi jalur gagal, bukan hanya jalur sukses?
- Apakah perubahan skema memerlukan backfill data dan sudah ada skripnya?
