# 05. Shared Components

Tujuan: setiap pola UI yang di aplikasi lama ditulis ulang 4 sampai 39 kali menjadi satu komponen di `packages/ui` (web), dengan token dari `packages/ui-tokens`. Halaman tidak membuat versi lokal dari yang ada di sini. Yang dijaga lint hanya sebagian (bagian 8); sisanya dijaga tinjauan kode.

Dokumen ini memisahkan yang **sudah ada** di kode dari yang **masih rencana**. Status per 17 November 2026, setelah overhaul UI (`docs/superpowers/specs/2026-11-14-ui-overhaul-design.md`); daftar ekspor lengkap ada di `packages/ui/src/index.ts`.

## 1. Token (`packages/ui-tokens`)

Sumber tunggal: `tokens.json`, dibangkitkan menjadi CSS variable (`--color-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--z-*`, `--duration-*`, `--ease-*`) dan kelas peran tipografi (`dist/type-roles.css`), lalu dipetakan ke Tailwind di `packages/config/tailwind/preset.css`. Isi dan pemakaiannya dijelaskan di `docs/07-ui-ux.md` bagian 0. Kontras setiap pasangan warna diperiksa `pnpm --filter @newsekolah/ui-tokens test`. Warna aksen tenant disuntik saat runtime (`--tenant-accent`) dari endpoint branding; token lain tetap.

## 2. Primitif web (`packages/ui`, di atas Radix)

### Sudah ada

| Kelompok             | Komponen                                                                                                                                                                                                                                       | Catatan                                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aksi                 | `Button` (primary, secondary, ghost, danger; sm, md; `loading`, `icon`), `IconButton`, `TextLink`, `RowActionsMenu`                                                                                                                            | `type="button"` bawaan, umpan balik tekan; `IconButton` wajib `aria-label` (dipaksa tipe) dan memberi tooltip sendiri                                             |
| Form                 | `Field`, `FieldError`, `FormSection`, `FormActions`, `FormError`, `Form`/`FormField`/`FormItem`/`FormLabel`/`FormMessage`/`FormDescription`                                                                                                    | `Field` bekerja dengan dan tanpa react-hook-form; label, petunjuk, galat, dan tanda wajib terhubung ke kontrolnya                                                 |
| Kontrol              | `Input`, `PasswordInput`, `SearchInput`, `Textarea`, `Select`, `Combobox`, `Checkbox`, `RadioGroup`, `Switch`, `NumberInput`, `SegmentedControl`, `DatePicker`, `DateRangePicker`, `MonthPicker`, `TimePicker`                                 | Satu set keadaan batas di `field-styles.ts`; pemilih tanggal di atas `Popover` dan `Calendar`                                                                     |
| Permukaan dan isi    | `Card` (`tone` default, sunken, accent-soft, raised; `padding`; `interactive`), `SectionHeader`, `List`/`ListRow`, `DataList`, `HeroCard`, `Stat`/`StatGrid`, `StatTile`, `IconCircle`, `Avatar`, `AvatarGroup`, `Progress`, `Kbd`, `SafeHtml` | Kapan memakai tiap `tone` Card: `docs/07-ui-ux.md` bagian 0                                                                                                       |
| Badge                | `Badge` (`tone`, `appearance` soft/solid/outline, `size`), `CountBadge`, `StatusBadge` (status presensi), `SemanticStatusBadge` (status alur kerja)                                                                                            | Dua yang terakhir merender lewat `Badge`; token `status-*` hanya untuk presensi                                                                                   |
| Keadaan              | `EmptyState` (framed, inline, compact), `FirstUseEmptyState`, `FilteredEmptyState`, `Alert` (nada semantik), `Skeleton` dan preset `SkeletonList`/`SkeletonCards`/`SkeletonForm`/`SkeletonDetail`, `StatePage`, `Toaster`/`toast`/`useToast`   | `StatePage`: 404, galat, tanpa akses, modul nonaktif, offline                                                                                                     |
| Lapisan              | `Dialog` (sm, md, lg, xl), `ConfirmDialog`, `Sheet` (bawah atau kanan), `Popover`, `DropdownMenu`, `Tooltip`, `CommandPalette`                                                                                                                 | `Dialog` otomatis menjadi lembar bawah di bawah 640 px dengan footer lengket; lembar bawah bisa diseret turun di HP; focus trap, Escape, kembalikan fokus         |
| Halaman dan navigasi | `PageShell` (default, wide, narrow, fit), `PageHeader`, `Breadcrumb`, `Tabs` (pill, underline), `NavTabs`, `Stepper`, `Calendar`, `StickySaveBar`                                                                                              | `PageHeader` melaporkan judulnya ke header HP (`useCollapsingTitle`); di HP aksi kedua dan seterusnya masuk satu menu                                             |
| Data                 | `DataTable` (bagian 3), `DataTableFilters`, `DataTableToolbar`, `DataTablePagination`, `DataTableErrorState`, `Table`                                                                                                                          |                                                                                                                                                                   |
| Pindai dan QR        | `Scanner` (action, kiosk), `BarcodeScannerField`, `ScannerResultBanner`, `QrPanel`, hook `useCameraScanner`, `useBarcodeScanner`, `useScanFeedback`                                                                                            | Satu implementasi kamera (`BarcodeDetector` dengan cadangan), mode beruntun, keyboard-wedge, status izin kamera; `QrPanel` untuk QR berputar dengan hitung mundur |
| Hook lain            | `useCountUp`, `useActiveIndicator`, `useScrollEdges`, `useMediaQuery`, `useHydrated`                                                                                                                                                           | Hitung naik angka, pil indikator yang bergeser, bayangan tepi strip yang menggulir                                                                                |
| Label dan tautan     | `UiLabelsProvider`/`useUiLabels`, `UiLinkProvider`/`UiLink`                                                                                                                                                                                    | Semua teks bawaan komponen datang dari `UiLabels` (diisi aplikasi lewat i18n); tautan memakai komponen tautan aplikasi                                            |

### Masih rencana

| Komponen                                                                                                                                                                                                             | Untuk                                          | Keadaan sekarang                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `Timeline`                                                                                                                                                                                                           | Event alur kerja, jejak audit per objek        | `Stepper` menampilkan tahap, aktor, dan waktu; jejak audit memakai tabel                                |
| Grafik (`ChartLine`, `ChartBar`)                                                                                                                                                                                     | Statistik dasbor dan laporan                   | Grafik ditulis per fitur (misalnya `dashboard-series-chart.tsx` di perpustakaan)                        |
| `Drawer` terpisah, `PageLoader`                                                                                                                                                                                      | Laci samping dan pemuat halaman                | Tidak diperlukan: `Sheet side="right"` menjadi laci; pemuat halaman ada di `apps/web` (`page-skeleton`) |
| Kepadatan rapat `SegmentedControl`, penanda target di `Progress`, keadaan terpilih di `Stat`, slot ikon di opsi `Select`, mode saring sendiri di `Combobox`, aksi ganda di `Alert`, pemilih tanggal dan jam gabungan | Kebutuhan yang dilaporkan area selama overhaul | Diakali per fitur; dicatat sebagai celah komponen bersama                                               |

## 3. Komponen data

`DataTable` (TanStack Table) sudah ada: sorting, filter kolom lewat `DataTableFilters`, pencarian dengan debounce, paginasi offset atau kursor dengan satu footer yang menyebut jumlah data, pilihan baris dan aksi massal, kolom tersembunyi tersimpan per pengguna, kepadatan `normal` atau `compact`, `fillHeight` untuk halaman `fit`, kartu di HP, dan keadaan galat (`error`, `onRetry`) yang tidak lagi tampil sebagai daftar kosong. Kolom aksi baris memakai tombol `size="sm"`. Tabel kecil yang ditulis tangan (grid isian nilai, register) memakai `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`/`TableCaption`/`TableFooter`, dengan `density` yang meniru spasi `DataTable`; sel angka memakai `text-right tabular-nums`.

`DataTableFilters` adalah baris pil filter di toolbar, di samping kotak cari. Pil kosong membuka popover pilihan tunggal (`select`) atau langsung menjadi tombol nyala dan mati (`boolean`); pil terisi menumbuhkan tombol hapus dan menjadi chip aktifnya sendiri. "Hapus semua filter" muncul begitu ada filter aktif; label itu sama dengan tombol `FilteredEmptyState`, datang dari `UiLabels`, dan layar tidak menimpanya. Tombol hapus satu chip bernama "Hapus filter {label}". Nilai filter disimpan pemanggil (di web lewat `useUrlState`); komponen tidak menulis ke URL. Belum ada tipe filter bulan: daftar tagihan menaruh `MonthPicker` di aksi toolbar.

Kotak cari `DataTable` selalu menyebut apa yang dicari lewat `toolbarLabels.searchPlaceholder` ("Cari nama atau nama pengguna", bukan "Cari" saja). Tabel yang kolomnya tidak bisa dicari pembaca (kode, id, tanggal) mematikan kotak cari dengan `searchable={false}`. Uji `apps/web/features/data-table-search.test.ts` menjaga aturan ini.

`DataList` adalah versi kartu dari sumber data yang sama untuk layar sempit.

## 4. Komponen domain

### Sudah ada (di `apps/web`, dipakai lintas fitur)

| Komponen                                                                                | Letak                                                                                 |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `AppPage` (templat halaman di atas `PageShell`)                                         | `apps/web/components/app-page.tsx`; lihat `docs/07-ui-ux.md` bagian 3                 |
| `WorkspaceNav` (strip tab area yang ditulis sendiri)                                    | `apps/web/components/workspace-nav.tsx`                                               |
| `KioskShell` (bingkai layar dinding)                                                    | `apps/web/components/kiosk-shell.tsx`                                                 |
| `ForbiddenPage`, `ModuleUnavailablePage`, `NotFoundState`, `RenderErrorState`           | `apps/web/components/`, semuanya di atas `StatePage`                                  |
| `ReportExportDialog`                                                                    | `apps/web/components/report-export-dialog.tsx` (bagian 10)                            |
| `TenantBrand`, `NotificationBell`                                                       | `apps/web/components/tenant-brand.tsx`, `apps/web/features/notifications/components/` |
| Roster presensi sesi (baris siswa, status sebagai radio, default hadir, simpan lengket) | `apps/web/features/attendance/components/session-*`                                   |
| `StudentPicker`, `DirectoryPicker`                                                      | `apps/web/features/*/components/`                                                     |

### Masih rencana

| Komponen                                                     | Untuk                                                                                  |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `AttendanceGrid` dan `StatusLegend` sebagai komponen bersama | Presensi guru dengan draf offline; sekarang roster sesi milik fitur presensi           |
| `SchedulePicker`, `PeriodRangePicker`                        | Jadwal, izin keluar                                                                    |
| `PersonPicker` (siswa dan guru, avatar dan kelas)            | Pelanggaran, konseling, penugasan, pengumuman; sekarang beberapa pemilih per fitur     |
| `ImageCropUpload`                                            | Avatar, logo, bukti izin, bukti konseling                                              |
| `FileDropzone` dan `ImportWizard`                            | Impor pengguna, siswa-kelas, perpustakaan, Dapodik; sekarang tombol pilih berkas biasa |
| `DocumentPreview`                                            | Surat izin, SP, kartu, label                                                           |
| `WorkflowStageCard`                                          | Tahap saat ini, siapa yang menyetujui, aksi pindai                                     |
| `AcademicYearBanner`                                         | Peringatan bila tidak ada tahun ajaran aktif                                           |

## 5. Shell aplikasi (`apps/web/components`)

- `AppShell`: satu layout untuk route group `(app)`; sidebar desktop, tab bawah HP, header. Menu dari satu sumber `navigation.ts` (item, ikon, permission, modul, audiens) yang dipakai sidebar, tab bawah, tab area, command palette, judul halaman, dan breadcrumb. Tidak ada dua registri menu.
- Kerangka HP: `MobileTabBar` (Beranda, dua tab, tombol tengah, satu tab, Menu; aturan per peran di `lib/mobile-navigation.ts`), `MobileMenu` (lembar Menu dengan aksi cepat yang bukan tombol tengah), dan header ringkas yang menampilkan nama halaman begitu judul besar tergulir keluar. Tombol aksi cepat mengambang sudah tidak ada.
- `KioskShell`: bingkai route group `(kiosk)` untuk monitor presensi dan dua kios perpustakaan.
- `SessionProvider`: memuat `me` sekali; hook `useSession()` dan `useCan(permission)`.
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

Masih rencana di bagian ini: `packages/query` (hook TanStack Query bersama) dan `packages/domain` (fungsi murni lintas klien) belum ada sebagai paket; hook query tinggal di `apps/web/features/*/api.ts`.

## 7. Komponen mobile (`packages/mobile-ui`)

Masih rencana; paketnya belum ada, dan aplikasi mobile ditunda sampai web selesai. Yang direncanakan: padanan React Native untuk Button, IconButton, Input, Select (lembar), Sheet, Dialog, Toast, EmptyState, Skeleton, StatusBadge, Avatar, Stepper, Calendar, AttendanceGrid (gesture), Scanner (expo-camera), QrPanel, WorkflowStageCard, NotificationList, dan DataList, dengan token yang sama lewat NativeWind.

## 8. Storybook, uji, dan lint

Yang sudah berjalan:

- **Story.** 58 berkas story di `packages/ui` (`pnpm --filter @newsekolah/ui storybook`), termasuk "Foundations" untuk token, tipografi, dan gerak. Belum setiap komponen punya story, dan Storybook tidak dibangun di CI.
- **Uji komponen.** Vitest dan Testing Library untuk `packages/ui` dan `apps/web`. 50 berkas uji di `packages/ui` juga memeriksa aksesibilitas dengan axe (`expectNoAxeViolations`, `packages/ui/src/test/axe.ts`); pemeriksaan itu ikut berjalan di CI karena CI menjalankan `pnpm test`.
- **CI** (`.github/workflows/ci.yml`, job `web-packages`): `pnpm typecheck`, `pnpm lint`, `pnpm test`, lalu build web beserta paket yang dipakainya. Job `e2e-sim` menjalankan simulasi Playwright multi-peran di atas stack dev bila kode yang disentuhnya berubah.
- **Lint** (`packages/config/eslint`): warna palet Tailwind, warna tetap, dan warna literal di nilai arbitrer ditolak di seluruh repo; emoji ditolak di string dan teks JSX; ukuran font literal (`text-[Npx]`) ditolak di `packages/ui` dan `apps/web`. Di `apps/web` plugin `design-system` juga menolak panel berbingkai dengan radius lama (`rounded-sm`/`rounded-xs`), input tanggal, waktu, bulan, dan angka bawaan, dialog bawaan peramban (`window.confirm`, `alert`, `prompt`), serta elemen mentah (`button`, `select`, `textarea`, `table`, `label`, `h1` sampai `h6`) di `apps/web/features` dan `apps/web/app` (spesifikasi overhaul bagian 8). `jsx-a11y` (rekomendasi) dan `react-hooks` aktif untuk semua berkas React.

Yang masih rencana:

- Uji regresi visual (Chromatic atau tangkapan Playwright) untuk DataTable, roster presensi, Calendar, dan Scanner. Sekarang tangkapan layar hanya dibuat manual saat tinjauan.
- Uji axe untuk halaman utuh di `apps/web`.

## 9. Aturan penggunaan

1. Sebelum membuat komponen baru, cari di `packages/ui/src/index.ts` dan Storybook. Bila ada yang 80% cocok, tambahkan prop tanpa merusak API yang ada, jangan duplikasi.
2. Komponen `packages/ui` tidak boleh memanggil API atau membaca sesi; data masuk lewat props.
3. Komponen fitur (`apps/web/features/*/components`) boleh memakai hook data dan hanya dipakai dalam fiturnya; bila dipakai fitur kedua, pindahkan ke `packages/ui`.
4. Tidak ada emoji dan tidak ada ikon selain Lucide.
5. Semua string lewat i18n; komponen menerima label sebagai props atau lewat `UiLabels`, tidak pernah ditulis di dalam komponen.

## 10. Laporan dan ekspor

Fondasi untuk laporan yang bisa diunduh dengan kop laporan dan kolom yang bisa disesuaikan pengguna, per kelas maupun per angkatan (satu tingkat kelas). Bagian ini meringkas kontraknya; detail implementasi ada di komentar paket masing-masing.

### `reportdoc` (`apps/api/internal/platform/reportdoc`)

Paket platform leaf (tanpa akses DB, tanpa impor modul, sama seperti `platform/documents`) yang merender satu `Document` generik menjadi XLSX (`excelize`) atau PDF (`go-pdf/fpdf`):

- `Document{Letterhead, Title, Scope []ScopeLine, Columns []Column, Sections []Section, Signature, PageLabelFormat, EmptyRowsLabel}`. Satu `Section` = satu sheet (XLSX) atau satu kelompok halaman (PDF) — laporan satu kelas punya satu `Section`, laporan satu angkatan punya satu `Section` per kelas. `Section` tanpa `Rows` merender satu baris `EmptyRowsLabel` (mis. "Tidak ada data") alih-alih header tanpa isi. `Section.Columns`, bila diisi (non-nil), menimpa `Document.Columns` khusus untuk section itu — dipakai laporan yang section-nya benar-benar punya jumlah kolom berbeda (mis. ringkasan akreditasi perpustakaan: satu section indikator 2 kolom, satu section rincian per kelas DDC 3 kolom, dalam satu `Document`). `Apply` melewatkan section dengan `Columns` sendiri apa adanya (tidak ikut disaring oleh `Options.Columns`, karena kuncinya bukan milik `Document.Columns`) — laporan seperti ini karena itu tidak menawarkan kustomisasi kolom di dialog (lihat `columnsCustomizable` di bawah). `RenderPDF` memilih orientasi satu kali untuk seluruh dokumen dari section mana pun yang butuh lanskap (fpdf mengunci ukuran halaman sejak dibuat), lalu menghitung lebar kolom per section dari kolom efektifnya sendiri.
- `Column{Key, Label, Kind (text|number|date|percent), Width}`. `Key` adalah nama mesin yang stabil, dirujuk oleh `Options.Columns`; `Label` yang tampil ke pengguna boleh diganti tanpa mengubah `Key`.
- `Letterhead{Logo, Lines, Emphasis}`. `Emphasis` adalah indeks baris yang jadi "nama sekolah" — dirender tebal, lebih besar, dan jadi pusat perhatian blok kop surat (baris lain tampil polos, blok teks rata tengah, logo di kiri, dua garis penutup). Indeks di luar jangkauan jatuh ke baris pertama.
- `Options{Format (xlsx|pdf), Title, ShowLetterhead, Columns []ColumnChoice{Key, Label}}` lalu `Apply(doc, opts) (Document, error)` menyaring dan mengurutkan ulang `Columns` beserta setiap baris di `Sections`. Key yang tidak dikenal mengembalikan `*UnknownColumnError` (dipetakan ke 400 di lapisan HTTP).
- `RenderXLSX`/`RenderPDF` menggambar kop laporan, judul, baris cakupan (`Scope`), header tabel yang di-bold/freeze/autofilter (XLSX) atau diulang tiap halaman (PDF) dengan **tinggi baris header yang menyesuaikan label yang melipat** (bukan terpotong), sel bertipe (angka tetap numerik, tanggal tetap tanggal), baris total opsional, dan blok tanda tangan rata kanan (satu penanda tangan = satu blok kanan; dua penanda tangan = kolom kiri/kanan, mis. Wali Kelas kiri, Kepala Sekolah kanan) yang selalu utuh dalam satu halaman. PDF memilih potret/lanskap dari total lebar kolom, dan nomor halaman memakai `Document.PageLabelFormat` (mis. `"Halaman {page} dari {pages}"`) — teks selalu dari pemanggil, tidak pernah di-hardcode di paket ini.
- `reportdoc.LetterheadSource` adalah interface kecil (`Letterhead(ctx, tenantID) (*Letterhead, *Signature, error)`) yang diimplementasikan modul mana pun yang tahu cara memuat kop laporan tenant. Lihat komentar paketnya untuk pola adaptor.
- `DrawLetterhead(pdf *fpdf.Fpdf, lh *Letterhead)` dan `DrawSignature(pdf *fpdf.Fpdf, sig *Signature)` adalah jalan keluar untuk laporan yang layoutnya tidak bisa (atau belum layak) dipindah ke `Document`/`RenderPDF` sepenuhnya, tetapi tetap ingin kop laporan dan tanda tangan tenant yang sama seperti laporan lain — dipakai `library/service.MonthlyReportPDF`, yang tabelnya (grid indikator plus tiga tabel berjumlah kolom beda) tidak cocok dengan satu `Section` per kelas/angkatan. Keduanya aman dipanggil dengan argumen `nil` (tidak menggambar apa pun).
- `FormatDate(locale, time.Time) string`, `PageLabel(locale) string`, `EmptyRowsLabelFor(locale) string` di `locale.go`: helper generik id/en untuk format tanggal ("2 September 2026" vs "September 2, 2026") dan template teks bawaan. Paket ini **tidak** menerjemahkan kosakata laporan (label kolom, nilai status) — itu tanggung jawab pemanggil (lihat "Lokalisasi" di bawah).

### Lokalisasi (wajib untuk setiap laporan yang bermigrasi)

Setiap teks yang tampil ke pengguna di dokumen (judul, label kolom, label cakupan, nilai enum/status, teks baris kosong, footer halaman) harus mengikuti **locale tenant**, bukan bahasa Accept-Language peminta — dokumen adalah milik sekolah, bukan browser yang mengunduhnya. Pola yang dipakai `attendance.daily` (`reports/service/service.go`) dan wajib diikuti laporan lain yang bermigrasi:

1. Lapisan HTTP me-resolve locale dari `tenant.FromContext(ctx)` lewat `i18n.FromTenantLocale(t.Locale)` (default `i18n.DefaultLocale`, yaitu Indonesia) — lihat `reports/transport/http/handler.go`'s `tenantLocale(ctx)` — dan mengopernya sebagai parameter eksplisit ke fungsi render laporan (`RunDocument(..., locale string)`), bukan menaruhnya di context.
2. Buat tabel kosakata kecil per laporan (`map[string]map[string]string` dengan kunci `reportdoc.LocaleID`/`reportdoc.LocaleEN`) untuk judul, label kolom, dan label baris cakupan — lihat `attendanceDailyVocabulary` di `reports/service/service.go` sebagai contoh. Jangan taruh kosakata ini di `reportdoc`.
3. Nilai enum/status yang berasal dari kode tetap milik tenant (mis. kode presensi `H`/`S`/`I` yang labelnya `Hadir`/`Sakit`/`Izin` sudah dikonfigurasi tenant sendiri) memakai label tenant apa adanya — **tidak** diterjemahkan per locale, karena itu konten tenant, bukan kosakata sistem. Kode khusus yang bukan konten tenant (mis. `NONE`/`INCOMPLETE`/`MIXED`) diterjemahkan lewat kosakata laporan sendiri. Boolean seperti "lengkap/tidak" diterjemahkan ke "Ya"/"Tidak" (id) atau "Yes"/"No" (en) di lapisan `reports/service`, bukan dikirim sebagai string bahasa Inggris mentah dari modul sumber data — `wiring.AttendanceReports.DailyReportTypedRows` mengembalikan `bool`/kode mentah, bukan teks.
4. Tanggal selalu lewat `reportdoc.FormatDate(locale, t)`, footer halaman lewat `reportdoc.PageLabel(locale)`, baris kosong lewat `reportdoc.EmptyRowsLabelFor(locale)`.
5. Baris cakupan angkatan (`grade_level_id`) memakai **nama tingkat kelas sesungguhnya** (mis. "Kelas X"), bukan jumlah kelas — resolve lewat method sejenis `AcademicReader.GradeLevelName`, dengan jumlah kelas sebagai fallback hanya bila nama gagal diambil.

### Pengaturan tenant "Kop laporan" (modul `school`)

Disimpan sebagai satu baris `tenant_settings` (`key = "report_header.config"`, `value` jsonb) — tidak perlu migrasi baru karena tabel key/value generik ini sudah ada untuk `branding.*`. Bentuknya: `{show_logo, lines (1-5), emphasis, place, signers []{role_label, name, id_label, id_number}}`, divalidasi oleh `domain.ValidateReportHeaderWrite`.

`emphasis` adalah indeks ke `lines` yang jadi baris nama sekolah (lihat `reportdoc.Letterhead.Emphasis` di atas). Nilai sentinel `domain.EmphasisAuto` (-1, atau field diosongkan di request PUT) berarti "pilih otomatis": `domain.ResolveEmphasis` memilih baris yang sama persis dengan nama tenant, atau bila tidak ada yang cocok, baris kedua dari belakang (pola umum "Yayasan" / "Nama Sekolah" / "Alamat" / "Telepon"). Resolusi ini terjadi saat render (`ReportLetterhead`), bukan saat disimpan, supaya pilihan eksplisit tenant tidak pernah tertimpa heuristik ini pada penyimpanan berikutnya. Diekspos di halaman pengaturan sebagai radio button "Baris nama sekolah" dengan pilihan "Otomatis" plus satu per baris yang terisi.

Endpoint (izin `manage_settings`, sama seperti branding):

- `GET/PUT /v1/tenant/report-header`
- `GET /v1/tenant/report-header/preview?format=pdf|xlsx` — merender contoh dokumen dengan kop laporan yang tersimpan, dipakai halaman pengaturan untuk pratinjau langsung. Preview ini juga mengikuti locale tenant (kosakata sendiri di `previewLabels`, `transport/http/report_header.go`).

`school/service.Service.ReportLetterhead(ctx, tenantID) (*reportdoc.Letterhead, *reportdoc.Signature, error)` adalah helper yang diekspor untuk modul lain: ia memuat `ReportHeader`, resolve `Emphasis` lewat `domain.ResolveEmphasis` (perlu nama tenant, diambil lewat `repo.GetTenantByID`), dan bila `show_logo` aktif, mengunduh logo branding tenant lewat `storage.Client.DownloadBounded` (hanya PNG/JPEG yang bisa ditanam ke dokumen; WebP/SVG diabaikan secara diam-diam, baris teks tetap tampil). Modul lain tidak memanggil paket ini langsung — selalu lewat adaptor sempit di `apps/api/internal/wiring` (lihat `wiring.ReportHeaderReports`), pola yang sama dengan setiap pembacaan lintas modul lain di `docs/03-layered-architecture.md` bagian 1.

### Kontrak query param ekspor

`GET /v1/reports/{reportKind}/export` (permission per-report dari katalog) menerima, selain parameter cakupan yang sudah ada (`class_id`, `subject_id`, `term_id`, `date`):

| Param            | Bentuk            | Default              | Keterangan                                                                                   |
| ---------------- | ----------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| `grade_level_id` | uuid              | -                    | Cakupan angkatan (satu section per kelas di tingkat itu); saling eksklusif dengan `class_id` |
| `format`         | `xlsx` \| `pdf`   | `xlsx`               |                                                                                              |
| `title`          | string            | judul bawaan laporan |                                                                                              |
| `letterhead`     | `true` \| `false` | `true`               |                                                                                              |
| `columns`        | string            | kosong = semua kolom | Daftar dipisah koma, tiap entri `key` atau `key:Label` (Label di-`encodeURIComponent`)       |

Seluruh katalog sudah pindah ke `reportdoc` lewat `reports/service.Service.RunDocument`: `attendance.daily` (referensi awal), lalu `discipline.points`, `discipline.warning_letters`, `grading.report_scores`, `permits.leave_requests`, `permits.exit_permits_yearly`. `grading.report_scores` di cakupan angkatan memvalidasi mata pelajaran memang diampu di tingkat itu (400 `VALIDATION_FAILED` bila tidak) dan menyatukan kolom komponen penilaian lintas kelas (union berdasar kode komponen, urutan kemunculan pertama). `discipline.points`/`discipline.warning_letters`/`permits.leave_requests` tanpa `class_id`/`grade_level_id` tetap berarti "seluruh sekolah", satu section tanpa nama, sama seperti sebelum migrasi. Jalur `Run`/XLSX lama (`Sheet`) sudah tidak dipakai lagi oleh kind mana pun; `RunDocument` adalah satu-satunya jalur render.

Di web, `ReportExportDialog` sudah dipasang untuk `attendance.daily`, `discipline.warning_letters`, `permits.leave_requests`, dan `permits.exit_permits_yearly` (lihat `apps/web/features/reports/components/report-export-forms.tsx`). `discipline.points` dan `grading.report_scores` sengaja belum dipindah ke dialog: kolomnya dinamis per tenant (satu kolom per level SP yang dikonfigurasi tenant, atau per komponen penilaian yang dipilih), dan dialog belum bisa menampilkan daftar kolom itu di muka tanpa memanggil endpoint pratinjau -- menyaring kolom lewat dialog untuk keduanya akan diam-diam membuang kolom dinamis itu (`reportdoc.Apply` menyaring persis ke kolom yang dikirim). Keduanya tetap memakai tombol unduh polos (`downloadReportExport`, selalu XLSX, semua kolom) sampai ada endpoint pratinjau kolom.

### `ReportExportDialog` (`apps/web/components/report-export-dialog.tsx`)

Dialog unduh laporan yang dipakai bersama: kontrol format (Excel/PDF), input judul, switch "Tampilkan kop laporan", daftar kolom (checkbox + label bisa diedit + naik/turun, bisa dioperasikan keyboard, target sentuh besar di HP), dan "Pulihkan default". Dialog ini tidak pernah memanggil jaringan sendiri — `onExport(options)` yang melakukan unduhan (biasanya lewat helper fetch-ke-blob terautentikasi yang sudah ada, `apps/web/features/reports/api.ts`'s `downloadReportExport`/`downloadCustomReportExport`). Pilihan terakhir (format, kop laporan, kolom termasuk urutan/label/keterpilihan) disimpan di `localStorage["newsekolah:report-export:<reportKey>"]`, dibungkus try/catch.

Props: `{ open, onOpenChange, reportKey, defaultTitle, availableColumns: {key,label}[], columnsCustomizable?, scopeSlot?, onExport(options) }`. `options` yang dikirim ke `onExport`: `{ format, title, showLetterhead, columns: {key, label?}[] }`. `columnsCustomizable` (bawaan `true`) diberi `false` untuk laporan yang section-nya punya jumlah kolom berbeda (`reportdoc.Section.Columns`), tempat satu pilihan kolom milik pengguna tidak bisa berlaku untuk semua section sekaligus: daftar kolom disembunyikan sepenuhnya, `availableColumns` diabaikan, tombol ekspor tidak lagi mensyaratkan minimal satu kolom terpilih, dan `options.columns` yang dikirim selalu kosong (server menafsirkannya sebagai "semua kolom"). Dipakai `getLibraryCatalogueSummaryReportXlsx` (`apps/web/features/library/components/library-reports-view.tsx`).

Halaman pengaturan "Kop laporan" ada di `/settings/report-header` (`apps/web/features/settings/components/report-header-view.tsx`), dengan pratinjau PDF langsung (`<iframe>` di desktop, tombol "Lihat pratinjau" di HP) memakai `GET /v1/tenant/report-header/preview`.

### Daftar periksa migrasi satu jenis laporan

1. Di sisi Go: tentukan `Key` yang stabil untuk tiap kolom laporan (jangan pakai label yang tampil), bangun `reportdoc.Document` dari data modul, tambahkan `RunDocument`-setara atau perluas fungsi render laporan itu untuk menerima `reportdoc.Options` **dan** `locale string`, lalu memanggil `reportdoc.Apply` kemudian `RenderXLSX`/`RenderPDF`. Pertahankan jalur lama tetap berfungsi untuk pemanggil yang belum pindah.
2. Lokalisasi (lihat bagian "Lokalisasi" di atas): buat kosakata id/en laporan itu sendiri untuk judul/label kolom/label cakupan; pastikan modul sumber data mengembalikan nilai mentah (kode, bool, angka) bukan teks berbahasa Inggris siap pakai, supaya penerjemahan terjadi satu kali di `reports/service`; pakai `reportdoc.FormatDate`/`PageLabel`/`EmptyRowsLabelFor` untuk tanggal, footer halaman, dan baris kosong.
3. Tambahkan `format`, `title`, `letterhead`, `columns` (dan argumen cakupan baru bila perlu, mis. `grade_level_id`) ke operasi OpenAPI laporan tersebut di `openapi/modules/reports.yaml`, lalu `pnpm openapi:bundle` dan `make api-gen` (sqlc + oapi-codegen).
4. Panggil `service.ReportLetterhead`-setara (lewat adaptor `wiring`) untuk mengisi `Document.Letterhead`/`Document.Signature` bila laporan itu memang dicetak/diarsipkan; resolve locale di lapisan HTTP lewat `tenant.FromContext(ctx)` + `i18n.FromTenantLocale`, oper sebagai parameter eksplisit.
5. Di sisi web: daftar `availableColumns` (key + label i18n), render `ReportExportDialog` (dengan `scopeSlot` bila laporan itu punya kontrol cakupan sendiri seperti kelas/angkatan/rentang tanggal), panggil `downloadCustomReportExport` (atau bangun URL query sendiri mengikuti kontrak di atas) dari `onExport`.
6. `pnpm --filter @newsekolah/api-client generate` supaya tipe TypeScript ikut ter-update, lalu `pnpm typecheck && pnpm --filter web lint && pnpm --filter web test`.
7. Render contoh dokumennya (XLSX dan PDF) dan lihat hasilnya secara visual (`pdftoppm` untuk PDF) sebelum menganggap selesai — beberapa masalah (label header terpotong, kop surat tidak rata tengah, footer bertumpuk dengan baris terakhir) hanya kelihatan di render sungguhan, tidak di assertion test.
