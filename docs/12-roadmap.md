# 12. Roadmap dan Rencana Kerja

Estimasi untuk satu pengembang penuh waktu dengan bantuan agen kode (implementasi memakai model Sonnet sesuai preferensi). Angka minggu adalah perkiraan kerja fokus, bukan janji kalender.

## Fase 0. Fondasi (3 minggu)

- Monorepo, tooling (pnpm, Turbo, golangci-lint, ESLint, Prettier, commitlint), CI dasar, Docker Compose dev.
- Skema inti Postgres (tenant, identitas, akses, tahun ajaran, kelas, enrollment) + RLS + migrasi + seed contoh.
- API: config fail-fast, router, tenant resolver, auth (Argon2id, access + refresh rotasi, sesi, rate limit), authz (role + duty + scope), error format, OpenAPI skeleton + codegen, River, S3, telemetry.
- Web: shell aplikasi, sesi, i18n, tema, token, primitif `packages/ui` inti (Button, Form, Dialog, Sheet, Toast, DataTable, EmptyState, Skeleton), Storybook.
- Mobile: proyek Expo, login, pemilihan sekolah, SecureStore, navigasi per peran (layar kosong).
- Keluaran: login di web dan mobile, admin membuat kelas dan pengguna, isolasi tenant teruji.

## Fase 1. Paritas operasional inti (6 minggu)

- Master data lengkap, penugasan mengajar, duty, jadwal dengan exclusion constraint, guru pengganti.
- Presensi guru (web + mobile, offline), kalender siswa, kelas binaan, laporan, monitor bertoken; satu algoritma status harian.
- Workflow engine + tiga workflow dengan definisi default; QR guru berpurpose; gerbang; penutupan otomatis; surat izin PDF + verifikasi.
- Notifikasi in-app + Web Push + APNs + FCM, preferensi.
- Import pengguna dan siswa-kelas (server-side).
- Keluaran: sekolah pertama bisa pindah dari SION untuk presensi dan perizinan.

## Fase 2. Kesiswaan, penilaian, komunikasi (4 minggu)

- Pelanggaran, level SP berpolicy, penerbitan SP, laporan; konseling terenkripsi.
- Penilaian lengkap + analisis rapor + ekspor e-Rapor + bintang.
- Pengumuman kaya (HTML, jadwal, target per kelas/peran, tanda baca).
- Pusat laporan v1 (ekspor terjadwal), template dokumen dengan editor.
- Audit log UI, sesi dan perangkat, 2FA admin.

## Fase 3. Multi-sekolah dan onboarding (3 minggu)

- Konsol platform: buat tenant, domain kustom, flag modul, kesehatan, ekspor/offboarding.
- Wizard onboarding sekolah, import Dapodik, template jenjang (SD/SMP/SMA/SMK), data contoh.
- Kalender akademik, tahun ajaran baru dan kenaikan kelas massal.
- ETL dari MySQL SION untuk sekolah yang sudah ada.
- Keluaran: sekolah kedua dan ketiga onboard tanpa bantuan developer.

## Fase 4. Perpustakaan dan mobile v1 rilis store (5 minggu)

- Modul perpustakaan (porting logika versi lokal ke lapisan baru), scanner bersama, label dan kartu PDF, OPAC, kiosk.
- Mobile: seluruh alur siswa, guru, piket, satpam, pustakawan; offline presensi dan opname; TestFlight dan internal testing; rilis App Store dan Play Store.

## Fase 5. Orang tua, WhatsApp, integrasi (4 minggu)

- Role orang tua (web + mobile), persetujuan izin, ringkasan harian.
- Adapter WhatsApp Business API dan email; template pesan; log pengiriman.
- SSO Google Workspace; API publik + webhook; passkey di web.
- Analitik peringatan dini v1.

## Fase 6 dan seterusnya (dipilih per permintaan sekolah)

Modul PRD yang belum dibangun, diurutkan menurut permintaan yang paling mungkin: kalender kegiatan dan ekstrakurikuler, absensi pegawai, SPP dan pembayaran, kunjungan tamu dan keamanan kampus, guru wali (mentoring), supervisi, diagnostik, LMS ringan, koperasi/POS (bounded context terpisah), SNPMB, chat konsultasi. Setiap modul masuk sebagai feature flag.

## Definisi selesai per fase

- Test: unit domain, integrasi API dengan Postgres nyata (testcontainers), matriks otorisasi, isolasi tenant, E2E Playwright untuk alur utama, Maestro untuk mobile.
- Dokumentasi: OpenAPI terbarui, changelog, panduan pengguna singkat per fitur.
- Keamanan: `security-review` pada PR sensitif, tidak ada operasi tanpa `x-permission`, header lolos.
- Desain: review desain untuk halaman baru, cek kontras, tidak ada emoji.

## Risiko dan mitigasi

| Risiko                               | Mitigasi                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Scope besar untuk satu orang         | Fase 1 dulu sampai satu sekolah pindah; fitur lain menunggu                                               |
| Workflow terkonfigurasi terlalu umum | Definisi default identik SION; UI konfigurasi baru dibuat di Fase 3 setelah kebutuhan sekolah kedua jelas |
| Migrasi data lama gagal sebagian     | ETL idempoten dengan laporan selisih; jalankan paralel (SION tetap hidup) dua minggu                      |
| Review App Store                     | Aplikasi native penuh (bukan wrapper), kebijakan privasi, akun demo untuk reviewer                        |
| Ketergantungan WhatsApp resmi mahal  | Adapter agar sekolah memilih gateway; email dan push sebagai default                                      |
| Kinerja RLS                          | Index `(tenant_id, ...)`, `SET LOCAL`, uji beban 500 tenant sintetis di Fase 3                            |

## Keputusan pemilik produk (9 September 2026)

| Topik                                | Keputusan                                                     | Konsekuensi teknis                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model bisnis                         | Bukan SaaS dulu; satu sekolah per instalasi, tetapi siap SaaS | `TENANCY_MODE=single` default; skema tetap `tenant_id` + RLS; konsol platform ditunda ke Fase 3 tetapi tidak ada keputusan desain yang menutup jalan ke multi                                                    |
| WhatsApp                             | Disiapkan                                                     | Antarmuka `notify.WhatsAppSender` dengan provider `noop` default; adapter Meta Cloud API dan gateway lokal ditambahkan saat dibutuhkan                                                                           |
| Aplikasi SwiftUI `nouschool`         | Ditunda, tetap disiapkan                                      | Kontrak API sama (bearer, refresh token di body untuk `client: ios`, kode error stabil); tidak ada perubahan yang memutus klien native                                                                           |
| Nama produk                          | Sementara tetap **SION**; kandidat lain di bawah untuk nanti  | Kode memakai nama netral `newsekolah`; "SION" hanya muncul sebagai default branding platform (`platform_settings.product_name`) dan nama aplikasi mobile/web, sehingga ganti nama = ubah satu setting + nama app |
| Sekolah pilot, jenjang rilis pertama | Belum diputuskan                                              | Asumsi SMA dulu; template jenjang lain menyusul                                                                                                                                                                  |

### Kandidat nama produk

| Nama      | Arti dan alasan                                                            | Catatan                                         |
| --------- | -------------------------------------------------------------------------- | ----------------------------------------------- |
| Wiyata    | Sanskerta/Jawa: pendidikan, pengajaran; pendek, mudah dieja, netral daerah | Cek ketersediaan `wiyata.id` dan merek          |
| Widya     | Pengetahuan; hangat dan formal                                             | Dipakai beberapa yayasan, cek merek             |
| Aksara    | Huruf, ilmu tulis; modern dan mudah diingat                                | Ada produk lain bernama serupa di ranah berbeda |
| Lentera   | Penerang; cocok untuk citra sekolah yang membimbing                        | Agak generik                                    |
| NouSchool | Konsisten dengan brand Nouma dan bundle iOS yang sudah ada                 | Terdengar asing untuk sekolah negeri            |
| Sekolahku | Langsung dan jelas                                                         | Sulit dibedakan, kemungkinan sudah dipakai      |

Rekomendasi bila nanti diganti: Wiyata (utama) atau NouSchool bila ingin satu payung merek dengan Nouma.

## Status implementasi (10 September 2026)

Dikerjakan di luar urutan fase karena saling bergantung; yang sudah berjalan
ujung ke ujung di lingkungan pengembangan:

| Bagian                                             | Status                                                                                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Fase 0 fondasi                                     | Selesai                                                                                                                                   |
| Identitas, peran, tugas tambahan, audit            | Selesai, termasuk 2FA TOTP dan kode pemulihan                                                                                             |
| Akademik, jadwal, guru pengganti                   | Selesai                                                                                                                                   |
| Presensi guru dan kalender siswa                   | Selesai                                                                                                                                   |
| Perizinan (izin keluar, terlambat, izin terencana) | Selesai, surat PDF bernomor dengan verifikasi publik                                                                                      |
| Notifikasi dan pengumuman                          | Selesai, kanal in-app, push, email, WhatsApp                                                                                              |
| Kesiswaan (pelanggaran, SP, konseling)             | Selesai, konseling terenkripsi AES-GCM                                                                                                    |
| Penilaian (komponen, rapor, publikasi, bintang)    | Selesai                                                                                                                                   |
| Pusat laporan (ekspor XLSX)                        | Selesai, termasuk ekspor terjadwal lewat surel                                                                                            |
| Onboarding: checklist, profil, wizard, Dapodik     | Selesai, termasuk template jenjang dan data contoh                                                                                        |
| Orang tua: tautan anak dan tampilan per anak       | Selesai di web dan mobile                                                                                                                 |
| Perpustakaan                                       | Backend setara SION sejak 12 September 2026, layar anggota, denda, import, dan kunjungan sedang dibangun; lihat `docs/15-paritas-sion.md` |
| Konsol platform multi-sekolah                      | Selesai, aktif hanya pada mode multi-tenant                                                                                               |
| Kalender akademik, tahun ajaran baru, kenaikan     | Selesai; salin jadwal antar tahun belum                                                                                                   |
| ETL dari MySQL SION                                | Selesai, idempoten dengan laporan selisih                                                                                                 |
| Rilis store iOS dan Android                        | Disiapkan; belum diunggah ke store                                                                                                        |
| Mobile: alur per peran dan presensi offline        | Selesai; layar jadwal siswa belum ada endpoint                                                                                            |
| SSO Google Workspace dan passkey                   | Selesai di web                                                                                                                            |
| API publik: kunci API dan webhook                  | Selesai, lihat `docs/14-public-api.md`                                                                                                    |
| WhatsApp: Meta Cloud API dan gateway lokal         | Selesai, dengan template dan log pengiriman                                                                                               |

Lingkungan pengembangan berjalan penuh lewat `pnpm dev:docker` dengan hot
reload untuk API dan web; lihat `infra/docker/README.dev.md`.

Status "Selesai" di tabel atas ditulis sebelum logika dibandingkan baris per
baris dengan SION. Perbandingan itu menemukan celah di hampir semua modul, yang
sudah ditutup di backend. Posisi terkini, termasuk layar yang belum dibangun,
ada di `docs/15-paritas-sion.md`.

## Backlog teknis (ditemukan saat implementasi)

- `@newsekolah/api-client`: `createApiClient` menerima `baseUrl`/`tenantSlug` sebagai nilai tetap; ubah menjadi getter agar mobile tidak perlu membangun ulang klien saat ganti sekolah/server.
- `@newsekolah/ui-tokens`: `dist/tokens.ts` masih TypeScript mentah; terbitkan juga `dist/tokens.js` + `.d.ts` agar bisa di-`require` dari konfigurasi Tailwind tanpa transpiler.
- ~~`apps/api/cmd/seed`: belum idempoten~~ selesai: seed sekarang upsert dan mengisi data operasional (jadwal, presensi, katalog pelanggaran, komponen penilaian, tautan orang tua).
- `apps/web`: unggah bukti izin dan berkas lain memakai presigned URL; indikator progres baru ada pada unggah Dapodik, belum pada unggah lain.
- ETL dari MySQL SION (`apps/api/cmd/etl`, `docs/13-etl-sion.md`) selesai: identitas, akademik, jadwal, presensi, disiplin, dan izin yang sudah terbit. Exit permit, late arrival, dan permohonan izin yang belum final sengaja tidak dimigrasikan (lihat dokumen).
- Presensi masih membaca hari sekolah lewat query lintas modulnya sendiri; ganti ke pembaca kalender akademik yang sudah tersedia.
- Mobile belum punya layar jadwal siswa: tidak ada endpoint yang memetakan siswa ke kelasnya sendiri.
- ~~Label perpustakaan tercetak sebagai PDF teks~~ selesai: label eksemplar kini dicetak batch dengan barcode Code 128. Kartu anggota masih mencetak nomor anggota sebagai teks tanpa barcode gambar.
- Modul lain masih mengirim WhatsApp sebagai teks bebas lewat template bawaan, belum memilih template tertentu.
- Login passkey masih meminta nama pengguna lebih dulu; login tanpa nama pengguna belum ada.
- Menyalin jadwal saat membuka tahun ajaran baru menunggu modul penjadwalan mengekspos operasi salin.
- Binari worker mandiri belum mendaftarkan pekerjaan laporan terjadwal karena merender laporan butuh seluruh tumpukan layanan presensi, kesiswaan, penilaian, dan perizinan.
- Domain kustom pada konsol platform dicatat tanpa verifikasi kepemilikan.
- Import Dapodik belum memindahkan siswa antar rombel saat pembaruan, dan pencocokan rombel ke jenjang jatuh ke jenjang pertama bila awalan kode tidak terbaca.
- Badan permintaan yang kehilangan field wajib menghasilkan 500, bukan 400: server strict oapi-codegen tidak memvalidasi skema permintaan. Pasang middleware validator permintaan.
