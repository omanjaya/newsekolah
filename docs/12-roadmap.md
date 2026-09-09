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
- Desain: Delivery Gate antislop untuk halaman baru, cek kontras, tidak ada emoji.

## Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Scope besar untuk satu orang | Fase 1 dulu sampai satu sekolah pindah; fitur lain menunggu |
| Workflow terkonfigurasi terlalu umum | Definisi default identik SION; UI konfigurasi baru dibuat di Fase 3 setelah kebutuhan sekolah kedua jelas |
| Migrasi data lama gagal sebagian | ETL idempoten dengan laporan selisih; jalankan paralel (SION tetap hidup) dua minggu |
| Review App Store | Aplikasi native penuh (bukan wrapper), kebijakan privasi, akun demo untuk reviewer |
| Ketergantungan WhatsApp resmi mahal | Adapter agar sekolah memilih gateway; email dan push sebagai default |
| Kinerja RLS | Index `(tenant_id, ...)`, `SET LOCAL`, uji beban 500 tenant sintetis di Fase 3 |

## Keputusan yang masih perlu dari pemilik produk

1. Nama produk dan domain SaaS (`*.nouschool.id`?).
2. Model bisnis: SaaS per siswa per tahun, lisensi self-host, atau keduanya (memengaruhi konsol platform dan billing).
3. Sekolah pilot pertama dan tanggal target pindah dari SION.
4. Penyedia WhatsApp (resmi Meta via BSP, atau gateway lokal).
5. Apakah aplikasi SwiftUI `nouschool` dihentikan setelah Expo v1 rilis.
6. Jenjang yang didukung di rilis pertama (SMA saja, atau SD/SMP juga).
