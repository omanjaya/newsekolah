# 05. Shared Components

Tujuan: setiap pola UI yang di aplikasi lama ditulis ulang 4 sampai 39 kali menjadi satu komponen di `packages/ui` (web) dan `packages/mobile-ui` (React Native), dengan token dari `packages/ui-tokens`. Halaman tidak boleh membuat versi lokal dari yang ada di sini (ditegakkan lint `no-restricted-syntax` untuk class `modal-backdrop` dan sejenisnya, plus review).

## 1. Token (`packages/ui-tokens`)

Sumber tunggal: `tokens.json` -> digenerate menjadi CSS variables (`--color-*`, `--space-*`, `--radius-*`, `--text-*`, `--shadow-*`, `--z-*`) untuk web dan objek TypeScript untuk NativeWind. Nilai mengikuti `DESIGN.md`. Warna aksen dan logo tenant disuntik runtime (`--color-accent`) dari endpoint branding; token lain tetap.

## 2. Primitif web (`packages/ui`, di atas shadcn/ui + Radix)

| Komponen                                                                                                                                            | Menggantikan di kode lama                                                    | Catatan                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `Button` (variant: primary, secondary, ghost, danger; size: sm, md; `loading`, `icon`)                                                              | 6+ class tombol lokal                                                        | Ikon Lucide 16/20                                                             |
| `IconButton`                                                                                                                                        | `table-action-button`, `notification-control-button`                         | `aria-label` wajib (tipe TS memaksa)                                          |
| `Input`, `Textarea`, `Select`, `Combobox` (async, downshift diganti cmdk), `Checkbox`, `Radio`, `Switch`, `DatePicker`, `TimePicker`, `NumberInput` | input Tabler + `number-input.ts`                                             | Semua terhubung `react-hook-form` lewat `FormField`                           |
| `Form`, `FormField`, `FormLabel`, `FormMessage`, `FormDescription`                                                                                  | 183 label tanpa `htmlFor`                                                    | Pesan error dari zod, i18n                                                    |
| `Dialog`, `ConfirmDialog`, `Sheet` (bawah untuk mobile), `Drawer`                                                                                   | 24 modal buatan sendiri, `ConfirmDialog` lama, sheet "Lainnya"               | Focus trap, Escape, restore focus, portal; otomatis `Sheet` di layar < 640 px |
| `Toast` (`useToast`)                                                                                                                                | 35 `alert` inline                                                            | Sukses, error dengan aksi "Coba lagi", tidak menumpuk lebih dari 3            |
| `Alert`                                                                                                                                             | alert statis yang memang perlu menetap (peringatan tahun ajaran belum aktif) |                                                                               |
| `EmptyState` (ikon, judul, deskripsi, aksi utama)                                                                                                   | teks "Tidak ada data."                                                       | Setiap daftar wajib memberi aksi                                              |
| `Skeleton`, `PageLoader`                                                                                                                            | 30 string "Memuat ..."                                                       | Skeleton bentuk konten, maksimal 1 detik lalu spinner                         |
| `PageHeader` (eyebrow, judul, aksi, breadcrumb)                                                                                                     | header ditulis per halaman                                                   |                                                                               |
| `Tabs`, `Badge`, `StatusBadge` (peta status presensi/workflow ke warna token)                                                                       | `MemberStatusBadge`, class badge per halaman                                 | Warna dari policy tenant                                                      |
| `Avatar` (inisial deterministik, gambar bertanda tangan)                                                                                            | `i.pravatar.cc`, `Avatar` versi lokal                                        |                                                                               |
| `Tooltip`, `Popover`, `DropdownMenu`                                                                                                                | menu profil, dropdown notifikasi                                             |                                                                               |
| `Stepper`                                                                                                                                           | stepper terlambat dan izin keluar (2 implementasi)                           | Dipakai semua workflow                                                        |
| `Calendar` (bulan, hari berstatus, swipe)                                                                                                           | `StudentAttendanceCalendar`                                                  | Generik: presensi siswa, kalender akademik, jatuh tempo perpustakaan          |
| `Kbd`, `CommandPalette`                                                                                                                             | `LibraryCommandPalette`                                                      | Global, hasil dibatasi permission                                             |

## 3. Komponen data

| Komponen                            | Fungsi                                                                                                                                                                                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DataTable` (TanStack Table)        | Mode server-side default: sorting, filter kolom, pencarian debounce, pagination cursor/offset, pilihan baris, aksi massal, kolom tersembunyi tersimpan per pengguna, ekspor CSV/XLSX lewat API, kepadatan normal/padat, pintasan keyboard. Menggantikan `DataTable` lama dan pagination lokal `homeroom-class` |
| `DataList`                          | Versi kartu untuk mobile dan layar sempit dari sumber data yang sama                                                                                                                                                                                                                                           |
| `FilterBar`                         | Filter terstandar (tahun ajaran, kelas, tanggal, status) yang menulis ke URL search params                                                                                                                                                                                                                     |
| `StatTile`, `ChartLine`, `ChartBar` | Statistik dashboard dan laporan (mengikuti skill `dataviz`)                                                                                                                                                                                                                                                    |
| `Timeline`                          | Event workflow, audit log per objek                                                                                                                                                                                                                                                                            |

## 4. Komponen domain

| Komponen                                                                           | Dipakai oleh                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AttendanceGrid`                                                                   | Presensi guru: baris siswa, status sebagai segmented control, default hadir, pencarian, "hanya tidak hadir", pelanggaran inline, catatan; bekerja dengan draf offline                                             |
| `StatusLegend`                                                                     | Semua tampilan presensi                                                                                                                                                                                           |
| `SchedulePicker`, `PeriodRangePicker`                                              | Jadwal, izin keluar                                                                                                                                                                                               |
| `PersonPicker` (siswa/guru async dengan avatar dan kelas)                          | Pelanggaran, konseling, penugasan, pengumuman                                                                                                                                                                     |
| `Scanner` (`useScanner`)                                                           | Satu implementasi kamera: `BarcodeDetector` dengan fallback zxing; QR, Code 39/128, EAN-13; mode beruntun; keyboard-wedge; status izin kamera. Menggantikan 4 setup `qr-scanner` + `BarcodeScanner` + `ScanInput` |
| `QrDisplay`                                                                        | QR berputar dengan hitung mundur dan bunyi opsional (TeacherQRModal)                                                                                                                                              |
| `ImageCropUpload`                                                                  | 4 integrasi cropper lama (avatar, logo, bukti izin, bukti konseling); unggah presigned ke S3; kompresi klien                                                                                                      |
| `FileDropzone` + `ImportWizard` (unggah, pemetaan kolom, preview, commit, laporan) | Import pengguna, siswa-kelas, perpustakaan, Dapodik                                                                                                                                                               |
| `DocumentPreview`                                                                  | Surat izin, SP, kartu, label: iframe PDF dari API + tombol unduh/cetak (menggantikan 8 pengunduh blob)                                                                                                            |
| `WorkflowStageCard`                                                                | Menampilkan tahap saat ini, siapa yang harus menyetujui, aksi scan                                                                                                                                                |
| `NotificationBell`, `NotificationList`                                             | Header dan halaman notifikasi                                                                                                                                                                                     |
| `AcademicYearBanner`                                                               | Peringatan bila tidak ada tahun aktif, dengan tautan                                                                                                                                                              |
| `TenantBrand`                                                                      | Logo dan nama dari branding                                                                                                                                                                                       |

## 5. Shell aplikasi (`apps/web/components`)

- `AppShell`: satu layout untuk route group `(app)`; sidebar desktop, tab bar mobile, header. Menu dari satu sumber `navigation.ts` (item, ikon, permission, modul) yang dipakai sidebar, tab bar, command palette, dan breadcrumb. Tidak ada dua registri menu.
- `SessionProvider`: memuat `me` sekali; hook `useSession()`, `useCan(permission)`, `useTenant()`.
- `RouteGuard`: berbasis permission dari server, bukan role di localStorage; halaman tanpa izin mendapat 403 yang menjelaskan.
- `ErrorBoundary` per route group + `error.tsx`, `not-found.tsx`, `global-error.tsx`.
- `ImpersonationBanner`, `OfflineIndicator`, `UpdateAvailable` (PWA).

## 6. Paket bersama non-UI

| Paket                 | Isi                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/api-client` | Klien fetch bertipe hasil generate; interceptor refresh token; `ApiError` dengan `code`; Idempotency-Key otomatis untuk POST; dukungan AbortSignal            |
| `packages/schemas`    | zod: form login, profil, presensi, izin, pelanggaran, komponen nilai, bibliografi, import; pesan error i18n                                                   |
| `packages/query`      | Hook TanStack Query per endpoint dan `queryKeys` terpusat; dipakai web dan mobile                                                                             |
| `packages/domain`     | Fungsi murni yang harus identik di semua klien: label status, perhitungan status harian untuk tampilan, format tanggal per locale/zona, nomor dokumen preview |
| `packages/i18n`       | Katalog pesan `id` dan `en` (ICU), dibagi web dan mobile                                                                                                      |

## 7. Komponen mobile (`packages/mobile-ui`)

Padanan RN untuk: Button, IconButton, Input, Select (sheet), Sheet, Dialog, Toast, EmptyState, Skeleton, StatusBadge, Avatar, Stepper, Calendar, AttendanceGrid (gesture), Scanner (expo-camera), QrDisplay, WorkflowStageCard, NotificationList, DataList. Token yang sama lewat NativeWind.

## 8. Storybook dan uji

Setiap komponen di `packages/ui` punya story (tema terang/gelap, RTL tidak diperlukan) dan uji aksesibilitas otomatis (axe) di CI. Komponen domain punya uji interaksi (Testing Library). Visual regression (Chromatic atau Playwright screenshot) untuk DataTable, AttendanceGrid, Calendar, Scanner (mock).

## 9. Aturan penggunaan

1. Sebelum membuat komponen baru, cari di Storybook. Bila ada yang 80% cocok, tambahkan prop, jangan duplikasi.
2. Komponen `packages/ui` tidak boleh memanggil API atau membaca sesi; data masuk lewat props.
3. Komponen fitur (`apps/web/features/*/components`) boleh memakai hook data dan hanya dipakai dalam fiturnya; bila dipakai fitur kedua, pindahkan ke `packages/ui`.
4. Tidak ada emoji dan tidak ada ikon selain Lucide.
5. Semua string lewat i18n; komponen menerima label sebagai props atau memakai kunci pesan bersama.

## 10. Laporan dan ekspor

Fondasi untuk laporan yang bisa diunduh dengan kop laporan dan kolom yang bisa disesuaikan pengguna, per kelas maupun per angkatan (satu tingkat kelas). Bagian ini meringkas kontraknya; detail implementasi ada di komentar paket masing-masing.

### `reportdoc` (`apps/api/internal/platform/reportdoc`)

Paket platform leaf (tanpa akses DB, tanpa impor modul, sama seperti `platform/documents`) yang merender satu `Document` generik menjadi XLSX (`excelize`) atau PDF (`go-pdf/fpdf`):

- `Document{Letterhead, Title, Scope []ScopeLine, Columns []Column, Sections []Section, Signature, PageLabelFormat}`. Satu `Section` = satu sheet (XLSX) atau satu kelompok halaman (PDF) — laporan satu kelas punya satu `Section`, laporan satu angkatan punya satu `Section` per kelas.
- `Column{Key, Label, Kind (text|number|date|percent), Width}`. `Key` adalah nama mesin yang stabil, dirujuk oleh `Options.Columns`; `Label` yang tampil ke pengguna boleh diganti tanpa mengubah `Key`.
- `Options{Format (xlsx|pdf), Title, ShowLetterhead, Columns []ColumnChoice{Key, Label}}` lalu `Apply(doc, opts) (Document, error)` menyaring dan mengurutkan ulang `Columns` beserta setiap baris di `Sections`. Key yang tidak dikenal mengembalikan `*UnknownColumnError` (dipetakan ke 400 di lapisan HTTP).
- `RenderXLSX`/`RenderPDF` menggambar kop laporan (logo + baris teks), judul, baris cakupan (`Scope`), header tabel yang di-bold/freeze/autofilter (XLSX) atau diulang tiap halaman (PDF), sel bertipe (angka tetap numerik, tanggal tetap tanggal), baris total opsional, dan blok tanda tangan. PDF memilih potret/lanskap dari total lebar kolom, dan nomor halaman memakai `Document.PageLabelFormat` (mis. `"Halaman {page} dari {pages}"`) — teks selalu dari pemanggil, tidak pernah di-hardcode di paket ini.
- `reportdoc.LetterheadSource` adalah interface kecil (`Letterhead(ctx, tenantID) (*Letterhead, *Signature, error)`) yang diimplementasikan modul mana pun yang tahu cara memuat kop laporan tenant. Lihat komentar paketnya untuk pola adaptor.

### Pengaturan tenant "Kop laporan" (modul `school`)

Disimpan sebagai satu baris `tenant_settings` (`key = "report_header.config"`, `value` jsonb) — tidak perlu migrasi baru karena tabel key/value generik ini sudah ada untuk `branding.*`. Bentuknya: `{show_logo, lines (1-5), place, signers []{role_label, name, id_label, id_number}}`, divalidasi oleh `domain.ValidateReportHeaderWrite`.

Endpoint (izin `manage_settings`, sama seperti branding):

- `GET/PUT /v1/tenant/report-header`
- `GET /v1/tenant/report-header/preview?format=pdf|xlsx` — merender contoh dokumen dengan kop laporan yang tersimpan, dipakai halaman pengaturan untuk pratinjau langsung.

`school/service.Service.ReportLetterhead(ctx, tenantID) (*reportdoc.Letterhead, *reportdoc.Signature, error)` adalah helper yang diekspor untuk modul lain: ia memuat `ReportHeader`, dan bila `show_logo` aktif, mengunduh logo branding tenant lewat `storage.Client.DownloadBounded` (hanya PNG/JPEG yang bisa ditanam ke dokumen; WebP/SVG diabaikan secara diam-diam, baris teks tetap tampil). Modul lain tidak memanggil paket ini langsung — selalu lewat adaptor sempit di `apps/api/internal/wiring` (lihat `wiring.ReportHeaderReports`), pola yang sama dengan setiap pembacaan lintas modul lain di `docs/03-layered-architecture.md` bagian 1.

### Kontrak query param ekspor

`GET /v1/reports/{reportKind}/export` (permission per-report dari katalog) menerima, selain parameter cakupan yang sudah ada (`class_id`, `subject_id`, `term_id`, `date`):

| Param            | Bentuk            | Default              | Keterangan                                                                             |
| ---------------- | ----------------- | -------------------- | -------------------------------------------------------------------------------------- |
| `grade_level_id` | uuid              | -                    | Cakupan angkatan; untuk `attendance.daily`, satu section per kelas di tingkat tersebut |
| `format`         | `xlsx` \| `pdf`   | `xlsx`               |                                                                                        |
| `title`          | string            | judul bawaan laporan |                                                                                        |
| `letterhead`     | `true` \| `false` | `true`               |                                                                                        |
| `columns`        | string            | kosong = semua kolom | Daftar dipisah koma, tiap entri `key` atau `key:Label` (Label di-`encodeURIComponent`) |

Hari ini hanya `attendance.daily` yang sudah pindah ke `reportdoc` sepenuhnya (lihat `reports/service.Service.RunDocument`); kind lain tetap memakai jalur `Run`/XLSX lama tanpa berubah, terlepas dari `format` yang dikirim.

### `ReportExportDialog` (`apps/web/components/report-export-dialog.tsx`)

Dialog unduh laporan yang dipakai bersama: kontrol format (Excel/PDF), input judul, switch "Tampilkan kop laporan", daftar kolom (checkbox + label bisa diedit + naik/turun, bisa dioperasikan keyboard, target sentuh besar di HP), dan "Pulihkan default". Dialog ini tidak pernah memanggil jaringan sendiri — `onExport(options)` yang melakukan unduhan (biasanya lewat helper fetch-ke-blob terautentikasi yang sudah ada, `apps/web/features/reports/api.ts`'s `downloadReportExport`/`downloadCustomReportExport`). Pilihan terakhir (format, kop laporan, kolom termasuk urutan/label/keterpilihan) disimpan di `localStorage["newsekolah:report-export:<reportKey>"]`, dibungkus try/catch.

Props: `{ open, onOpenChange, reportKey, defaultTitle, availableColumns: {key,label}[], scopeSlot?, onExport(options) }`. `options` yang dikirim ke `onExport`: `{ format, title, showLetterhead, columns: {key, label?}[] }`.

Halaman pengaturan "Kop laporan" ada di `/settings/report-header` (`apps/web/features/settings/components/report-header-view.tsx`), dengan pratinjau PDF langsung (`<iframe>` di desktop, tombol "Lihat pratinjau" di HP) memakai `GET /v1/tenant/report-header/preview`.

### Daftar periksa migrasi satu jenis laporan

1. Di sisi Go: tentukan `Key` yang stabil untuk tiap kolom laporan (jangan pakai label yang tampil), bangun `reportdoc.Document` dari data modul, tambahkan `RunDocument`-setara atau perluas fungsi render laporan itu untuk menerima `reportdoc.Options` dan memanggil `reportdoc.Apply` lalu `RenderXLSX`/`RenderPDF`. Pertahankan jalur lama tetap berfungsi untuk pemanggil yang belum pindah.
2. Tambahkan `format`, `title`, `letterhead`, `columns` (dan argumen cakupan baru bila perlu, mis. `grade_level_id`) ke operasi OpenAPI laporan tersebut di `openapi/modules/reports.yaml`, lalu `pnpm openapi:bundle` dan `make api-gen` (sqlc + oapi-codegen).
3. Panggil `service.ReportLetterhead`-setara (lewat adaptor `wiring`) untuk mengisi `Document.Letterhead`/`Document.Signature` bila laporan itu memang dicetak/diarsipkan.
4. Di sisi web: daftar `availableColumns` (key + label i18n), render `ReportExportDialog` (dengan `scopeSlot` bila laporan itu punya kontrol cakupan sendiri seperti kelas/angkatan/rentang tanggal), panggil `downloadCustomReportExport` (atau bangun URL query sendiri mengikuti kontrak di atas) dari `onExport`.
5. `pnpm --filter @newsekolah/api-client generate` supaya tipe TypeScript ikut ter-update, lalu `pnpm typecheck && pnpm --filter web lint && pnpm --filter web test`.
