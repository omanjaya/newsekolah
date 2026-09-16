# 13. ETL dari SION

`apps/api/cmd/etl` memigrasikan satu database SION **yang sungguh dipakai
sekolah** (MySQL/MariaDB, aplikasi Laravel lama) ke satu tenant newsekolah
(Postgres) yang sudah dibuat lewat wizard onboarding. Alat ini satu arah
(SION tidak pernah ditulis), idempoten pada key alami, dan dirancang untuk
dijalankan berulang kali selama SION tetap hidup, sesuai mitigasi risiko
"migrasi data lama gagal sebagian" di `docs/12-roadmap.md`.

Alat ini memigrasikan identitas dan tulang punggung akademik (tahun ajaran,
semester/term, kelas, mata pelajaran, ruangan, pengguna dan profil,
enrollment, penugasan mengajar, jadwal, duty assignment), lalu enam domain
operasional di atasnya: presensi, jurnal kelas, disiplin, izin/perizinan
(exit permit dan leave request), penilaian, dan perpustakaan. Koperasi,
LMS, dan modul HBG di sekitar perpustakaan tetap di luar cakupan sama
sekali -- lihat "Yang di luar cakupan" di bawah.

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
13. Attendance sessions (butuh schedules) lalu attendance entries (butuh
    attendance sessions).
14. Class journals (butuh users + classes + subjects; menautkan ke
    attendance session bila ada).
15. Violation types lalu violation records (butuh users + violation types);
    suspensions dicatat sebagai gap, tidak dimigrasikan.
16. Exit permits lalu leave requests (masing-masing butuh
    `workflow_definitions` -- dibuat sekali lewat `ensureWorkflowDefinition`
    dengan stage bawaan yang sama dengan `permits.EnsureDefaultDefinitions` --
    dan users + classes; exit permit juga butuh periods).
17. Assessment components (diturunkan dari grades + learning_objectives)
    lalu grades, report scores, grade publications, dan star events.
18. Library titles lalu library copies (diturunkan dari books + riwayat
    book_loans), lalu book loans (butuh titles + copies) dan library visits.

Urutan ini persis urutan pemanggilan di `runMigrationSteps`
(`apps/api/cmd/etl/run.go`).

## Skema sumber yang dipakai

Database sumber adalah aplikasi Laravel dengan tabel-tabel berikut (semua id
`bigint`, bukan UUID seperti target):

| Tabel sumber                                             | Peran                                                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `years`                                                  | tahun ajaran + semester (`semester`: 1 = ganjil, 2 = genap), dengan tanggal sendiri                                                                    |
| `groups`                                                 | kelas, terikat ke `years.id`; `code` acak tanpa arti, `name` yang dipakai (mis. "X-1")                                                                 |
| `group_members`                                          | enrollment (siswa <-> kelas); tidak ada status/tanggal sama sekali                                                                                     |
| `subjects`, `rooms`                                      | global, tidak terikat tahun ajaran                                                                                                                     |
| `periods`                                                | jam pelajaran, global, `urutan` = urutan tampil                                                                                                        |
| `schedule_versions`                                      | revisi jadwal per tahun ajaran (bisa lebih dari satu per tahun)                                                                                        |
| `teacher_classes`                                        | penugasan mengajar (guru + mapel + kelas), terikat ke satu `schedule_version`                                                                          |
| `schedules`                                              | satu slot jadwal (kelas/hari/satu period), terikat ke `teacher_class`                                                                                  |
| `users`, `user_details`, `student_details`               | identitas; `user_details` jarang (staf), `student_details` untuk siswa                                                                                 |
| `management_staff`                                       | wakil kepala sekolah (posisi bebas teks, cth. "Waka Kurikulum")                                                                                        |
| `roles`, `model_has_roles`                               | role Spatie (laravel-permission); satu user bisa punya banyak role                                                                                     |
| `class_administrators`                                   | wali kelas per tahun ajaran (persis, bukan tebakan dari role)                                                                                          |
| `class_of_bks`, `bk_on_dutis`                            | detail BK per kelas / per hari -- tidak ada padanan di target, lihat gap                                                                               |
| `attendances`, `attendance_details`                      | presensi per sesi (kelas/mapel/periode/hari) dan per siswa; `attendance_details` ~163k baris, tabel terbesar di sumber                                 |
| `journals`                                               | jurnal kelas guru; `type` selalu `'guru'` di data sekolah ini (`'siswa'`/`'bk'` ada di enum, tak pernah dipakai)                                       |
| `violations`, `student_has_violations`                   | katalog pelanggaran dan catatan pelanggaran siswa (poin diambil dari nilai `violations.violation_poin` saat ini, sumber tak simpan riwayat poin)       |
| `suspensions`                                            | skorsing; tak ada padanan di target, lihat gap                                                                                                         |
| `student_permits`                                        | alur exit permit (keluar sekolah lalu, kecuali `return_required=0`, kembali); `permit_type` juga memuat `'late'` (check-in terlambat, di luar cakupan) |
| `permits`                                                | alur leave request (izin multi-hari), disetujui wali kelas lalu BK lewat flag boolean, tanpa kolom siapa yang menyetujui                               |
| `grades`, `learning_objectives`                          | nilai per tujuan pembelajaran; `learning_objectives` tak terikat kelas (dipakai lintas kelas oleh satu guru), lihat "Penilaian"                        |
| `report_scores`, `previous_grades`, `grade_publications` | override nilai rapor manual, nilai semester sebelumnya, status publikasi nilai                                                                         |
| `classroom_star_awards`                                  | bintang penghargaan per siswa per kelas                                                                                                                |
| `books`, `book_codes`, `book_loans`                      | katalog buku (stok agregat, bukan per eksemplar), pool kode barcode lepas, dan peminjaman; `book_loans` ~13.7k baris                                   |
| `library_visits`, `library_settings`                     | kunjungan perpustakaan dan pengaturan lama (durasi pinjam dsb.), lihat "Perpustakaan"                                                                  |

Tabel modul koperasi, LMS, dan HBG diabaikan sama sekali -- lihat "Yang di
luar cakupan" di bawah.

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

| Tabel target                                     | Key alami                                                                                                                                        | Alasan                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `users`                                          | `(tenant_id, username)`                                                                                                                          | username unik di kedua sisi, selalu terisi di data sumber                                      |
| `student_profiles`                               | `(user_id)`, diisi dari `student_details.nis`/`nisn`                                                                                             | tabel profil 1:1 dengan user, bukan dicari lewat NISN/NIS                                      |
| `teacher_profiles`/`staff_profiles`              | `(user_id)`                                                                                                                                      | sama seperti di atas                                                                           |
| `grade_levels`                                   | `(tenant_id, code)`, code dari huruf depan nama kelas sumber                                                                                     | sumber tidak punya tabel grade level                                                           |
| `classes`                                        | `(academic_year_id, name)`                                                                                                                       | identik dengan constraint target sendiri                                                       |
| `rooms`                                          | `(tenant_id, code)`, code dari slug nama                                                                                                         | sumber identifikasi room dari nama saja                                                        |
| `subjects`                                       | `(tenant_id, code)`, code dari slug nama                                                                                                         | sumber identifikasi subject dari nama saja                                                     |
| `enrollments`                                    | `(academic_year_id, student_user_id)`                                                                                                            | konsisten dengan `ux_active_enrollment` target                                                 |
| `teaching_assignments`                           | `(academic_year_id, teacher_user_id, subject_id, class_id)`                                                                                      | constraint unique target sendiri                                                               |
| `duty_assignments`                               | `(academic_year_id, duty_type_id, user_id, scope_class_id, scope_student_id)`, dicek manual (`is not distinct from`) karena kolom scope nullable | constraint unique Postgres menganggap dua NULL berbeda                                         |
| `terms`                                          | `(academic_year_id, sequence)`, sequence = semester (1 ganjil, 2 genap)                                                                          | constraint unique target sendiri                                                               |
| `periods`                                        | `(template_id, sequence)`                                                                                                                        | satu period_template dibuat per label tahun ajaran yang dimigrasikan                           |
| `schedules`                                      | `(academic_year_id, class_id, day_of_week, start_seq)`                                                                                           | dua constraint exclusion di target tidak bisa jadi target `on conflict`, jadi dicek manual     |
| `attendance_sessions`                            | `(schedule_id, date)`                                                                                                                            | constraint unique target sendiri                                                               |
| `attendance_entries`                             | `(session_id, student_user_id)`                                                                                                                  | constraint unique target sendiri                                                               |
| `class_journals`                                 | `(academic_year_id, teacher_user_id, class_id, subject_id, lesson_date)`                                                                         | constraint unique target sendiri                                                               |
| `violation_types`                                | `(tenant_id, code)`, code dari `violations.violation_code` sumber apa adanya                                                                     | constraint unique target sendiri; sumber sudah punya kode pendek                               |
| `violation_records`                              | `(academic_year_id, student_user_id, violation_type_id, occurred_on)`, dicek manual                                                              | target tak punya constraint unique sendiri; lihat gap soal pengulangan di hari yang sama       |
| `workflow_instances` (exit_permit/leave_request) | `(tenant_id, subject_user_id, kind, opened_at)`, dicek manual                                                                                    | sumber tak punya id yang disimpan di baris target; `opened_at` presisi detik cukup unik        |
| `assessment_components`                          | `(academic_year_id, term_id, class_id, subject_id, code)`                                                                                        | constraint unique target sendiri; lihat "Penilaian" soal kenapa `class_id` perlu diturunkan    |
| `grades`                                         | `(component_id, student_user_id)`                                                                                                                | constraint unique target sendiri                                                               |
| `report_scores`                                  | `(academic_year_id, term_id, class_id, subject_id, student_user_id)`                                                                             | constraint unique target sendiri                                                               |
| `grade_publications`                             | `(academic_year_id, term_id, class_id, subject_id)`                                                                                              | constraint unique target sendiri, identik dengan key sumber sendiri                            |
| `star_events`                                    | `(academic_year_id, class_id, student_user_id, teacher_user_id, created_at, delta)`, dicek manual                                                | target tak punya constraint unique sendiri (siswa memang bisa dapat bintang sama berkali-kali) |
| `library_titles`                                 | `(tenant_id, isbn)` bila ada, jika tidak `(tenant_id, title, author)`                                                                            | sumber selalu punya isbn di data sekolah ini; fallback untuk yang tidak                        |
| `library_copies`                                 | `(tenant_id, barcode)`                                                                                                                           | constraint unique target sendiri; lihat "Perpustakaan" soal asal barcode                       |
| `library_loans`                                  | `(tenant_id, copy_id, member_user_id, borrowed_at)`, dicek manual                                                                                | target hanya punya constraint "satu loan aktif per copy", bukan key alami penuh                |
| `library_visits`                                 | `(tenant_id, member_user_id, visited_at, purpose)`, dicek manual                                                                                 | target tak punya constraint unique sendiri                                                     |

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

## Dua perbaikan dari pass sebelumnya

- **Nomor HP dobel**: dua user di data sekolah ini berbagi satu nomor HP
  yang sama -- target melarang ini (`unique (tenant_id, phone)`). Pass
  sebelumnya membiarkan seluruh baris `users` gagal migrasi begitu insert
  pertama kena constraint itu. Sekarang `migrateUsers`
  (`apps/api/cmd/etl/migrate_identity.go`) mencoba dulu dengan nomor HP;
  begitu gagal karena `isPhoneUniqueViolation`, dicoba ulang tanpa nomor HP
  di savepoint baru. User tetap termigrasi (tanpa telepon), dicatat sebagai
  gap `"user %d: phone number dropped, ..."` supaya sekolah bisa
  membetulkan nomornya belakangan.
- **Baris yatim di `model_has_roles`**: baris yang menunjuk ke user id yang
  sudah tak ada di sumber (user dihapus permanen tapi role assignment-nya
  tak pernah dibersihkan) dulu hanya kehitung kalau langkah duty kebetulan
  mengiterasinya -- yaitu hanya untuk role yang punya padanan duty (BK,
  Picket, Pustakawan, Security), sehingga baris yatim dengan role lain
  (Class Administrator, Customer, Supervisor, dst.) tak pernah kehitung
  sama sekali. `FetchUserRoles` (`apps/api/cmd/etl/source_identity.go`)
  sekarang join ke `users` supaya baris yatim tak pernah masuk
  `userRoles`, dan `CountOrphanedRoleAssignments` menghitungnya sekali,
  independen dari role apa yang dipegang, dilaporkan sebagai satu baris gap
  agregat di tabel `duty_assignments`.

## Presensi

`attendances` + `attendance_details` dimigrasikan ke `attendance_sessions`

- `attendance_entries` (`apps/api/cmd/etl/migrate_attendance.go`).
  `attendance_details` adalah tabel terbesar di sumber (~163k baris secara
  keseluruhan, lintas kedua semester) -- `FetchAttendanceEntries`
  (`source_attendance.go`) membacanya lewat keyset pagination
  (`attendanceEntryBatchSize = 5000`) alih-alih satu query tak terbatas,
  supaya tak ada satu hasil query yang harus ditampung penuh sekaligus.

* **Guru vs pengganti**: `attendances.teacher_id` adalah yang benar-benar
  mengisi presensi; `replaced_teacher_id`, kalau terisi, adalah guru yang
  seharusnya mengajar menurut jadwal (dikonfirmasi dari data sungguhan:
  `replaced_teacher_id` selalu sama dengan guru di `teacher_classes` untuk
  jadwal itu). Jadi `attendance_sessions.teacher_user_id` diisi dari
  `replaced_teacher_id` (atau `teacher_id` kalau tak ada penggantian), dan
  `substitute_user_id` dari `teacher_id` hanya kalau ada penggantian.
* **Pemetaan status**: kata Indonesia penuh di sumber diterjemahkan ke kode
  satu huruf default target (`mapping.MapAttendanceStatus`,
  `mapping/identity.go`):

  | Sumber (`attendance_details.status`) | Target (`attendance_entries.status_code`) |
  | ------------------------------------ | ----------------------------------------- |
  | `Hadir`                              | `H`                                       |
  | `Sakit`                              | `S`                                       |
  | `Izin`                               | `I`                                       |
  | `Dispen`                             | `D`                                       |
  | `Alpha`                              | `A`                                       |

  Catatan "-" (placeholder "tidak ada catatan" dari aplikasi lama)
  diperlakukan sama dengan kosong/null.

* **Sesi di luar `schedule_version` yang dipilih**: `attendances.schedule_id`
  menunjuk baris `schedules` sumber apa adanya, tak difilter ke satu
  `schedule_version`. Kalau kelas itu jadwalnya direvisi di tengah semester
  tapi revisinya tak pernah ditandai `status = 'active'` di sumber,
  sebagian presensi menunjuk jadwal di revisi itu -- di luar satu
  `schedule_version` yang dipilih run ini (lihat "Pemilihan
  schedule_version"). Baris begini gagal migrasi dengan alasan eksplisit
  dan kehitung sebagai satu gap agregat, bukan sekadar "gagal" tanpa
  penjelasan.
* Berjalan penuh untuk satu semester (26.291 baris `attendance_details`, DB
  sekolah sungguhan) makan waktu sekitar seperempat dari total waktu run
  penuh -- lihat "Waktu run" di bawah untuk angka keseluruhan.

## Jurnal kelas

`journals` dimigrasikan ke `class_journals`
(`apps/api/cmd/etl/migrate_journal.go`). Semua baris di data sekolah ini
`type = 'guru'`; `'siswa'`/`'bk'` ada di enum sumber tapi tak pernah dipakai
-- kalau muncul, dihitung sebagai gap agregat, bukan dipetakan (target
`class_journals` guru saja). Sumber tak punya kolom topik terpisah
(`title` selalu kosong) atau teks polos: `content` satu paragraf berbalut
HTML dari editor WYSIWYG lama. `mapping.StripHTMLTags` (baru,
`mapping/text.go`) membuang tag-nya; hasilnya jadi `activities` penuh, dan
`mapping.Truncate` ke 300 karakter jadi `topic` (target `topic` punya
`check (length <= 300)`). `teacher_user_id` dan `written_by_user_id`
disamakan (`journals.user_id`) karena sumber tak membedakan siapa yang
menulis dari siapa guru kelasnya; `class_id`/`subject_id` diambil dari
`teacher_classes` milik jadwal itu, bukan dari user_id, supaya benar
walau penulisnya kebetulan guru pengganti.

## Disiplin

`violations` -> `violation_types`, `student_has_violations` ->
`violation_records` (`apps/api/cmd/etl/migrate_discipline.go`).

- `violation_types.category` selalu default `'general'` -- sumber tak
  punya kolom kategori.
- `points_snapshot` diisi dari nilai poin `violation_types` _saat ini_:
  sumber tak simpan riwayat perubahan poin, jadi ini bukan poin persis
  pada saat pelanggaran terjadi kalau poinnya pernah diubah sejak itu.
- `violation_records` tak punya constraint unique di target (siswa memang
  bisa kena pelanggaran yang sama lebih dari sekali), jadi key alami manual
  `(student, violation_type, occurred_on)` dipakai supaya run ulang
  idempoten -- konsekuensinya, kalau ada dua baris sumber persis sama
  (siswa+jenis+hari) yang sama, keduanya kolaps jadi satu baris target.
  Kejadian ini jarang (4 kelompok di data sekolah ini) dan dicatat sebagai
  gap agregat, bukan didiamkan.
- **`suspensions`**: tak dimigrasikan sama sekali. Target tak punya entitas
  skorsing terpisah dari `violation_records` (poin) dan `warning_letters`
  (ambang batas); memaksakan 4 baris sumber ke salah satu tabel itu berarti
  mengarang data yang tak benar-benar sama maknanya. Dicatat sebagai gap
  di tabel laporan `suspensions` tersendiri (read-only, tak pernah
  create/update).

## Perizinan (exit permit dan leave request)

`student_permits` -> `workflow_instances` (kind `exit_permit`) +
`exit_permits`; `permits` -> `workflow_instances` (kind `leave_request`) +
`leave_requests` (`apps/api/cmd/etl/migrate_permits.go`). Kedua tabel sumber
tak punya `year_id`, jadi keduanya difilter lewat `created_at` dalam
rentang tanggal semester yang dipilih (`years.start_date`/`end_date`
sumber sendiri untuk run itu).

**Hanya instance yang sudah final yang dimigrasikan** -- instance yang
masih mid-flow tak berguna dibawa: statusnya akan berubah lagi di sistem
lama sebelum cutover, dan kalaupun tidak, tak ada cara memverifikasi
approver/timestamp tiap stage-nya dari sini.

- `student_permits.status`: `completed` dan `expired` dianggap final;
  `approved` (disetujui tapi belum keluar gerbang) dan `out` (sudah keluar,
  belum kembali) masih mid-flow, dilewati. `permit_type = 'late'`
  (check-in terlambat lewat tabel yang sama) dilewati juga -- itu alur
  `late_arrival`, di luar cakupan pass ini.
- `permits`: kombinasi `class_admin_approve = 0` (ditolak wali kelas, tahap
  pertama) atau `bk_approve = 1 and class_admin_approve = 1` (kedua tahap
  disetujui) dianggap final; kombinasi lain (masih `NULL` di salah satu
  tahap) masih mid-flow, dilewati.
- **`workflow_definitions`**: `ensureWorkflowDefinition`
  (`migrate_permits.go`) memastikan definisi versi 1 ada untuk tenant,
  memakai stage bawaan yang sama dengan
  `internal/modules/permits/domain.DefaultStages` -- persis logika
  `service.EnsureDefaultDefinitions` yang biasanya baru jalan saat
  aplikasi butuh, dipanggil lebih awal di sini karena
  `workflow_instances.definition_id` tak boleh null.
- **Kategori leave request**: `permit_name` sumber dipetakan ke
  `leave_requests.category` (`mapLeaveCategory`, `migrate_permits.go`):
  `Upacara Agama` -> `religious_ceremony`, `Sakit` -> `sick`, `Lainnya` ->
  `other` (alasan bebas dari `other_permits`). `Urusan Keluarga` (urusan
  keluarga) tak punya padanan persis -- bukan `dispensation` (kategori
  izin resmi untuk tugas sekolah) -- jadi ikut default ke `other` dengan
  labelnya sendiri sebagai alasan bebas.
- **Periode default**: sekitar seperempat baris `student_permits` final di
  data sekolah ini tak punya `start_period_id`/`end_period_id` (target
  mewajibkan keduanya). Default ke periode pertama tenant (`firstPeriod`,
  `migrate_permits.go`), dicatat sebagai gap agregat.
- **Tak ada kolom approver**: `permits` hanya simpan flag boolean per
  tahap, bukan siapa yang menyetujui -- `leave_requests.issued_by` selalu
  null, dicatat sebagai gap agregat (berlaku utk semua baris, bukan
  kadang-kadang).
- `destination` (exit permit, wajib diisi) diisi dari `student_permits.reason`
  -- sumber tak punya kolom "tujuan" terpisah dari "alasan".
- Event per-stage (`workflow_events`) tak direkonstruksi -- tugasnya "onto
  the workflow instances", bukan riwayat tiap tahap persetujuan; timestamp
  approval terakhir yang tersedia dipakai sebagai `issued_at`/`closed_at`
  saja.

## Penilaian

`learning_objectives` + `grades` -> `assessment_components` + `grades`;
`report_scores` + `previous_grades` -> `report_scores`; `grade_publications`
-> `grade_publications`; `classroom_star_awards` -> `star_events`
(`apps/api/cmd/etl/migrate_grading.go`).

- **`assessment_components` diturunkan, bukan dipetakan langsung**:
  `learning_objectives` sumber tak terikat kelas -- satu tujuan
  pembelajaran dipakai lintas semua kelas yang diajar guru itu untuk mapel
  yang sama -- padahal target `assessment_components.class_id` wajib
  diisi. `migrateAssessmentComponents` membentuk satu component target per
  pasangan `(learning_objective, class)` yang benar-benar muncul di
  `grades.group_id`, bukan dari `learning_objectives` sendirian.
- **Jenis**: `learning_objectives.type` (`TP`, `Sumatif`, `Praktik`,
  `Lainnya`) dipetakan ke `assessment_components.kind`
  (`mapping.MapAssessmentKind`, `mapping/grading.go`): `TP` -> `formative`,
  `Sumatif` -> `summative`, `Praktik` -> `practical`, selebihnya ->
  `other`.
- **`automatic_score` tak ada di sumber**: sumber cuma simpan
  `report_scores.manual_final_score` (override manual), tak simpan nilai
  otomatis hasil hitungan. ETL menghitungnya sendiri sebagai rata-rata
  polos nilai `grades` siswa itu yang sudah termigrasi untuk
  kelas/mapel/term yang sama -- angka yang sama yang dulu di-override oleh
  `manual_final_score`. `final_score` memakai override manual kalau ada,
  kalau tidak memakai rata-rata itu.
- `previous_grades` -> `report_scores.previous_score`, dicocokkan lewat
  `(class, subject, student)` sumber, bukan tabel target lain.
- Baris `grades` dengan `score` null (belum dinilai) dilewati -- kolom
  target tak boleh null.
- `classroom_star_awards` dengan `stars = 0` dilewati -- target
  `check (delta <> 0)`.

## Perpustakaan

`books` -> `library_titles`; `books` + riwayat `book_loans.book_code` ->
`library_copies`; `book_loans` -> `library_loans`; `library_visits` ->
`library_visits` (`apps/api/cmd/etl/migrate_library.go`).
`library_settings` tak dimigrasikan ke tabel manapun -- lihat di bawah.

- **Eksemplar direkonstruksi, bukan dipetakan langsung**: sumber tak punya
  tabel per-eksemplar, cuma `books.stock` (hitungan agregat) dan
  `book_codes` (pool kode barcode lepas, tak terikat buku manapun).
  `migrateLibraryCopies` membentuk `max(stock, jumlah kode historis
berbeda)` eksemplar per buku: eksemplar pertama sebanyak kode yang
  pernah dipakai di `book_loans` untuk buku itu (urut dari peminjaman
  pertama) memakai kode itu sebagai barcode asli (bisa dikenali), sisanya
  (untuk mencapai jumlah stok) dapat barcode sintetis `SION-<book_id>-<n>`.
  49 kode di data sekolah ini pernah dipakai untuk lebih dari satu buku
  (kesalahan input data sumber, bukan eksemplar yang benar-benar sama) --
  dideduplikasi tenant-wide; kode yang sudah dipakai buku lain jatuh ke
  barcode sintetis untuk buku berikutnya.
- **`stock` kadang lebih kecil dari riwayat**: kalau jumlah kode historis
  berbeda melebihi `stock` saat ini (eksemplar pernah hilang/ditarik tanpa
  `stock` diperbarui), jumlah eksemplar dinaikkan mengikuti riwayat,
  dicatat sebagai gap agregat.
- **Loan aktif dobel per copy**: target mengizinkan maksimal satu loan
  `active` per copy (`unique(active_copy_id)`), tapi 357 kelompok
  `(book_id, book_code)` di sumber punya lebih dari satu loan `status =
'active'` sekaligus -- indikasi buku dipinjamkan lagi tanpa proses
  pengembalian resmi tercatat. Hanya loan `active` dengan id tertinggi per
  kelompok yang tetap `active` di target; yang lebih lama dipetakan jadi
  `returned` (buku itu, menurut data sumbernya sendiri, tak mungkin
  dipinjamkan lagi kalau belum kembali), dicatat sebagai gap agregat.
- **Status copy**: dihitung sekali di akhir lewat satu `update` (bukan per
  baris loan): sebuah copy jadi `on_loan` kalau punya loan `active` di
  target, sisanya `available`. Ini memastikan "loan yang masih keluar di
  sumber, keluar juga di target" tanpa bergantung urutan pemrosesan loan.
- `book_loans.status`: `active` dan `overdue` sama-sama jadi `active`
  target (target tak simpan status terlambat terpisah, dihitung dari
  `due_on`); `returned` -> `returned`.
- 15 baris `book_loans` tak punya `book_code` sama sekali -- tak bisa
  dikaitkan ke eksemplar manapun, gagal migrasi dengan alasan eksplisit.
- `book_loans` tak punya kolom catatan di target (`library_loans` tak
  punya kolom `notes`); `book_loans.notes` sumber tak dimigrasikan.
- **`library_settings`**: dibaca (untuk laporan) tapi tak ditulis ke tabel
  manapun -- nilainya (`default_loan_duration`, `loan_duration_options`,
  dst.) adalah keputusan kebijakan sekolah, bukan data operasional; target
  punya `library_policies` (config JSON bervensi) yang lebih cocok diisi
  manual oleh sekolah lewat aplikasi daripada diterjemahkan otomatis dari
  bentuk key/value sumber. Nilainya dicatat di laporan sebagai gap supaya
  sekolah tahu apa pengaturan lamanya.

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

## Yang di luar cakupan

Modul berikut **sengaja** tak disentuh sama sekali, bukan hanya ditunda:

- **`special_permit_*`** (program izin massal/terjadwal -- beda alur dari
  `permits`/`student_permits`, tak diminta dan tak ada padanan target yang
  jelas).
- **Koperasi** (`coop_*`), **LMS** (`lms_*`, `hbg_*`), **supervisi/mentoring**
  (`supervisions`, `mentor_*`), dan modul lain di luar delapan area di atas
  (identitas, akademik, presensi, jurnal, disiplin, perizinan, penilaian,
  perpustakaan) -- di luar cakupan ETL ini sama sekali.

Tidak ada perubahan migrasi Postgres, OpenAPI, atau web akibat pekerjaan
ETL ini: ETL murni backend, dijalankan lewat CLI oleh operator/developer.

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

## Waktu run

Run penuh (satu semester, `--source-year "2026/2027" --source-semester
ganjil`, DB sekolah sungguhan lewat `docker exec`) makan waktu sekitar 3
menit 35 detik dari baris perintah sampai laporan tertulis, dry-run maupun
sungguhan -- selisihnya kecil karena baik rollback maupun commit menguji
constraint yang sama banyaknya. Sebagian besar waktu itu di ~86 ribu
statement per-baris (tiap insert/update/select jadi satu round-trip
tersendiri lewat savepoint, per `store.go`), bukan di pembacaan sumber:
membaca seluruh sumber (termasuk `attendance_details` yang di-batch) hanya
beberapa detik. Menjalankan kedua semester (ganjil lalu genap) untuk
migrasi historis penuh berarti dua kali waktu ini.
