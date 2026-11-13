# Audit saklar modul per sekolah (2026-11-13)

Tujuan: menilai seberapa siap `feature_flags` dipakai sebagai dasar paket
jualan per sekolah. Audit ini hanya membaca kode; tidak ada yang diuji
dengan mematikan modul di stack yang berjalan.

## Status tindak lanjut (2026-11-13, branch `claude/halo-ee8483`)

Bagian di bawah "Ringkasan" menggambarkan keadaan sebelum perbaikan.
Yang sudah dikerjakan dan lolos `go test ./...` penuh, `pnpm typecheck`,
`pnpm lint`, `pnpm test`, dan `pnpm openapi:check`:

- Gate HTTP terpusat (`internal/platform/modulegate`) untuk semua operasi
  12 modul, satu error 403 `MODULE_DISABLED`, cache flag 15 detik.
- `Me.disabled_modules`; menu, guard halaman, dan bagian opsional di web
  mengikuti flag.
- CLI `cmd/modules` (`list`, `enable`, `disable`) untuk mode single-tenant.
- Job terjadwal dan panggilan antar modul melewati modul mati; audit log
  `feature_flag.update` untuk perubahan dari konsol dan CLI.

- Kasus tepi: jenis laporan mengikuti modul sumbernya (403, bukan 500);
  halaman gabungan (`/reports`, `/scan`, kotak masuk, templat dokumen)
  terbuka selama ada bagian yang menyala; OPAC publik menampilkan halaman
  tidak tersedia lewat `TenantBranding.disabled_public_modules`; angka
  modul mati disembunyikan di analitik dan dasbor; keterlambatan tidak
  lagi memblokir presensi saat izin mati; pengumuman terjadwal yang
  terlewat kembali ke draf dengan tanda "Jadwal terlewat".

Dicek di browser pada stack dev dengan enam modul dimatikan, akun admin,
guru, dan siswa: menu, dasbor, `/reports`, `/scan`, `/opac`, pengaturan
templat, dan wali kelas tanpa respons 403.

Belum dikerjakan:

- Aplikasi mobile (ditunda atas keputusan pemilik produk: web dulu).
- Paket sebagai preset flag.
- Label kelas di header profil siswa hilang saat mentoring mati (sumber
  datanya snapshot mentoring).
- Baris "Nilai dan rapor" di panel login tetap tampil saat penilaian mati.
- Endpoint jenis event webhook belum disaring di server (web menyaring).
- Tanda "Jadwal terlewat" juga muncul pada draf yang disimpan dengan
  tanggal mulai lampau.

## Ringkasan

Fondasi data dan konsol sudah ada, tetapi saklarnya belum bisa dijual:

- 5 dari 12 modul terdaftar tidak dijaga sama sekali di API.
- 3 modul yang dijaga masih punya endpoint baca yang lolos.
- Web tidak pernah tahu modul mana yang mati, jadi menu tetap tampil.
- Saklar tidak bisa diubah di deployment sekarang (mode single-tenant).

## Yang sudah ada

- Tabel `feature_flags (tenant_id, module, enabled, config)` dengan RLS,
  sejak `migrations/0001_platform_core.up.sql`. Kolom `config` belum dipakai.
- Daftar 12 modul di `modules/platform/domain/platform.go` (`AllModules`).
- Semantik opt-out: modul tanpa baris dianggap menyala.
- Konsol platform: `GET/PUT /v1/platform/tenants/{tenantId}/flags[/{module}]`
  dan panel saklar di `features/platform/components/tenant-detail-panel.tsx`.
- Titik penegakan tunggal `platform/service.IsModuleEnabled`, dipakai lewat
  adapter di `internal/wiring`.

## Penegakan di API per modul

Metode: setiap method publik `*Service` diperiksa apakah memanggil gate
(`requireEnabled`, `assertEnabled`, `guard`), langsung atau lewat helper.
Daftar celah di bawah berasal dari pemindaian otomatis lalu dicek contoh
per modul; perlu dikonfirmasi ulang satu per satu saat memperbaiki.

| Modul            | Status       | Catatan                                                                                                                                      |
| ---------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| billing          | Penuh        | Semua method lewat `guard`.                                                                                                                  |
| visitors         | Penuh        | Rekap dijaga lewat helper `recap`.                                                                                                           |
| grading          | Penuh        | Sisa yang tidak dijaga hanya helper (`PreviousTerm`, setter).                                                                                |
| staff_attendance | Hampir penuh | `GetMonthlyRecap` dan dua ekspor rekap perlu dicek.                                                                                          |
| library          | Sebagian     | Sekitar 35 method tanpa gate: anggota, tipe anggota, aturan pinjam, riwayat, kunjungan, pelanggaran, semua ekspor XLSX, laporan bulanan PDF. |
| mentoring        | Sebagian     | Baca grup, anggota, dan ringkasan term tidak dijaga.                                                                                         |
| supervision      | Sebagian     | Baca siklus, observasi, dan laporan guru (termasuk ekspor) tidak dijaga.                                                                     |
| discipline       | Tidak ada    | Tidak ada pengecekan flag sama sekali.                                                                                                       |
| permits          | Tidak ada    | Sama.                                                                                                                                        |
| announcements    | Tidak ada    | Sama.                                                                                                                                        |
| reports          | Tidak ada    | Sama.                                                                                                                                        |
| activities       | Tidak ada    | Migrasi 0069 menyebut flag `activities`, tetapi kode tidak membacanya.                                                                       |

Modul di luar daftar (academic, attendance, scheduling, school, identity,
inbox, notifications, analytics, integrations) tidak bisa dimatikan.

### Ketidakkonsistenan

- Kode error dan status HTTP berbeda-beda: 404 untuk library, grading,
  billing, staff_attendance; 403 untuk visitors, mentoring, supervision.
  Kode error juga per modul (`LIBRARY_MODULE_DISABLED`, `MODULE_DISABLED`,
  dan seterusnya), sehingga klien tidak bisa menanganinya secara umum.
- `staffattendance` membaca tabel `feature_flags` langsung lewat SQL
  sendiri, modul lain lewat adapter platform.
- Gate ditulis manual per method, itulah sumber celah di atas. Tidak ada
  middleware per kelompok route.
- `IsModuleEnabled` membuka transaksi dan membaca semua flag tenant pada
  setiap panggilan, tanpa cache.
- Job latar belakang lintas tenant (pengingat jatuh tempo, kedaluwarsa
  reservasi perpustakaan) tidak terlihat melewati tenant yang modulnya mati.
- `SetFlag` tidak menulis audit log.

## Web

- Navigasi (`lib/navigation*.ts`) hanya disaring berdasarkan permission.
  Tidak ada satu pun yang membaca flag.
- Tidak ada endpoint untuk tenant yang mengembalikan modul aktif; flag
  hanya bisa dibaca lewat `/v1/platform/...` milik operator platform.
- Akibatnya modul yang dimatikan tetap muncul di menu, lalu halaman
  menampilkan pesan error dari API. Entri menu yang terdampak: library 18,
  visitors 4, discipline 3, activities 3, mentoring 2, supervision 2, serta
  grading, announcements, reports, staff-attendance, billing masing-masing 1.
  Belum dihitung: widget dasbor, pintasan, dan tautan silang antar halaman.
- Pesan error modul nonaktif sudah diterjemahkan di
  `lib/i18n/api-error-message.ts`, jadi tampilannya tidak rusak, hanya
  membingungkan.

## Mobile

`apps/mobile` tidak mengandung penanganan flag maupun kode error modul
nonaktif.

## Konsol dan mode tenant

- `ListFlags` dan `SetFlag` ditolak oleh `guard()` saat
  `TENANCY_MODE=single`, yaitu mode dev dan VPS saat ini. `IsModuleEnabled`
  tetap berlaku di mode itu, jadi flag ditegakkan tetapi hanya bisa diubah
  lewat SQL.
- Belum ada konsep paket. `docs/02-system-design.md` menyebut "paket modul"
  saat membuat tenant, belum diimplementasikan.

## Urutan perbaikan yang disarankan

1. Satu middleware gate per kelompok route modul, satu kode error
   (`MODULE_DISABLED`, satu status), ganti gate manual. Ini sekaligus
   menutup lima modul kosong dan celah di tiga modul sebagian.
2. Endpoint modul aktif untuk tenant (atau sisipkan di respons sesi), lalu
   saring navigasi, dasbor, dan guard halaman di web dan mobile.
3. Lewati tenant yang modulnya mati di job latar belakang; cache flag
   per tenant; audit log untuk `SetFlag`.
4. Jalur mengubah flag di mode single-tenant (CLI atau halaman operator).
5. Paket sebagai preset flag, dengan aturan ketergantungan antar modul
   (misalnya reports terhadap grading dan discipline).
