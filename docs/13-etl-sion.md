# 13. ETL dari SION

`apps/api/cmd/etl` memigrasikan satu database SION **yang sungguh dipakai
sekolah** (MySQL/MariaDB, aplikasi Laravel lama) ke satu tenant newsekolah
(Postgres) yang sudah dibuat lewat wizard onboarding. Alat ini satu arah
(SION tidak pernah ditulis), idempoten pada key alami, dan dirancang untuk
dijalankan berulang kali selama SION tetap hidup, sesuai mitigasi risiko
"migrasi data lama gagal sebagian" di `docs/12-roadmap.md`.

Slice ini ("foundation") memigrasikan identitas dan tulang punggung
akademik saja: tahun ajaran, semester (term), kelas, mata pelajaran,
ruangan, pengguna dan profil, enrollment, penugasan mengajar, jadwal, dan
duty assignment (wali kelas, BK, piket, wakasek, satpam, pustakawan).
Presensi, disiplin, izin/perizinan, penilaian, dan perpustakaan sengaja
belum dikerjakan -- lihat "Yang sengaja belum dikerjakan" di bawah.

Catatan sejarah: versi awal alat ini menargetkan skema `reference/sion-rebuild-go`
(penulisan ulang Go yang sebenarnya tidak dipakai sekolah mana pun).
Database sungguhan sekolah adalah aplikasi Laravel yang lebih lama dengan
skema yang sama sekali berbeda; dokumen ini menjelaskan pemetaan ke skema
Laravel itu, yang sekarang satu-satunya yang didukung.

## Cara menjalankan

```sh
cd apps/api
go run ./cmd/etl \
  --source-dsn "sion_ro:password@tcp(sion-db-host:3306)/pecalang?tls=preferred" \
  --target-dsn "$DATABASE_URL" \
  --tenant smansa \
  --source-year "2026/2027" \
  --source-semester ganjil \
  --report etl-report.json \
  --dry-run
```

Setiap flag punya padanan environment variable jika lebih nyaman dipakai dari
CI atau cron: `ETL_SOURCE_MYSQL_DSN`, `DATABASE_URL` (dipakai juga oleh
`cmd/api`/`cmd/migrate`), `ETL_TENANT_SLUG`, `ETL_SOURCE_YEAR`,
`ETL_SOURCE_SEMESTER`, `ETL_REPORT_PATH`. Konfigurasi gagal cepat (fail-fast)
dan melaporkan semua yang hilang sekaligus, meniru
`apps/api/internal/platform/config`. Kontrak flag ini tidak berubah dari versi
sebelumnya -- hanya resolusi internalnya (lihat "Tahun ajaran dan semester").

Poin penting:

- `--tenant` harus tenant yang **sudah ada** (dibuat oleh wizard onboarding).
  ETL tidak pernah membuat tenant baru.
- `--source-year`/`--source-semester` memilih satu baris `years` sumber lewat
  key alaminya sendiri (`start_year`, `semester`) -- lihat "Tahun ajaran dan
  semester" di bawah.
- `--dry-run` menjalankan seluruh migrasi termasuk setiap `INSERT`/`UPDATE`
  di dalam satu transaksi, lalu **rollback** transaksi itu di akhir alih-alih
  commit. Ini sengaja dipakai daripada mengecek `if dryRun` di setiap
  langkah tulis: constraint (unique key, foreign key, exclusion constraint)
  tetap teruji persis seperti run sungguhan, jadi laporan dry-run bisa
  dipercaya.
- Sumber (MySQL) dibaca penuh ke memori sebelum transaksi target dibuka, agar
  koneksi Postgres tidak menganggur menunggu MySQL dan biaya dry-run
  terduga.

## Urutan migrasi (dependency order)

1. Tahun ajaran target (dibuat dari label `YYYY/YYYY` bila tenant belum
   punya tahun ajaran dengan label yang sama, memakai tanggal
   `start_date`/`end_date` sumber sendiri bila tersedia).
2. Term (semester) di dalam tahun ajaran itu.
3. Role dan duty type sistem (`authz.RoleDefaults()` dan daftar duty yang
   sama dengan `cmd/seed`) -- dipastikan ada, bukan dibuat ulang bila tenant
   sudah onboarding normal.
4. Users, role assignment, dan profile (`user_profiles` +
   `student_profiles`/`teacher_profiles`/`staff_profiles`).
5. Grade level (diturunkan dari nama kelas sumber) dan classes.
6. Rooms.
7. Subjects.
8. Enrollments (butuh users + classes).
9. Teaching assignments (butuh users + classes + subjects).
10. Duty assignments (wali kelas, BK, piket, wakasek, satpam, pustakawan),
    termasuk menandai `classes.homeroom_teacher_id` untuk wali kelas.
11. Period template + periods (butuh tahun ajaran).
12. Schedules (butuh users + classes + subjects + periods + term).

Urutan ini persis urutan pemanggilan di `runMigrationSteps`
(`apps/api/cmd/etl/run.go`).

## Skema sumber yang dipakai

Database sumber adalah aplikasi Laravel dengan tabel-tabel berikut (semua id
`bigint`, bukan UUID seperti target):

| Tabel sumber                               | Peran                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `years`                                    | tahun ajaran + semester (`semester`: 1 = ganjil, 2 = genap), dengan tanggal sendiri    |
| `groups`                                   | kelas, terikat ke `years.id`; `code` acak tanpa arti, `name` yang dipakai (mis. "X-1") |
| `group_members`                            | enrollment (siswa <-> kelas); tidak ada status/tanggal sama sekali                     |
| `subjects`, `rooms`                        | global, tidak terikat tahun ajaran                                                     |
| `periods`                                  | jam pelajaran, global, `urutan` = urutan tampil                                        |
| `schedule_versions`                        | revisi jadwal per tahun ajaran (bisa lebih dari satu per tahun)                        |
| `teacher_classes`                          | penugasan mengajar (guru + mapel + kelas), terikat ke satu `schedule_version`          |
| `schedules`                                | satu slot jadwal (kelas/hari/satu period), terikat ke `teacher_class`                  |
| `users`, `user_details`, `student_details` | identitas; `user_details` jarang (staf), `student_details` untuk siswa                 |
| `management_staff`                         | wakil kepala sekolah (posisi bebas teks, cth. "Waka Kurikulum")                        |
| `roles`, `model_has_roles`                 | role Spatie (laravel-permission); satu user bisa punya banyak role                     |
| `class_administrators`                     | wali kelas per tahun ajaran (persis, bukan tebakan dari role)                          |
| `class_of_bks`, `bk_on_dutis`              | detail BK per kelas / per hari -- tidak ada padanan di target, lihat gap               |

Tabel lain (presensi, disiplin, izin, penilaian, perpustakaan, koperasi,
LMS, dll.) diabaikan sama sekali di slice ini.

## ID mapping

Karena id sumber adalah `int64` dan id target adalah `uuid.UUID`, setiap
langkah migrasi mencatat pemetaannya lewat satu tipe bersama,
`IDMap = map[int64]uuid.UUID` (`apps/api/cmd/etl/idmap.go`). Langkah yang
perlu membawa informasi tambahan (role, grade level, sequence period) punya
struct hasil kecilnya sendiri yang tetap memakai `int64` sebagai key
(`userMigrationResult`, `classMigrationResult`, `periodMigrationResult`)
alih-alih memaksakan field tambahan ke `IDMap`. Pola yang sama ini akan
dipakai lagi oleh slice ETL berikutnya (presensi, disiplin, izin, penilaian,
perpustakaan) untuk memetakan id user/kelas/mapel/period/schedule/
teacher_class sumber ke target.

## Key alami per tabel

| Tabel target                        | Key alami                                                                                                                                        | Alasan                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `users`                             | `(tenant_id, username)`                                                                                                                          | username unik di kedua sisi, selalu terisi di data sumber                                  |
| `student_profiles`                  | `(user_id)`, diisi dari `student_details.nis`/`nisn`                                                                                             | tabel profil 1:1 dengan user, bukan dicari lewat NISN/NIS                                  |
| `teacher_profiles`/`staff_profiles` | `(user_id)`                                                                                                                                      | sama seperti di atas                                                                       |
| `grade_levels`                      | `(tenant_id, code)`, code dari huruf depan nama kelas sumber                                                                                     | sumber tidak punya tabel grade level                                                       |
| `classes`                           | `(academic_year_id, name)`                                                                                                                       | identik dengan constraint target sendiri                                                   |
| `rooms`                             | `(tenant_id, code)`, code dari slug nama                                                                                                         | sumber identifikasi room dari nama saja                                                    |
| `subjects`                          | `(tenant_id, code)`, code dari slug nama                                                                                                         | sumber identifikasi subject dari nama saja                                                 |
| `enrollments`                       | `(academic_year_id, student_user_id)`                                                                                                            | konsisten dengan `ux_active_enrollment` target                                             |
| `teaching_assignments`              | `(academic_year_id, teacher_user_id, subject_id, class_id)`                                                                                      | constraint unique target sendiri                                                           |
| `duty_assignments`                  | `(academic_year_id, duty_type_id, user_id, scope_class_id, scope_student_id)`, dicek manual (`is not distinct from`) karena kolom scope nullable | constraint unique Postgres menganggap dua NULL berbeda                                     |
| `terms`                             | `(academic_year_id, sequence)`, sequence = semester (1 ganjil, 2 genap)                                                                          | constraint unique target sendiri                                                           |
| `periods`                           | `(template_id, sequence)`                                                                                                                        | satu period_template dibuat per label tahun ajaran yang dimigrasikan                       |
| `schedules`                         | `(academic_year_id, class_id, day_of_week, start_seq)`                                                                                           | dua constraint exclusion di target tidak bisa jadi target `on conflict`, jadi dicek manual |

Semua transformasi di atas (role, duty, tanggal/zona waktu, dan aturan key
alami) adalah fungsi murni di `apps/api/cmd/etl/mapping`, diuji lewat unit
test (`go test ./cmd/etl/mapping/...`). Bagian database (`apps/api/cmd/etl/*.go`
di root paket, bukan di `mapping/`) tidak diuji unit karena butuh Postgres
dan MySQL sungguhan; itu diverifikasi lewat run paralel manual (lihat di
bawah).

## Tahun ajaran dan semester

Skema sumber menyimpan `years` per (`start_year`, `semester`) -- satu tahun
ajaran Indonesia "2026/2027" punya (setidaknya) dua baris sumber (ganjil,
genap) persis seperti versi lama alat ini. `--source-year "2026/2027"
--source-semester ganjil` diuraikan menjadi `start_year=2026`,
`end_year=2027` (harus berurutan), `semester=1`, lalu dicari lewat
`resolveYearID` di `source.go`. Baris `years` yang cocok punya
`start_date`/`end_date` sendiri, yang dipakai sebagai tanggal
`academic_years` target saat _membuat_ tahun ajaran baru (lebih akurat
daripada tebakan Juli-Juni `mapping.AcademicYearDates`, yang tetap dipakai
sebagai fallback bila baris sumber entah kenapa tidak punya tanggal) --
tahun ajaran yang sudah ada tidak pernah ditimpa tanggalnya. Term dibuat
terpisah lewat `ensureTerm`, satu per semester, juga dengan tanggal sumber
sendiri; `is_active` pada academic_years maupun term **tidak pernah**
disentuh ETL -- itu keputusan operasional/admin sekolah.

Menjalankan ETL dua kali berturut-turut (`--source-semester ganjil` lalu
`--source-semester genap`) memigrasikan tahun ajaran penuh sebagai dua term
di academic_years yang sama; data yang sama pada kedua semester (mis. siswa
yang tidak pindah kelas) ter-upsert, bukan dobel.

## Pemilihan schedule_version

Satu tahun ajaran bisa punya lebih dari satu `schedule_versions` (mis.
revisi jadwal di tengah semester). ETL memilih **tepat satu** versi per
tahun ajaran yang dimigrasikan, dengan aturan (diimplementasikan sebagai
satu `order by` di `resolveScheduleVersion`, `source_schedule.go`):

1. Utamakan yang berstatus `active`.
2. Bila tidak ada yang aktif, pakai yang `effective_from` paling baru.
3. Bila masih seri, pakai `id` paling besar.

`teacher_classes` dan `schedules` sama-sama tergantung pada satu
`schedule_version`; `schedules.schedule_version_id` sendiri **tidak
dipakai** sebagai filter karena bisa redundan/tidak konsisten dengan
`teacher_classes.schedule_version_id` -- ETL selalu join lewat
`teacher_classes` sebagai sumber kebenaran. Versi yang terpilih (id, nama,
status) dicatat sebagai catatan pada `TableStat` tabel `teaching_assignments`
di laporan, supaya operator bisa lihat revisi sumber mana yang dipakai.

## Role dan duty

Skema sumber memakai role Spatie (`roles`/`model_has_roles`); satu user bisa
punya beberapa role sekaligus. Resolusi role identitas
(`mapping.MapIdentityRole`, `mapping/role.go`):

1. **Role inti** (`Super Admin`, `Administrator`, `Teacher`, `Student`) --
   bila dipegang, selalu menang, dengan prioritas itu bila entah bagaimana
   user memegang lebih dari satu (tidak pernah terjadi di data sungguhan).
2. **Role operasional/sinyal-staf** (`Picket`, `Pustakawan`, `Security`,
   `BK`, `Supervisor`, `Manajemen`, `Keuangan`, `Koperasi`, `Kiosk`) -- bila
   user tidak memegang role inti manapun tapi memegang salah satu ini, role
   identitasnya default ke `staff`. Ini keputusan yang defensible, bukan
   kecocokan sempurna.
3. Selebihnya (`Customer` saja, atau tanpa role) -- tidak dapat role
   identitas dan tidak dapat profil sama sekali (baris `users` tetap
   dibuat).

Role `Class Administrator` **diabaikan** untuk resolusi role/duty apa pun --
36 pemegangnya semua juga memegang `Teacher`, dan tabel
`class_administrators` sudah memberi detail per-kelas yang jauh lebih tepat
untuk duty wali kelas.

Duty assignment diturunkan dari tiga sumber independen
(`migrate_duties.go`), masing-masing satu duty type:

| Sumber                   | Duty type    | Scope   |
| ------------------------ | ------------ | ------- |
| `class_administrators`   | `homeroom`   | kelas   |
| role Spatie `BK`         | `counselor`  | sekolah |
| role Spatie `Picket`     | `picket`     | sekolah |
| role Spatie `Pustakawan` | `librarian`  | sekolah |
| role Spatie `Security`   | `security`   | sekolah |
| `management_staff`       | `leadership` | sekolah |

`mapping.MapDuty` (pencocokan kata kunci nama duty bebas teks) sudah
**dihapus**: tidak relevan lagi karena skema sumber tidak punya nama duty
bebas teks -- setiap duty sekarang diturunkan dari struktur sumber yang
presisi seperti tabel di atas.

## Password

Sumber memakai bcrypt (Laravel default); newsekolah memakai argon2id
(`apps/api/internal/platform/auth/password.go`). **Hash password tidak bisa
dipindahkan** karena algoritmanya berbeda. Setiap user yang dimigrasikan:

- mendapat hash argon2id acak (bukan hash sumber, dan bukan password yang
  bisa ditebak),
- diset `must_change_password = true`,
- harus login lewat alur lupa password (reset lewat WhatsApp/email) pada
  login pertama di sistem baru.

Ini dicatat di laporan sebagai bagian dari setiap baris `users`, bukan
sebagai gap terpisah, karena berlaku untuk semua user tanpa kecuali.

## Yang tidak bisa dipetakan (gap)

Dicatat di laporan (`gaps` per tabel), bukan direka:

- **Enrollment tanpa status/tanggal**: `group_members` di sumber tidak
  punya kolom status/joined_at/left_at sama sekali (bukan kadang kosong --
  memang tidak ada kolomnya). Setiap enrollment default ke
  `status = 'active'`, `joined_on` = tanggal mulai tahun ajaran target, dan
  `left_on = null`. Dicatat sebagai **satu** gap agregat per run ("N
  enrollment defaulted..."), bukan satu baris per siswa.
- **Field profil tanpa sumber**: skema sumber tidak punya kolom
  gender/religion/district/city/blood_type sama sekali (untuk kind
  manapun); `student_profiles.father_name/mother_name/guardian_name/
guardian_phone/parent_occupation/previous_school/entry_year`,
  `teacher_profiles.nuptk/last_education/joined_year/specialization`, dan
  `staff_profiles.last_education/joined_year` juga tidak punya sumber.
  Semua field ini selalu dibiarkan null; dicatat sebagai gap agregat tetap
  (bukan per user) karena berlaku untuk seluruh tabel, bukan kadang-kadang.
- **`user_details.no_id` dipakai dobel**: kolom "nomor identitas" generik
  ini dipakai sebagai `user_profiles.nik` untuk semua kind, DAN sebagai
  `teacher_profiles.nip` / `staff_profiles.employee_number` untuk kind yang
  sesuai -- skema sumber hanya punya satu field seperti ini, tidak
  dipisah NIK vs NIP.
- **Role tanpa padanan**: role Spatie `Supervisor`, `Manajemen`,
  `Keuangan`, `Koperasi`, `Kiosk` tidak punya padanan duty/role apa pun di
  target (walau pemegangnya tetap default ke role `staff`, lihat di atas);
  dicatat sebagai gap agregat per nama role ("role Supervisor: N user...").
  Role `Customer` tidak dianggap sinyal staf sama sekali (modul
  koperasi/kantin, bukan identitas sekolah) -- user yang hanya punya role
  ini tidak dapat role identitas maupun profil.
- **`class_of_bks`**: penugasan BK per kelas tidak dimigrasikan detailnya --
  duty type `counselor` di target berskala sekolah (`scope_kind = 'school'`),
  jadi tidak ada tempat menaruh detail per kelas. Dicatat sebagai jumlah
  agregat per run.
- **`bk_on_dutis`**: hari piket BK per user tidak dimigrasikan --
  `duty_assignments` tidak punya kolom hari. Dicatat sebagai jumlah agregat.
- **Rooms**: dimigrasikan (untuk sekolah lain yang datanya punya rooms),
  tapi database sekolah ini saat ini punya nol baris `rooms`, dan tidak ada
  kolom `room_id` di manapun pada skema sumbernya -- jadi jadwal yang
  dimigrasikan tidak dikaitkan ke ruangan.

## Yang sengaja belum dikerjakan

Slice ini ("foundation") berhenti di identitas dan tulang punggung
akademik. Modul berikut **sengaja** belum disentuh dan menunggu slice ETL
berikutnya, yang akan dibangun di atas mekanisme `IDMap` dan struktur file
`source_*.go`/`migrate_*.go` yang sudah ada di sini:

- **Presensi** (`attendances`, `attendance_details`, dan sejenisnya).
- **Disiplin** (`violations`, `student_has_violations`, `suspensions`, dan
  sejenisnya).
- **Izin/perizinan** (`permits`, `student_permits`, `special_permit_*`).
- **Penilaian** (`grades`, `grade_publications`, rapor).
- **Perpustakaan** (`books`, `book_loans`, dan modul koperasi/LMS/HBG di
  sekitarnya -- di luar cakupan ETL ini sama sekali, bukan hanya ditunda).

Tidak ada perubahan migrasi Postgres, OpenAPI, atau web dalam slice ini:
ETL murni backend, dijalankan lewat CLI oleh operator/developer.

## Prosedur run paralel yang disarankan

1. **Persiapan**: buat tenant lewat wizard onboarding (jenjang, tahun
   ajaran, domain). Jangan isi data operasional lain -- biarkan ETL yang
   mengisi.
2. **Dry run** dengan `--dry-run`, review `etl-report.json` dan ringkasan
   stdout. Perhatikan baris `failed` (bug dalam data sumber yang perlu
   dibersihkan sebelum run sungguhan) dan `gaps` (yang memang tidak akan
   pernah terisi, informasikan ke sekolah).
3. **Run pertama** tanpa `--dry-run`. Sistem lama tetap jadi yang dipakai
   sekolah sehari-hari.
4. **Jalankan ETL setiap malam** (cron/CI) selama periode paralel (dua
   minggu, sesuai `docs/12-roadmap.md`). Setiap run meng-update baris yang
   berubah di sumber dan menambah baris baru; baris yang sudah ada dan
   tidak berubah muncul sebagai `skipped`, bukan `updated`, jadi laporan
   tiap malam menunjukkan persis apa yang berubah hari itu.
5. **Verifikasi**: bandingkan jumlah baris `read` per tabel di laporan
   dengan jumlah baris di sumber untuk tahun ajaran yang sama (`select
count(*) ...`). Jumlah harus sama persis dikurangi baris yang memang
   gap (tercatat di laporan).
6. **Potong (cutover)**: setelah sekolah setuju data sudah identik dan tim
   sudah mengomunikasikan `must_change_password` ke semua user, matikan
   akses tulis ke sistem lama (read-only atau nonaktif), lakukan satu run
   ETL terakhir, lalu sekolah pindah sepenuhnya ke newsekolah.
