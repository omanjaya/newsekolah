# Gladi bersih ETL SION, 25 September 2026

Gladi bersih penuh migrasi satu sekolah nyata dari SION (MySQL/MariaDB,
`sion-legacydb-1`, aplikasi Laravel yang masih dipakai sekolah sehari-hari)
ke newsekolah (Postgres), **lokal saja**: sumber, target, dan API rehearsal
semuanya berjalan di kontainer Docker sementara di mesin ini, tidak pernah
menyentuh VPS/staging/CI/git. Data pribadi siswa (nama, NIS/NISN, nomor HP,
alamat) hanya pernah ada di kontainer Postgres sementara yang sudah dihapus
di akhir sesi ini; dokumen ini hanya memuat jumlah baris, kategori error,
dan contoh yang dianonimkan.

## Ringkasan

Tiga bug ETL sungguhan ditemukan dan diperbaiki (lihat "Bug yang ditemukan
dan diperbaiki"). Setelah perbaikan, migrasi penuh dua semester (2025/2026
genap dan 2026/2027 ganjil, seluruh riwayat akademik sekolah ini di SION)
berjalan bersih: referential integrity 100% terjaga (nol baris yatim di
setiap pengecekan FK manual), migrasi terbukti idempoten (run ulang kedua
untuk semester yang sama menghasilkan nol baris `created` baru, semua
`updated`/`skipped`), dan login + beberapa layar kunci API (jadwal guru,
kalender presensi siswa) sukses lewat instance API lokal yang tersambung
ke database target sebagai `app_rw` (RLS aktif, bukan superuser).

Sisa kegagalan baris (di bawah 2.2% dari total baris genap, 0% di ganjil)
seluruhnya berasal dari masalah kualitas data di sumber sendiri (referensi
user yang sudah dihapus permanen dari tabel `users` tapi masih dirujuk
tabel lain) -- ETL melaporkannya dengan benar sebagai gagal, bukan
menyembunyikannya.

## Sumber yang dipakai

Tiga kontainer diperiksa read-only sebelum memilih sumber:

| Kontainer                          | Peran                                                                                                                                             | Kesimpulan                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `sion-legacydb-1` (127.0.0.1:3311) | Bagian dari stack `sion-*` yang masih `Up 8 days` bersama `sion-api-1`/`sion-web-1` -- database SION yang sungguh dipakai sekolah sehari-hari     | **Dipakai sebagai sumber.**                                    |
| `nsk-mysql` (127.0.0.1:33307)      | Salinan data yang hampir identik (`attendance_details` 163.089 vs 162.750 baris) tapi berdiri sendiri, tanpa `sion-api-1`/`sion-web-1` pendamping | Sisa kerja ETL sebelumnya, snapshot lebih lama. Tidak dipakai. |
| `nsk-etl-pg` (127.0.0.1:55437)     | Postgres 17, tanpa hubungan jelas ke migrasi mana pun yang sedang berjalan                                                                        | Sisa kerja ETL sebelumnya. Tidak disentuh.                     |

Kredensial dibaca lewat `docker inspect` (env `MARIADB_*`/`POSTGRES_*`),
tidak pernah dicetak di laporan ini.

## Persiapan gladi bersih

1. Kontainer Postgres 16 sekali pakai (`nsk-rehearsal-pg`, port 55499,
   dihapus di akhir sesi ini).
2. `cmd/migrate up` -- seluruh 120 migrasi (0001-0120) diterapkan bersih,
   termasuk `0004_db_roles` (membuat role `app_rw`/`app_platform`) dan
   `0120_workflow_instances_local_date` yang jadi pemicu bug pertama di
   bawah.
3. `cmd/bootstrap` -- membuat tenant `etl-rehearsal-01` dan admin pertama,
   yang di dalam transaksi yang sama juga memanggil
   `migrator.EnsureTenantDefaults` (role dan duty type bawaan) persis
   seperti yang akan terjadi di sekolah sungguhan.
4. `cmd/etl` dijalankan dengan `--target-dsn` **sebagai `app_rw`** (bukan
   superuser `postgres`) supaya RLS benar-benar aktif selama migrasi,
   sesuai yang berlaku di produksi.

## Per-entitas: sumber vs target

Sumber dihitung langsung dari `sion-legacydb-1` (`count(*)`, bukan
estimasi `information_schema`). Target adalah total setelah **kedua**
semester (2025/2026 genap + 2026/2027 ganjil) dimigrasikan dan dites
idempoten.

| Entitas                                          | Sumber                                     | Target  | Selisih -- penjelasan                                                                                                                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| users                                            | 2.518                                      | 2.518   | cocok persis                                                                                                                                                                                                                             |
| classes (`groups`)                               | 72                                         | 72      | cocok persis                                                                                                                                                                                                                             |
| grade_levels                                     | (tak ada tabel di sumber)                  | 3       | X, XI, XII, diturunkan dari nama kelas                                                                                                                                                                                                   |
| enrollments (`group_members`)                    | 2.791                                      | 2.791   | cocok persis                                                                                                                                                                                                                             |
| subjects                                         | 21                                         | 21      | cocok persis                                                                                                                                                                                                                             |
| teaching_assignments (`teacher_classes`)         | 1.794                                      | 1.257   | union lintas revisi jadwal per tahun ajaran menggabungkan baris duplikat ke key alami yang sama (perilaku yang didokumentasikan, "Union jadwal"); 5 baris genap gagal karena `user_id` guru yang dirujuk sudah tak ada di `users` sumber |
| schedules                                        | 5.018 (lintas semua revisi)                | 3.310   | union jadwal: satu baris per slot (kelas/hari/jam), revisi terbaru menang -- lihat di atas                                                                                                                                               |
| attendance_sessions (`attendances`)              | 12.714                                     | 12.475  | 221 gagal (genap, tak bisa dicocokkan ke jadwal manapun -- turunan dari kegagalan `teaching_assignments`/kelas di atas), 18 baris berbagi key alami yang sama dalam satu run (upsert ke baris yang sama, bukan kehilangan data)          |
| attendance_entries (`attendance_details`)        | 163.442                                    | 159.538 | 3.818 gagal (genap, siswa dengan `user_id` yang sudah dihapus dari `users` sumber), 86 berbagi key alami dalam satu run                                                                                                                  |
| class_journals (`journals`)                      | 7.966                                      | 6.829   | **gap yang sudah didokumentasikan sebelumnya** (bukan temuan baru): union jadwal belum diperluas ke jurnal (`docs/13-etl-sion.md`, "Union jadwal"), jurnal yang tertaut ke revisi jadwal bukan-primer tetap tak termigrasi               |
| violation_types                                  | 43                                         | 43      | cocok persis                                                                                                                                                                                                                             |
| violation_records (`student_has_violations`)     | 645                                        | 641     | 4 baris berbagi (siswa, jenis, hari) yang sama, digabung -- gap yang sudah didokumentasikan                                                                                                                                              |
| workflow_instances (exit_permit + leave_request) | --                                         | 5.022   | 1.379 exit_permit + 3.643 leave_request; hanya instance berstatus final yang dimigrasikan (perilaku yang didokumentasikan)                                                                                                               |
| grades                                           | 6.622                                      | 6.622   | cocok persis                                                                                                                                                                                                                             |
| report_scores                                    | 32                                         | 32      | cocok persis                                                                                                                                                                                                                             |
| grade_publications                               | 26                                         | 26      | cocok persis                                                                                                                                                                                                                             |
| star_events (`classroom_star_awards`)            | 3.038                                      | 3.035   | 3 baris `stars = 0` dilewati (target `check (delta <> 0)`) -- gap yang sudah didokumentasikan                                                                                                                                            |
| library_titles (`books`)                         | 59 (57 aktif + 2 `deleted_at` terisi)      | 57      | ETL memfilter `deleted_at is null` dengan benar; **bukan kehilangan data**, baru terverifikasi lewat gladi bersih ini                                                                                                                    |
| library_copies                                   | (direkonstruksi dari stock + riwayat kode) | 17.791  | sesuai algoritma yang didokumentasikan                                                                                                                                                                                                   |
| library_loans (`book_loans`)                     | 13.699                                     | 13.070  | 15 gagal (tak ada `book_code`), 614 berbagi (copy, member, hari) yang sama -- gap yang sudah didokumentasikan                                                                                                                            |
| library_visits                                   | 616                                        | 577     | 39 baris identik (member, waktu, tujuan) digabung -- gap yang sudah didokumentasikan                                                                                                                                                     |
| duty_assignments                                 | --                                         | 104     | 52 per tahun ajaran (homeroom 72 total = 1 per kelas, plus counselor/picket/librarian/security/leadership berskala sekolah)                                                                                                              |
| terms                                            | --                                         | 2       | 1 per tahun ajaran yang dimigrasikan                                                                                                                                                                                                     |

Baris yang tidak disebut di sini (rooms, suspensions, report_scores
kolom kosong tertentu, dll.) mengikuti persis apa yang sudah
didokumentasikan di `docs/13-etl-sion.md`; gladi bersih ini tidak
menemukan penyimpangan baru pada baris-baris itu.

## Integritas referensial

Setelah kedua semester dimigrasikan, pengecekan manual berikut semuanya
mengembalikan **nol**:

- `student_profiles` tanpa `users` yang cocok
- `enrollments` tanpa `classes` yang cocok
- `enrollments` tanpa `users` (siswa) yang cocok
- `attendance_entries` tanpa `attendance_sessions` yang cocok
- `library_loans` tanpa `library_copies` yang cocok
- `workflow_instances.local_date` yang masih null

## Idempotensi

Semester 2026/2027 ganjil dimigrasikan tiga kali berturut-turut dalam
sesi ini (dry-run, run sungguhan, lalu run ulang sungguhan setelah
semester lain ikut dimigrasikan di antaranya). Run ulang ketiga
menghasilkan **nol** baris `created` baru di seluruh 27 tabel yang
dilaporkan -- semuanya `updated` atau `skipped`, persis seperti yang
didokumentasikan untuk run malam selama periode paralel.

## Login dan layar kunci lewat API

Instance `cmd/api` lokal dijalankan tersambung ke database target
sebagai `app_rw` (RLS aktif). Password satu guru dan satu siswa yang
sudah termigrasi diset langsung di database rehearsal (bukan lewat alur
lupa password -- ini simulasi "akun sudah aktif", bukan test alur reset)
untuk menguji login dan panggilan API sesungguhnya:

- **Guru**: login `POST /v1/auth/login` sukses, role `teacher` dan izin
  yang sesuai. `GET /v1/schedules?academic_year_id=...&teacher_user_id=...`
  mengembalikan jadwal mengajar sungguhan hasil migrasi.
- **Siswa**: login sukses, role `student`, `detail` berisi `nis`/`nisn`
  hasil migrasi. `GET /v1/attendance/me/calendar` awalnya menjawab
  `ATTENDANCE_NO_ACTIVE_YEAR` -- **perilaku yang benar**, karena ETL
  sengaja tidak pernah menyentuh `academic_years.is_active`/
  `terms.is_active` (keputusan operasional sekolah, sudah didokumentasikan).
  Setelah tahun ajaran dan term diaktifkan manual (langkah yang memang
  perlu dilakukan sekolah pasca-migrasi), endpoint yang sama
  mengembalikan kalender presensi sungguhan dengan jadwal, mapel, dan
  nama guru hasil migrasi.

Temuan ini menambah satu langkah eksplisit ke runbook cut-over di bawah:
**aktifkan tahun ajaran dan term yang berjalan setelah run ETL terakhir**,
karena tanpanya layar presensi harian siswa/guru langsung gagal dengan
error yang membingungkan kalau tidak diantisipasi.

## Bug yang ditemukan dan diperbaiki

Tiga bug ETL sungguhan ditemukan menjalankan gladi bersih ini, masing-masing
diperbaiki di commit terpisah (lihat riwayat git `apps/api/cmd/etl`):

1. **`workflow_instances.local_date` tidak pernah diisi.** Migrasi 0120
   (yang sudah ada di branch ini sebelum gladi bersih dimulai) menambah
   kolom `local_date` NOT NULL, tapi insert exit permit dan leave request
   di ETL belum diperbarui -- **setiap** baris exit permit/leave request
   gagal dengan pelanggaran not-null. Diperbaiki dengan mengisi
   `local_date` dari tanggal kalender lokal tenant milik baris sumber
   (`mapping.LocalDate(p.CreatedAt)`), persis cara aplikasi sendiri
   menghitungnya saat runtime.
2. **Semester tanpa exit permit yang belum final bikin ETL berhenti
   total.** `CountExitPermitsNotFinal` memakai `sum(...)` MySQL yang
   mengembalikan NULL (bukan 0) saat tak ada baris cocok sama sekali --
   `Scan` ke `int` gagal, dan seluruh run ETL gagal sebelum menyentuh
   database target sama sekali. Ketemu saat memigrasikan semester
   2025/2026 genap (semester itu memang tak punya baris `student_permits`
   dalam rentang tanggalnya). Diperbaiki dengan `coalesce(..., 0)`.
3. **Nama kelas "Kelas X1" tak dikenali sebagai kelas X.** Sekolah yang
   sama menamai kelasnya "X-1".."XII-12" di satu tahun ajaran tapi
   "Kelas X1".."Kelas XII-12" di tahun ajaran lain. Parser
   `ParseGradeFromClassName` hanya pernah melihat token pertama
   ("Kelas"), jadi **ke-36 kelas semester 2025/2026 genap gagal
   dimigrasikan**, yang lalu menjatuhkan setiap enrollment, jadwal,
   teaching assignment, dan sesi presensi semester itu juga (kegagalan
   berantai). Diperbaiki dengan (a) membuang token pembuka "Kelas" dan
   (b) mengenali token grade yang digabung langsung dengan angka bagian
   ("X1", "XI2") selain yang sudah dipisah dengan "-"/spasi.

Semua tiga perbaikan diverifikasi dengan menjalankan ulang ETL penuh
terhadap database SION sungguhan setelah perbaikan (bukan hanya lewat
unit test) -- bug #1 dan #2 di kode yang menyentuh database sungguhan
tidak punya harness unit test (sesuai keputusan arsitektur ETL yang sudah
ada, lihat `docs/13-etl-sion.md`); bug #3 (`ParseGradeFromClassName`) ada
di `cmd/etl/mapping`, jadi dapat unit test baru
(`TestParseGradeFromClassName` di `naturalkey_test.go`).

## Pertanyaan terbuka (perlu keputusan produk/sekolah)

- **Jurnal kelas yang hilang karena revisi jadwal (gap lama, terlihat
  makin besar di sini)**: 1.137 dari 7.966 baris `journals` (~14%) tidak
  termigrasikan karena union jadwal belum diperluas ke jurnal. Ini bukan
  temuan baru (sudah tercatat di `docs/13-etl-sion.md`), tapi gladi
  bersih penuh dua semester ini adalah pertama kalinya dampaknya terlihat
  di angka riil sebesar ini. Perlu diputuskan: kerjakan perluasan union
  ke jurnal sebelum cutover sungguhan, atau terima gap ini dan
  informasikan ke sekolah sebagai data historis yang hilang.
- **5 penugasan mengajar dan turunannya dengan guru yang sudah terhapus
  permanen dari SION** (`user_id` 1589, dirujuk 5 baris `teacher_classes`
  semester 2025/2026 genap): tak ada cara memulihkan siapa guru itu dari
  SION sendiri. Sekolah perlu dikonfirmasi apakah baris jadwal itu
  memang boleh hilang, atau ada catatan lain (dokumen fisik) yang bisa
  dipakai mengisi manual pasca-migrasi.
- **1 siswa dengan `user_id` yang sudah terhapus permanen** (dirujuk di
  `attendance_details`, sumber presensi genap): sama seperti di atas,
  riwayat presensinya tak bisa dipulihkan dari SION.

## Runbook cut-over (diperbarui dari gladi bersih ini)

1. **Siapkan tenant**: wizard onboarding (jenjang, domain) -- jangan isi
   data operasional lain.
2. **Dry run**: `cmd/etl --dry-run` untuk setiap semester yang akan
   dimigrasikan. Review `etl-report.json`; setiap baris `failed` yang
   bukan "user/guru terhapus permanen di sumber" perlu diperbaiki di
   sumber sebelum lanjut.
3. **Run sungguhan**, semester demi semester, urut kronologis (semester
   lama dulu, baru semester berjalan) -- `cmd/etl` (tanpa `--dry-run`)
   dengan `--target-dsn` mengarah ke `app_rw`, bukan superuser.
4. **Jalankan ETL setiap malam** selama periode paralel (dua minggu),
   semester berjalan saja.
5. **Verifikasi**: bandingkan jumlah baris `read` per tabel di laporan
   dengan `select count(*)` di sumber untuk rentang yang sama.
6. **Aktifkan tahun ajaran dan term yang berjalan**
   (`academic_years.is_active`, `terms.is_active`) -- **langkah baru,
   ditemukan di gladi bersih ini**. Tanpa ini, layar presensi
   harian (`/v1/attendance/me/today`, `/v1/attendance/me/calendar`)
   langsung gagal dengan `ATTENDANCE_NO_ACTIVE_YEAR` untuk semua
   pengguna begitu sekolah pindah ke sistem baru.
7. **Komunikasikan `must_change_password`** ke semua user (semua
   password hasil migrasi acak, wajib reset lewat WhatsApp/email di
   login pertama).
8. **Potong (cutover)**: matikan akses tulis ke SION, jalankan satu run
   ETL terakhir, verifikasi ulang langkah 5, aktifkan tahun ajaran
   (langkah 6) bila belum, sekolah pindah sepenuhnya ke newsekolah.

## Waktu run

Diukur di gladi bersih ini (MacBook lokal, sumber via `docker exec`
setara, target Postgres 16 di Docker lokal):

| Run                                                   | Baris dibaca | Durasi           |
| ----------------------------------------------------- | ------------ | ---------------- |
| 2026/2027 ganjil, dry-run                             | 86.719       | 3 menit 44 detik |
| 2026/2027 ganjil, sungguhan (pertama)                 | 86.719       | 3 menit 53 detik |
| 2025/2026 genap, sungguhan (setelah perbaikan bug #3) | 189.653      | 6 menit 4 detik  |
| 2026/2027 ganjil, sungguhan (run ulang idempoten)     | 86.719       | 3 menit 34 detik |

Waktu genap jauh lebih lama dari ganjil terutama karena
`attendance_details` semester itu (137.151 baris dalam rentang tanggal)
jauh lebih besar dari ganjil (26.291 baris) -- sekolah ini punya riwayat
presensi harian yang jauh lebih lengkap di semester lama. Migrasi
riwayat penuh (kedua semester, dry-run lalu sungguhan untuk masing-masing)
memakan sekitar 17 menit total di lingkungan gladi bersih ini.

## Go/no-go checklist hari migrasi sungguhan

- [ ] Tiga perbaikan bug di atas sudah ada di branch yang akan dipakai
      (commit tersedia di `apps/api/cmd/etl`).
- [ ] Dry-run terakhir terhadap database SION sekolah sungguhan (bukan
      data gladi bersih ini) sudah direview -- nol baris `failed` yang
      bukan referensi user/guru yang sudah terhapus permanen di sumber.
- [ ] Sekolah sudah dikonfirmasi soal gap jurnal kelas (union jadwal) dan
      guru/siswa yang terhapus permanen -- lihat "Pertanyaan terbuka".
- [ ] `--target-dsn` run sungguhan mengarah ke `app_rw`, **bukan**
      superuser Postgres.
- [ ] Rencana komunikasi `must_change_password` ke seluruh user sudah
      siap (WhatsApp/email).
- [ ] Jadwal aktivasi tahun ajaran + term pasca-run terakhir sudah
      ditentukan (langkah 6 runbook di atas) -- jangan sampai sekolah
      pindah ke sistem baru dengan layar presensi harian yang gagal.
- [ ] Rencana rollback: SION tetap hidup read-only sampai sekolah
      mengonfirmasi data di newsekolah sudah identik; tidak ada langkah
      di ETL yang menulis balik ke SION, jadi rollback berarti sekadar
      mengizinkan tulis lagi ke SION dan menunda cutover.
