# 13. ETL dari SION

`apps/api/cmd/etl` memigrasikan satu database SION (MySQL, versi lama) ke satu
tenant newsekolah (Postgres) yang sudah dibuat lewat wizard onboarding. Alat
ini satu arah (SION tidak pernah ditulis), idempoten pada key alami, dan
dirancang untuk dijalankan berulang kali selama SION tetap hidup, sesuai
mitigasi risiko "migrasi data lama gagal sebagian" di `docs/12-roadmap.md`.

## Cara menjalankan

```sh
cd apps/api
go run ./cmd/etl \
  --source-dsn "sion_ro:password@tcp(sion-db-host:3306)/sion?tls=preferred" \
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
`apps/api/internal/platform/config`.

Poin penting:

- `--tenant` harus tenant yang **sudah ada** (dibuat oleh wizard onboarding).
  ETL tidak pernah membuat tenant baru.
- `--source-year`/`--source-semester` memilih satu baris `academic_years`
  SION lewat key alaminya sendiri (`year_label`, `semester`) --
  lihat "Tahun ajaran dan semester" di bawah untuk kenapa satu semester SION
  dimigrasikan sekaligus, bukan satu tahun penuh.
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
   punya tahun ajaran dengan label yang sama; SD/SMP/SMA/SMK semua memakai
   pola ini).
2. Role dan duty type sistem (`authz.RoleDefaults()` dan daftar duty yang
   sama dengan `cmd/seed`) -- dipastikan ada, bukan dibuat ulang bila tenant
   sudah onboarding normal.
3. Users, role assignment, dan profile (`user_profiles` +
   `student_profiles`/`teacher_profiles`/`staff_profiles`).
4. Grade level (diturunkan dari nama kelas SION) dan classes.
5. Subjects.
6. Enrollments (butuh users + classes).
7. Teaching assignments (butuh users + classes + subjects).
8. Duty assignments, termasuk menandai `classes.homeroom_teacher_id` untuk
   wali kelas.
9. Period template + periods (butuh tahun ajaran).
10. Schedules (butuh users + classes + subjects + periods).
11. Attendance sessions lalu attendance entries (butuh schedules).
12. Violation types lalu violation records.
13. Warning letters.
14. Leave requests yang berstatus `issued` (lihat "Permits" di bawah).

Urutan ini persis urutan pemanggilan di `runMigrationSteps`
(`apps/api/cmd/etl/run.go`).

## Key alami per tabel

| Tabel target                        | Key alami                                                                                                                                        | Alasan                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `users`                             | `(tenant_id, username)`, dari NISN/NIP/username SION                                                                                             | usernane unik di kedua sisi                                                                |
| `student_profiles`                  | NISN dulu, lalu NIS, lalu username                                                                                                               | NISN unik nasional; SION sering kosongkan salah satu                                       |
| `teacher_profiles`/`staff_profiles` | NIP dulu, lalu username                                                                                                                          | NUPTK sering kosong di SION, tidak dipakai sebagai key                                     |
| `grade_levels`                      | `(tenant_id, code)`, code dari huruf depan nama kelas SION                                                                                       | SION tidak punya tabel grade level                                                         |
| `classes`                           | `(academic_year_id, name)`                                                                                                                       | identik dengan constraint SION sendiri                                                     |
| `subjects`                          | `(tenant_id, code)`, code dari slug nama                                                                                                         | SION identifikasi subject dari nama saja                                                   |
| `enrollments`                       | `(academic_year_id, student_user_id)`                                                                                                            | identik dengan `unique_student_class_year` SION                                            |
| `teaching_assignments`              | `(academic_year_id, teacher_user_id, subject_id, class_id)`                                                                                      | identik dengan `unique_teacher_subject_class_year` SION                                    |
| `duty_assignments`                  | `(academic_year_id, duty_type_id, user_id, scope_class_id, scope_student_id)`, dicek manual (`is not distinct from`) karena kolom scope nullable | constraint unique Postgres menganggap dua NULL berbeda                                     |
| `periods`                           | `(template_id, sequence)`                                                                                                                        | satu period_template dibuat per tahun SION yang dimigrasikan                               |
| `schedules`                         | `(academic_year_id, class_id, day_of_week, start_seq)`                                                                                           | dua constraint exclusion di target tidak bisa jadi target `on conflict`, jadi dicek manual |
| `attendance_sessions`               | `(schedule_id, date)`                                                                                                                            | identik dengan `unique_attendance_session_schedule_date` SION                              |
| `attendance_entries`                | `(session_id, student_user_id)`                                                                                                                  | identik dengan `unique_attendance_entry_student` SION                                      |
| `violation_types`                   | `(tenant_id, code)`, code dari slug nama                                                                                                         | SION identifikasi violation dari nama saja                                                 |
| `violation_records`                 | `(academic_year_id, student_user_id, violation_type_id, occurred_on, reporter_user_id)`                                                          | SION tidak punya key alami untuk satu insiden                                              |
| `warning_letters`                   | `(tenant_id, academic_year_id, letter_number)`                                                                                                   | identik dengan `uq_warning_letter_number` SION                                             |
| `leave_requests`                    | `(tenant_id, letter_number)`                                                                                                                     | identik dengan `ux_leave_requests_letter_number` target                                    |

Semua transformasi di atas (role, duty, gender, status kepegawaian, status
presensi, tanggal/zona waktu, dan aturan key alami) adalah fungsi murni di
`apps/api/cmd/etl/mapping`, diuji lewat unit test
(`go test ./cmd/etl/mapping/...`). Bagian database (`apps/api/cmd/etl/*.go`
di root paket, bukan di `mapping/`) tidak diuji unit karena butuh Postgres
dan MySQL sungguhan; itu diverifikasi lewat run paralel manual (lihat di
bawah).

## Password

SION memakai bcrypt (`golang.org/x/crypto/bcrypt`, lihat
`reference/sion/backend/cmd/api/main.go`); newsekolah memakai argon2id
(`apps/api/internal/platform/auth/password.go`). **Hash password tidak bisa
dipindahkan** karena algoritmanya berbeda. Setiap user yang dimigrasikan:

- mendapat hash argon2id acak (bukan hash SION-nya, dan bukan password yang
  bisa ditebak),
- diset `must_change_password = true`,
- harus login lewat alur lupa password (reset lewat WhatsApp/email) pada
  login pertama di sistem baru.

Ini dicatat di laporan sebagai bagian dari setiap baris `users`, bukan
sebagai gap terpisah, karena berlaku untuk semua user tanpa kecuali.

## Yang tidak bisa dipetakan (gap)

Dicatat di laporan (`gaps` per tabel), bukan direka:

- **Role tanpa padanan**: SION tidak punya role "parent" (orang tua tidak
  punya akun terpisah di SION); user dengan role SION yang tidak dikenal
  `mapping.MapRole` dilaporkan, tidak diberi role apa pun.
- **Duty tanpa padanan**: nama duty bebas teks di SION
  (`teacher_additional_duties.name`, `employee_additional_duties.name`); yang
  tidak cocok dengan salah satu kata kunci di `mapping.MapDuty` (wali kelas,
  BK, piket, wakil kepala sekolah, satpam, perpustakaan) dilaporkan sebagai
  gap dan tidak dibuatkan duty type baru.
- **`joined_on` enrollment yang kosong**: SION sering tidak mengisi
  `joined_at`; ETL memakai tanggal mulai tahun ajaran sebagai default dan
  mencatatnya sebagai gap per siswa.
- **`threshold_points` pada warning letter**: SION hanya menyimpan
  `total_points` saat surat diterbitkan, bukan ambang batas SP-nya sendiri
  (ambang batas ada di `violation_sp_settings`, di luar cakupan ETL ini);
  `threshold_points` diisi sama dengan `total_points` sebagai pendekatan.
- **Exit permit (`student_exit_permits`)**: **tidak dimigrasikan sama
  sekali**. Ini surat izin keluar sekali pakai, satu hari, dengan siklus
  hidup token QR di gerbang -- nilainya operasional, bukan historis. Target
  juga punya exclusion constraint "satu exit permit aktif per hari per
  siswa" dan siklus `gate_token`/scan yang tidak masuk akal direplai untuk
  data lama. Jumlahnya dihitung dan dilaporkan sebagai gap per run.
- **Late arrival (`student_late_arrivals`)**: **tidak dimigrasikan**. Alur
  disiplin sehari (telepon orang tua/pulangkan) tanpa surat, tidak ada nilai
  historis jangka panjang. Jumlahnya dihitung dan dilaporkan sebagai gap.
- **Leave request yang belum final**: hanya yang berstatus `issued` (surat
  sudah terbit, punya `letter_number`) yang dimigrasikan. Yang masih
  `pending_homeroom`/`pending_bk` dilaporkan sebagai gap dengan jumlahnya --
  status "sedang berjalan" tidak bisa direplai dengan aman ke workflow
  engine baru (lihat di bawah) tanpa tahu siapa approver berikutnya di
  sistem baru.
- **Konseling (`counselings` di target, tidak ada padanan langsung di
  SION)** dan **`period_day_assignments`** (hari mana pakai template periode
  yang mana) tidak diisi oleh ETL ini; keduanya kebijakan sekolah yang
  ditentukan saat onboarding, bukan data historis.

### Kenapa leave request yang `issued` tetap dimigrasikan lewat workflow engine

Target menyimpan `leave_requests` sebagai anak dari `workflow_instances`
(mesin workflow generik, `docs/06-database-schema.md` bagian 7), bukan tabel
mandiri seperti di SION. ETL memastikan tenant punya satu
`workflow_definitions` aktif berjenis `leave_request` (memakai yang sudah ada
dari onboarding, atau membuat definisi minimal satu tahap bila belum ada),
lalu membuat satu `workflow_instances` berstatus `completed` untuk tiap surat
izin yang sudah terbit. Ini aman karena constraint "satu instance
in-progress per hari" (`ux_workflow_instances_one_exit_permit_per_day`) hanya
berlaku untuk `kind = 'exit_permit'`, dan instance yang dibuat langsung
`completed` tidak pernah masuk state `in_progress`/`approved` yang dijaga
constraint lain.

## Prosedur run paralel yang disarankan

1. **Persiapan**: buat tenant lewat wizard onboarding (jenjang, tahun
   ajaran, domain). Jangan isi data operasional lain -- biarkan ETL yang
   mengisi.
2. **Dry run** dengan `--dry-run`, review `etl-report.json` dan ringkasan
   stdout. Perhatikan baris `failed` (bug dalam data SION yang perlu
   dibersihkan di sumber sebelum run sungguhan) dan `gaps` (yang memang
   tidak akan pernah terisi, informasikan ke sekolah).
3. **Run pertama** tanpa `--dry-run`. SION tetap jadi sistem yang dipakai
   sekolah sehari-hari.
4. **Jalankan ETL setiap malam** (cron/CI) selama periode paralel (dua
   minggu, sesuai `docs/12-roadmap.md`). Setiap run meng-update baris yang
   berubah di SION dan menambah baris baru; baris yang sudah ada dan tidak
   berubah muncul sebagai `skipped`, bukan `updated`, jadi laporan tiap
   malam menunjukkan persis apa yang berubah hari itu.
5. **Verifikasi**: bandingkan jumlah baris `read` per tabel di laporan
   dengan jumlah baris di SION untuk tahun ajaran yang sama (`select count(*)
...`). Jumlah harus sama persis dikurangi baris yang memang gap
   (tercatat di laporan).
6. **Potong (cutover)**: setelah sekolah setuju data sudah identik dan tim
   sudah mengomunikasikan `must_change_password` ke semua user, matikan akses
   tulis ke SION (read-only atau nonaktif), lakukan satu run ETL terakhir,
   lalu sekolah pindah sepenuhnya ke newsekolah.

## Tahun ajaran dan semester

SION menyimpan `academic_years` per (label, semester) -- satu tahun ajaran
Indonesia "2026/2027" punya dua baris SION (ganjil, genap), sedangkan target
menyimpan satu baris per label dengan `terms` terpisah untuk semester. Untuk
menjaga scope ETL ini tetap jelas, satu run memigrasikan **satu semester
SION** ke **satu tahun ajaran target** (label yang sama dipakai untuk kedua
semester). Menjalankan ETL dua kali berturut-turut (`--source-semester
ganjil` lalu `--source-semester genap`) memigrasikan tahun ajaran penuh;
data yang sama pada kedua semester (misalnya siswa yang tidak pindah kelas)
akan ter-upsert, bukan dobel.

## Yang sengaja tidak dikerjakan di slice ini

- Tidak ada file migrasi baru (nomor 0058-0061 dikerjakan agent lain di
  worktree paralel).
- Tidak ada perubahan OpenAPI atau web: ETL murni backend, dijalankan lewat
  CLI oleh operator/developer, bukan lewat UI.
- Tidak ada dukungan multi-sumber (menggabungkan lebih dari satu database
  SION ke satu tenant) -- di luar cakupan roadmap Fase 3.
