# Lampiran A. Inventaris Frontend SION (kode lama)

Sumber: `reference/sion/frontend` (baseline, snapshot arimartana/sion) dibandingkan dengan `reference/sion-rebuild-go/frontend` (lebih baru, menambah modul perpustakaan dan OPAC). Dokumen ini adalah sumber kebenaran untuk fitur yang harus ada kembali di web dan mobile baru.

Stack lama: Next.js 16.2 App Router, React 19, TypeScript strict, Tabler Core 1.3 CSS + `@tabler/icons-react`, `qr-scanner`, `qrcode`, `xlsx`, `cropperjs`, `downshift`. Tanpa state library, tanpa test, tanpa konfigurasi ESLint di baseline.

Ukuran: 46 route, 20 komponen, 10 file lib, 31.459 baris di `app/` (11.157 di antaranya satu file CSS), `lib/api.ts` 3.530 baris dengan 158 fungsi dan 122 tipe.

## 1. Inventaris halaman

`app/layout.tsx` satu-satunya server component yang berarti; semua halaman `"use client"`. `app/page.tsx` redirect ke `/login`. `app/loading.tsx` mengembalikan `null` (tidak berfungsi). `app/manifest.ts` menghasilkan webmanifest statis.

### 1.1 Auth dan publik

| Route                       | Tujuan                                             | Peran             | UI                                                                        | API                                                         |
| --------------------------- | -------------------------------------------------- | ----------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `login` (265)               | Login + "biometrik" WebAuthn                       | anon              | Kartu berbranding, remember-me, ConfirmDialog opt-in biometrik            | `/api/settings/branding`, `/api/auth/login`, `/api/auth/me` |
| `leave-letter-verify` (128) | Verifikasi surat izin via QR, publik               | anon              | Form id+token, auto-run dari query                                        | `/api/leave-letters/verify`                                 |
| `monitoring` (348)          | Layar dinding progres pengisian presensi per kelas | kiosk, tanpa auth | Jam, progress ring, kartu kelas, WS reconnect, mode `?demo=36` data palsu | `/api/monitoring`, WS `/api/realtime/monitoring`            |
| `offline` (47)              | Fallback service worker                            | semua             | Redirect otomatis saat online                                             | -                                                           |

### 1.2 Shell inti

| Route           | Baris | Tujuan                             | Peran                | UI penting                                                                                                                   | Endpoint                                                        |
| --------------- | ----- | ---------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `dashboard`     | 661   | Beranda adaptif peran              | semua                | Salam per jam, cuaca eksternal (open-meteo, bigdatacloud), grid aplikasi guru/siswa, metrik admin + presence WS, rail jadwal | `/api/dashboard`, `/api/admin-dashboard`, WS presence           |
| `profile`       | 646   | Profil sendiri + detail per peran  | semua                | Cropper avatar, form kondisional per peran                                                                                   | `/api/profile`, `/api/profile/avatar`, `/api/users/:id/details` |
| `notifications` | 228   | Kotak masuk                        | `view_notifications` | DataTable, modal detail                                                                                                      | `/api/notifications`, `/read`, `/read-all`                      |
| `settings`      | 576   | White-label + kebijakan            | admin                | 5 tab general/modules/letter/schedule/security, cropper logo/favicon/kop                                                     | `/api/settings/general`                                         |
| `roles`         | 474   | CRUD role + matriks permission     | admin                | Checkbox permission bergrup                                                                                                  | `/api/roles`, `/api/roles/:role/permissions`                    |
| `users`         | 999   | CRUD pengguna, import, impersonasi | admin                | DataTable server-side, fieldset per peran, reset password, arsip/pulihkan, UserImportModal                                   | `/api/users/*`, `/api/user-import/*`                            |

### 1.3 Master data (admin; semua memakai AdminRouteGuard + DataTable + ConfirmDialog + modal buatan sendiri)

`academic-years` (376, aksi aktifkan), `subjects` (285), `rooms` (285), `classes` (284), `violations` (317, katalog poin), `teacher-additional-duties` (338), `employee-duties` (600, tugas + penugasan, dua modal), `period-settings` (572, periode + override per hari), `permission-settings` (467, flag BK/pimpinan).

### 1.4 Operasional akademik

| Route                              | Baris                           | Tujuan / alur                                                                                                                                                                                      |
| ---------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attendance`                       | 722                             | Dua mode: siswa melihat `StudentAttendanceCalendar`; guru membuka sesi per jadwal, menandai H/I/S/A/D, mencatat pelanggaran inline, menulis jurnal saat submit. Admin diarahkan keluar. WS teacher |
| `attendance-report`                | 369                             | Rekap harian guru/admin + detail per mapel, ekspor XLSX di klien. CSS 1.290 baris diimpor global                                                                                                   |
| `schedules`                        | 700                             | Grid jadwal periode x kelas. Siswa: kolom kelasnya; guru: "Jadwal Saya" dengan tambah mandiri dibatasi deadline; admin: grid penuh + hapus semua                                                   |
| `teacher-subject-assignments`      | 409                             | Guru-mapel-kelas bulk sync; glyph "✓" literal                                                                                                                                                      |
| `teacher-duty-assignments`         | 605                             | Penugasan tugas tambahan dengan scope sekolah/kelas; combobox downshift                                                                                                                            |
| `student-classes`                  | 762                             | Penempatan siswa ke kelas; import XLSX preview lalu commit                                                                                                                                         |
| `class-journals`                   | 132 (padat)                     | CRUD jurnal mengajar + unduh XLSX                                                                                                                                                                  |
| `teacher-substitutions`            | 331                             | Permintaan dan respons guru pengganti; realtime                                                                                                                                                    |
| `homeroom-class`                   | 75 (padat)                      | Daftar kelas binaan wali: tile status sebagai filter, pencarian debounce, pagination sendiri                                                                                                       |
| `grades`                           | 176 (satu baris 4.553 karakter) | Komponen penilaian, entri nilai, pemetaan TP, rentang rapor, publikasi, bintang kelas, XLSX                                                                                                        |
| `my-grades` (45) / `my-stars` (21) | Tampilan siswa read-only        |

### 1.5 Disiplin dan konseling

`violation-records` (507) guru mencatat pelanggaran, pencarian siswa downshift. `student-violations` (264) siswa melihat poin dan status SP; guru BK melihat pengaturan ambang SP di route yang sama. `violation-reports` (315) rekap per siswa, PDF/XLSX, terbitkan SP. `warning-letters` (157) kandidat SP1/SP2/SP3, terbitkan dan unduh. `counselings` (872) catatan kasus BK, foto bukti dengan cropper, modal detail, unduh laporan; satu-satunya file dengan `catch (err: any)`.

### 1.6 Alur izin dan QR (UX khas aplikasi)

- **QR guru** `components/TeacherQRModal.tsx` (246): token berputar tiap 30 detik, QR berisi `${origin}/classroom-entry?qr=<token>`, bunyi bip saat discan, berubah menjadi form review terlambat (pilih pelanggaran + laporan wali) saat siswa scan. Dibuka dari sidebar dan tab QR mobile.
- `classroom-entry` (141): siswa scan QR guru, menerima URL atau token mentah, menangani error izin kamera.
- `late-arrivals` (234): stepper 3 tahap guru piket, guru pengajar, wakil kepala sekolah; alasan; banner "telepon orang tua / pulangkan".
- `leave-requests` (717): halaman workflow terbesar; melayani siswa (ajukan), wali (review), BK (terbitkan). `?exit=1` mengubah menjadi mode dispensasi. Cropper foto surat, tiga modal, unduh PDF surat.
- `exit-permits/page.tsx` (24): merender `LeaveRequestsPage` sebagai alias.
- `exit-permits/[id]` (151): stepper persetujuan QR per tahap untuk siswa, lalu QR gerbang sekali pakai.
- `exit-permit-gate` (92): scanner kamera untuk keamanan; menerima deep link `?id&token`.
- `exit-permit-history` (93): log keamanan.
- `StudentScanModal`: pemilih izin masuk vs izin keluar di tab Scan mobile.

**PWA**: `public/sw.js` v19, precache `/offline`, network-first navigasi, cache-first `/_next/static`, SWR gambar (melewati `/uploads/private/`), handler push dan klik notifikasi. Didaftarkan hanya di produksi. Tombol install tersembunyi di dropdown notifikasi.

## 2. Komponen bersama (20 file, 3.309 baris)

| File                                                                                                                                 | Baris         | Tujuan                                                                                                                           | Dipakai             |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `AppSidebar.tsx`                                                                                                                     | 359           | Navigasi desktop 4 grup, state grup di localStorage, heartbeat presence 25 detik, gate modul penilaian, peluncur QR guru         | 39 halaman          |
| `AppHeader.tsx`                                                                                                                      | 337           | Topbar: reload, tema, dropdown notifikasi (poll 30 detik + WS), push on/off, install PWA, menu profil, logout                    | 39 halaman          |
| `AppMobileNav.tsx`                                                                                                                   | 383           | Tab bawah per peran + sheet "Lainnya" bergrup dan bisa dicari; deteksi keyboard via visualViewport                               | 39 halaman          |
| `DataTable.tsx`                                                                                                                      | 149           | Tabel generik: cari, ukuran halaman, pagination, kosong/loading, mode server-side; filter klien `JSON.stringify(row).includes()` | 20 halaman          |
| `ConfirmDialog.tsx`                                                                                                                  | 64            | Modal konfirmasi, `role="alertdialog"`                                                                                           | 21 halaman          |
| `AppBrand`, `AppFavicon`, `BootLoader`, `PageLoader`, `SessionExpiredModal`, `ImpersonationBanner`, `PWAProvider`, `AdminRouteGuard` | 30-60         | Branding, favicon dinamis, overlay transisi route, loader, sesi kedaluwarsa, banner impersonasi, SW, redirect admin sisi klien   | layout / 16 halaman |
| `StudentAttendanceCalendar.tsx`                                                                                                      | 316 + CSS 806 | Kalender bulanan, swipe, sheet detail hari via portal, focus trap                                                                | attendance          |
| `TeacherQRModal.tsx`                                                                                                                 | 246           | Lihat 1.6                                                                                                                        | sidebar, mobile nav |
| `UserImportModal.tsx`                                                                                                                | 179           | XLSX baca, validasi, preview, commit                                                                                             | users               |
| `StudentScanModal.tsx`                                                                                                               | 60            | Pemilih jenis izin                                                                                                               | mobile nav          |

### Pelanggaran aturan reuse

- Tidak ada `Modal` bersama: sekitar 24 halaman membuat `modal-backdrop` + `user-modal` sendiri.
- Modal sukses khusus per fitur dengan keluarga class CSS sendiri (attendance, violation-records, sp, announcement, leave-crop, counseling-crop).
- Tidak ada Toast: 35 halaman memakai `alert` inline di atas halaman.
- Tidak ada primitif Form/Field/Select: 183 `<label>` tetapi hanya 22 `htmlFor`.
- Tidak ada Button bersama: banyak class tombol lokal per halaman.
- Pagination dibuat ulang di `homeroom-class`.
- Cropper.js digandakan 4 kali (profile, settings, leave-requests, counselings).
- Sekitar 30 string loading "Memuat ..." berbeda.

## 3. `lib/`

### `lib/api.ts` (3.530 baris)

- Base URL kosong di dev; `next.config.ts` me-rewrite `/api/*` dan `/uploads/*` ke backend.
- Satu `request<T>` privat: JSON, `ApiError(message, status)`. Tanpa timeout, retry, abort.
- Token tidak dipegang klien: setiap dari 150 fungsi menerima `token` sebagai argumen pertama; pemanggil membaca `localStorage.sion_token` sendiri (106 kemunculan di 44 file).
- Deteksi sesi kedaluwarsa berdasarkan teks pesan 401 yang diawali "Sesi" (Bahasa Indonesia). Tanpa refresh token.
- Tiga cache promise ad-hoc (branding, general settings, user details) tanpa invalidasi.
- Auth WebSocket lewat subprotocol `["sion-v1", "sion-auth.<token>"]`.
- 8 implementasi unduh blob yang hampir identik.
- Sekitar 135 path endpoint berbeda.

### File lib lain

- `access.ts` (140): label peran, union 41 item menu, `canAccessMenuItem` dengan 28 cabang if yang mencampur role dan permission; dipakai untuk gate menu dan route sekaligus.
- `session-cache.ts`, `branding-cache.ts`: cermin localStorage.
- `impersonation.ts`: token asli di sessionStorage.
- `pwa.ts`: VAPID, enable/disable push, race 500 ms agar SW mati tidak menggantung logout.
- `realtime.ts`: WS reconnect dengan backoff; namun `AppHeader` dan `monitoring` mengimplementasikan ulang sendiri.
- `format.ts`: `Intl` terkunci `id-ID`.

### i18n

Tidak ada. Seluruh teks UI hardcoded Bahasa Indonesia; label hari, bulan, status, peran tersebar di 12+ file.

## 4. State dan pengambilan data

- Hanya `useState` (797) + `useEffect` (212). Tanpa SWR/React Query/Zustand/Context.
- Boilerplate per halaman diulang 39 kali: baca token, redirect, `getMe`, cek peran, cache user, muat data, `logout()` lokal (32 salinan).
- Tanpa cache lintas halaman; `getMe` dan `getModuleSettings` dipanggil dua kali per halaman (sidebar dan mobile nav).
- Loading: teks blocker; tanpa skeleton. Error: string lokal ke `alert`. Tidak ada `error.tsx`, `global-error.tsx`, `not-found.tsx`.
- Optimistic update hanya pada tandai notifikasi dibaca.
- Polling notifikasi 30 detik; 4 socket (presence, teacher, monitoring).
- Alur push: cek kemampuan, ambil konfigurasi, minta izin, subscribe, simpan; resubscribe diam-diam setiap mount header; unsubscribe saat logout.

## 5. Styling

- `globals.css` 11.157 baris, sekitar 1.788 selector, 809 referensi `--sion-*`, 42 media query, 90 override tema gelap; berisi gaya semua halaman.
- `attendance-report.css` 1.290 baris diimpor global untuk satu halaman; 8 file CSS per halaman lain bocor ke cascade global.
- Hanya 4 CSS Module.
- Token: 10 variabel warna semantik; tanpa skala spacing, radius, tipografi, elevasi, z-index.
- Tabler hanya dipakai untuk `btn`, `alert`, `card`, `form-control`; tampilan sebenarnya CSS bespoke.
- Tema gelap via atribut `data-bs-theme` yang diset skrip inline blocking.
- Ikon `@tabler/icons-react`; dashboard mengimpor 37 ikon.
- Dua glyph "✓" literal di UI; tidak ada emoji piktografik.

## 6. Hal spesifik sekolah yang hardcoded

| Item                                                          | Lokasi                                                                               | Dampak white-label                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `app_subtitle: "Pecalang"`                                    | `lib/api.ts:812`                                                                     | Tagline default semua tenant                               |
| Literal "SION"                                                | layout, manifest, sw.js, PageLoader, monitoring, offline, login, ImpersonationBanner | Nama di metadata, judul push, manifest tidak ikut branding |
| "Sistem Informasi Operasional Sekolah"                        | layout, manifest, offline, monitoring                                                | sama                                                       |
| Ikon `public/icons/*` statis                                  | manifest, sw.js                                                                      | Ikon per tenant butuh rebuild                              |
| Nama guru demo nyata dan kelas X A..XII F                     | `monitoring/page.tsx:43-45`                                                          | Nama orang nyata di kode produksi                          |
| Konvensi X/XI/XII, NIS, NISN, NIP, NUPTK                      | UserImportModal, homeroom-class                                                      | Terikat struktur SMA Indonesia                             |
| Label penilaian KKTP, TP, Sumatif, Praktik, bintang           | grades, my-grades                                                                    | Spesifik Kurikulum Merdeka                                 |
| SP 1/2/3, Wakil Kepala Sekolah, Guru BK, Guru Piket, Pecalang | late-arrivals, permission-settings, teacher-duty-assignments, settings               | Peran terpatri di copy dan alur 3 tahap                    |
| Template surat default berbahasa Indonesia, aksen `#0f766e`   | `lib/api.ts:715-802`                                                                 | Dapat dikonfigurasi server, default lokal                  |
| Fallback avatar `i.pravatar.cc`                               | AppHeader, profile, CSP                                                              | Membocorkan username ke pihak ketiga                       |
| Cuaca open-meteo + bigdatacloud                               | dashboard                                                                            | Diblokir CSP sendiri                                       |
| `Intl("id-ID")`                                               | format.ts, dashboard, monitoring                                                     | Tidak dapat diubah                                         |

Sudah siap white-label lewat `/api/settings/general` dan `/branding`: nama app, subtitle, logo, favicon, template surat izin dan SP, kebijakan sesi/presensi/jadwal, modul penilaian on/off.

## 7. Masalah kualitas kode

File di atas 500 baris: `globals.css` 11.157; `lib/api.ts` 3.530; `attendance-report.css` 1.290; `users` 999; `counselings` 872; `violation-records.css` 880; `StudentAttendanceCalendar.module.css` 806; `student-classes` 762; `attendance` 722; `leave-requests.css` 721; `leave-requests` 717; `schedules` 700; `dashboard` 661; `profile` 646; `announcements` 611; `teacher-duty-assignments` 605; `employee-duties` 600; `settings` 576; `period-settings` 572; `violation-records` 507. Beberapa file pendek sebenarnya JSX satu baris (grades 4.553 karakter per baris).

Duplikasi: 39 salinan bootstrap auth, 32 `logout()`, 106 pembacaan token langsung, 24 modal, 8 pengunduh blob, 4 integrasi cropper, 2 reimplementasi realtime, dua registri menu paralel (sidebar dan mobile nav), `readCachedUser` ganda.

Tipe: umumnya baik; `any` hanya di counselings. Tipe API ditulis tangan, tidak digenerate dari backend.

Infrastruktur hilang: error boundary, ESLint (baseline), Prettier, test, CI.

Aksesibilitas: nol `next/link` (semua navigasi `button onClick router.push`), 28 `onClick` di `div`, label tanpa `htmlFor`, focus trap hanya di kalender, Escape hanya di mobile nav, tanpa skip-link.

Hidrasi: sidebar dan tab bar kosong di paint pertama lalu muncul (`mounted` gate); `suppressHydrationWarning` di html.

Keamanan: token di localStorage; "login biometrik" hanya teater sisi klien dengan token sesi plaintext di `localStorage.sion_biometric_token`; CSP inkonsisten dengan kode; deteksi 401 bergantung teks; `AdminRouteGuard` hanya kosmetik.

## 8. Penilaian UX

Pohon navigasi desktop: Dashboard, Pengumuman; grup Data Sekolah (9 item); Pengguna & Akses (2); Scan/History keluar (keamanan); Operasional (20 item tanpa sub-struktur); Pengaturan. Mobile: 5 tab per peran dengan aksi tengah terangkat (QR untuk guru, Scan untuk siswa) + sheet "Lainnya".

Yang bekerja baik: sheet menu dengan pencarian, aksi QR/Scan terangkat, tema gelap, PWA dengan push nyata, branding server-driven, DataTable server-side, stepper izin keluar dan terlambat jelas.

Yang terasa kikuk: tanpa onboarding; menu Operasional 20 item; label tidak konsisten antar sidebar/mobile/eyebrow; tiga status loading berurutan saat boot; refetch total setiap navigasi; install dan notifikasi tersembunyi; feedback error bar statis di atas halaman; widget cuaca gagal diam-diam; `?demo=36` publik dengan nama nyata; modal desktop dipakai di mobile.

## 9. Tambahan pada `sion-rebuild-go/frontend`

Sama 46 route + 29 route perpustakaan + 2 OPAC + 1 perpustakaan saya; 12 komponen baru; 14.921 baris baru.

Route staf perpustakaan `/library/*`: dashboard, catalog (+detail), items (+detail), members (+detail, surat bebas pustaka), member-types, circulation (meja pinjam dengan keranjang), returns, renewals, loans, bookings, class-loans (paket buku teks per kelas), violations (denda), stock-opname (+detail scan), visits, visit-scan, kiosk (QR berputar 55 detik), self-service (stasiun mandiri), labels (PDF label punggung), cards (PDF kartu), import, master-data (jenis bahan, DDC, koleksi, lokasi, mitra, sumber perolehan, aturan pinjam, libur), settings, reports, member. Siswa: `/my-library`, publik `/opac` dan `/opac/[id]`.

Komponen baru: `BibliographyForm`, `ItemForm`, `LibraryImportModal`, `LibraryCommandPalette` (Ctrl/Cmd-K), `QuickCopiesModal`, `QuickStartChecklist`, `ChartLine`, `ChartBar`, `MemberStatusBadge`; bersama: `BarcodeScanner` (BarcodeDetector + fallback zxing; QR/Code128/Code39/EAN-13), `ScanInput` (keyboard-wedge + kamera), `Avatar` (inisial deterministik).

API baru `lib/library-api.ts` (1.515 baris), sekitar 100 endpoint `/api/library/*`, `/api/my-library/*`, `/api/opac/*`, pencarian ISBN, import XLSX, 7 jenis laporan JSON+XLSX, PDF label/kartu, struk HTML, token kiosk, pengingat.

Perbaikan bersama yang layak dibawa: `i.pravatar.cc` diganti Avatar lokal; CSP diperbaiki; `output: standalone`; ESLint 9; `request<T>` diekspor; `ModuleSettings` dengan `library_enabled`; permission perpustakaan; `monitoring_display_token`; unduh bukti konseling terautentikasi; kualitas kode file baru lebih baik.

Yang belum diperbaiki: i18n, error boundary, token localStorage dan biometrik palsu, Modal/Toast bersama (`library.css` 1.911 baris), data-fetching library, boilerplate `getMe`, "SION" hardcoded di manifest/SW.
