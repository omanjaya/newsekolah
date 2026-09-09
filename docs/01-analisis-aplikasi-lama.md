# 01. Analisis Aplikasi Lama (SION)

Ringkasan eksekutif dari tiga lampiran rinci: [Lampiran A frontend](analysis/frontend-inventory.md), [Lampiran B database dan PRD](analysis/database-inventory.md), [Lampiran C backend](analysis/backend-inventory.md). Lampiran adalah sumber kebenaran untuk setiap logika dan fitur yang harus dibangun ulang.

## 1. Apa yang dianalisis

| Sumber | Isi | Lokasi |
|---|---|---|
| `arimartana/sion` (GitHub, snapshot 16 Agustus 2026) | Go 19.849 baris (53 file), Next.js 22.930 baris (94 file), 42 migrasi MySQL | `reference/sion` |
| `omanjaya/sion` lokal (7 September 2026) | Sama + modul perpustakaan (12.900 baris Go, 29 halaman), refresh token, APNs, rate limit, perbaikan keamanan, 45 migrasi | `reference/sion-rebuild-go` |
| `PRD-rebuild-go-nextjs.json` | PRD paritas dari aplikasi Laravel "Pecalang" (481 route, 23 modul, 15 persona) | kedua folder |
| `nouschool` | Klien iOS SwiftUI untuk API SION (referensi UX mobile) | `/Users/omanjaya/project/nouschool` |

## 2. Fitur yang ada dan harus dipertahankan

| Domain | Fitur | Aturan bisnis inti |
|---|---|---|
| Identitas dan akses | Login, multi-role dengan role utama, role kustom, matriks permission, impersonasi beraudit, import pengguna Excel 33 kolom, arsip/pulihkan, reset password, profil dan avatar | 5 role sistem; permission wali kelas/BK/keamanan diturunkan dari tugas tambahan, bukan role |
| Sekolah dan tahun ajaran | Tahun ajaran + semester, satu aktif, keanggotaan user per tahun, branding (nama, logo, favicon, kop), template surat, kebijakan sesi/presensi/jadwal, flag modul | Semua data operasional ber-scope tahun aktif; error bila tidak ada tahun aktif |
| Master data | Mapel, ruang, kelas, jam pelajaran dengan override per hari (Jumat pendek), katalog pelanggaran berpoin, tugas tambahan guru dengan kemampuan, tugas pegawai, penugasan mengajar guru-mapel-kelas, penempatan siswa ke kelas (+import) | Unik per tahun; hari aktif sekolah dapat diatur |
| Jadwal | Grid periode x kelas, guru mengisi jadwal sendiri sampai deadline, deteksi bentrok kelas dan guru, penggabungan jam kontinu, guru pengganti (minta, terima, tolak) | Guru harus punya penugasan mapel-kelas; pengganti accepted mendapat akses presensi dan jurnal |
| Presensi | Sesi per jadwal per tanggal, status H/S/I/D/A, default hadir, status sebelumnya, pelanggaran inline, jurnal wajib saat submit, jendela koreksi, kalender siswa dengan detail per sesi, kelas binaan wali, laporan harian, layar monitor real-time | Surat izin resmi menimpa input guru; siswa dalam proses terlambat dilewati; koreksi sampai tanggal + N hari |
| Izin dan QR | QR guru berputar 30 detik untuk masuk kelas; izin keluar 4 tahap via scan QR guru berbeda lalu QR gerbang untuk satpam; terlambat 3 tahap dengan aksi otomatis (telepon orang tua, pulangkan); izin terencana 2 tahap dengan bukti foto, surat bernomor, verifikasi publik; riwayat gerbang | Satu izin keluar per hari; token hash dan sekali pakai; sinkron ke presensi saat surat terbit |
| Disiplin dan BK | Catat pelanggaran berpoin, ambang SP1/2/3 per tahun, kandidat SP, penerbitan SP idempoten bernomor dengan snapshot dan DOCX, laporan rekap/individu, catatan konseling per jenis dengan bukti foto dan laporan cetak | SP hanya bila poin cukup; nomor dari template dengan bulan Romawi |
| Penilaian | Komponen berbobot (TP, sumatif, praktik), KKTP, entri nilai, publikasi per mapel, analisis rapor dengan kenaikan otomatis berdasarkan rentang, override manual, pemetaan TP ke e-Rapor dengan T/R, ekspor XLSX, bintang kelas (tambah/kurang LIFO) | Modul dapat dimatikan; skala 0-100 |
| Komunikasi | Pengumuman global/terpilih dengan hitung baca, kotak notifikasi, Web Push VAPID, realtime WebSocket (notifikasi, scan, presence), dashboard per peran, PWA offline | Outbox dengan retry |
| Perpustakaan (versi lokal) | Katalog bibliografi + MARC, eksemplar dengan barcode dan label, anggota dan kartu, sirkulasi berbasis scan, perpanjangan, booking, denda, opname, kunjungan dan kiosk, laporan, OPAC publik, pinjaman saya, paket buku per kelas, mode mandiri | Mengikuti INLISLite v3; satu pinjaman aktif per eksemplar dijamin skema |

## 3. Kekuatan yang dibawa ke desain baru

- Model domain sekolah sudah teruji di lapangan: scope tahun ajaran, permission turunan tugas, alur QR bertahap, sinkron surat izin ke presensi, snapshot dokumen.
- Pola token sekali pakai berbasis hash; versi perpustakaan sudah menambahkan `purpose`.
- Kolom generated untuk "satu pinjaman aktif per eksemplar".
- DataTable server-side sebagai aturan tim; sheet menu mobile dengan aksi QR terangkat; branding server-driven.
- Versi lokal sudah punya refresh token, rate limit, kode error stabil, APNs, dan penanganan uploads privat.

## 4. Masalah yang memaksa rebuild, bukan refactor

| Kategori | Bukti utama | Dampak |
|---|---|---|
| Tidak multi-tenant | Nol `tenant_id`; `app_settings` singleton; `username`/`email` unik global; `roles.id` natural key; ID seed hardcoded; uploads satu namespace; channel Redis `sion:*` | Satu deploy per sekolah; tidak ada jalan ke SaaS tanpa mengubah semua tabel |
| Tanpa lapisan | `package main` 17-33 ribu baris; 300+ SQL inline; otorisasi `user.Role ==` di 140 route; tiga algoritma status harian; DOCX dirakit 4 kali | Tidak dapat diuji, setiap fitur baru menambah duplikasi |
| Keamanan | Master data tanpa permission (siswa bisa menghapus tahun ajaran); uploads privat publik dengan listing; monitoring publik; JWT 365 hari di localStorage; logout tidak mencabut; token biometrik palsu; secret default | Tidak layak produksi multi-sekolah |
| Hardcoded sekolah | 39 asumsi di backend (SP 3 level, terlambat ke-2/5 dan ke-3/6, alur 4/3/2 tahap dalam enum, H/S/I/D/A, 0-100, Kurikulum Merdeka, 5 role fixed) dan 12 di frontend (nama SION/Pecalang, nama guru nyata di kode, `id-ID`, ikon statis) | Sekolah lain harus mengubah kode dan skema |
| Frontend | 39 salinan bootstrap auth, 24 modal buatan sendiri, 35 alert inline, `globals.css` 11 ribu baris, `api.ts` 3.500 baris tulisan tangan, tanpa i18n, tanpa error boundary, tanpa link nyata, tanpa test | Biaya perubahan tinggi; tidak bisa dibagi ke mobile |
| Skema | 81 tabel dengan 3 konvensi unique, FK hilang di 12 tabel, cascade dari tahun ajaran menghapus seluruh riwayat, campuran TIMESTAMP/DATETIME, trigger memaksa `--skip-log-bin`, migrasi ganda dan tanpa down | Kehilangan data satu klik; tidak ada PITR |
| Bug | Notifikasi SP ke BK tidak pernah terkirim; expected = submitted di kelas binaan; terlambat menggantung memblokir presensi; race token; nomor surat COUNT+1; izin keluar 2 jam menandai seharian D; metrik dashboard fiktif | Data yang dilaporkan ke sekolah salah |

## 5. Kesenjangan terhadap PRD

Modul PRD yang belum ada: kunjungan tamu dan keamanan kampus, chat konsultasi, guru wali (mentoring), diagnostik (VARK, minat), supervisi, LMS, kontribusi, koperasi/POS (15 entitas), SNPMB, kalender kegiatan, backup dan integrasi (WhatsApp, Telegram, MinIO), pengumuman kaya (HTML, jadwal, ticker), permintaan perubahan presensi bertoken, transfer kelas massal. Delapan job terjadwal PRD: nol yang terimplementasi. Keputusan modul mana yang masuk rebuild ada di [12-roadmap.md](12-roadmap.md).

## 6. Keputusan yang diambil untuk rebuild

1. Bangun ulang dari nol dengan monorepo baru; kode lama hanya referensi logika (dibaca, tidak dimigrasi).
2. PostgreSQL dengan RLS dan `tenant_id` di setiap tabel; `academic_year_id` sebagai scope kedua.
3. Satu sistem otorisasi: role per tenant + penugasan ber-scope yang membawa permission (menggantikan boolean `grants_*`).
4. Workflow (izin keluar, terlambat, izin terencana) sebagai definisi tahap yang dapat dikonfigurasi per sekolah, dengan tahap default sama seperti sekarang.
5. Aturan yang sekarang hardcoded menjadi pengaturan bertipe per sekolah: jumlah level SP dan ambang, aksi terlambat per hitungan, status presensi dan warnanya, skala nilai, jenis penilaian, semester/termin, hari aktif, kategori izin, format nomor dokumen.
6. Kontrak OpenAPI dulu; web dan mobile memakai SDK yang digenerate.
7. Bahasa Indonesia default lewat i18n, bukan hardcoded.
8. Semua fitur di bagian 2 dipertahankan; fitur di [11-feature-recommendations.md](11-feature-recommendations.md) ditambahkan bertahap.
