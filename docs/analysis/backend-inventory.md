# Lampiran C. Inventaris Backend Go SION (kode lama)

Sumber: `reference/sion/backend` (baseline) dan `reference/sion-rebuild-go/backend` (lebih baru). Stack lama: Go 1.25, `net/http` ServeMux, MySQL tanpa ORM, JWT HS256, Redis (pub/sub saja), gorilla/websocket, webpush-go, excelize, DOCX/SVG dirakit manual. Tanpa layering: semua handler menulis SQL langsung. Ukuran 19.849 baris; `main.go` 2.684 baris, `academic_scope.go` 2.042 baris.

## 1. Inventaris modul

### 1.1 Middleware dan routing (`main.go:385-571`)

```
http.ListenAndServe(addr, cors(mux))
  cors -> mux -> withAuth (opsional) -> withPermission(perm) (opsional) -> handler(w, r, user)
```

Tidak ada logging, request-id, recovery, timeout, atau batas body. `withAuth` menjalankan 2-3 query DB per request tanpa cache. Boot: baca `JWT_SECRET` (fallback hardcoded), buka MySQL tanpa tuning pool, buat hub realtime, mulai worker notifikasi, jalankan `initCounselingTable` (DDL saat runtime).

### 1.2 Auth dan sesi (`main.go`, `impersonation.go`)

| Method | Path                           | Guard                           |
| ------ | ------------------------------ | ------------------------------- |
| GET    | `/health`                      | publik                          |
| POST   | `/api/auth/login`              | publik                          |
| GET    | `/api/auth/me`                 | withAuth                        |
| POST   | `/api/auth/logout`             | withAuth                        |
| POST   | `/api/auth/impersonation/stop` | withAuth                        |
| POST   | `/api/users/{id}/impersonate`  | withAuth + cek admin di handler |

Aturan login: username lowercase + trim; bcrypt; hanya user `active`; setting `auth.session_days` (1-365, default 1) dan `auth.single_device`; bila single device: `active_session_id` acak dan semua push subscription user dihapus; TTL token = session_days x 24 jam; catat `user_login_events`; respons `{token, user}` di body, bukan cookie; tanpa refresh token.

JWT claims: `uid, role, sid, actor_id, impersonation_id, sub, iat, exp` (HS256). `withAuth`: parse bearer, tolak selain HS256, user harus aktif, cocokkan `sid` bila single device dan bukan impersonasi, catat request impersonasi. Logout hanya null-kan `active_session_id` dan hapus push; token tetap sah sampai exp.

Impersonasi: hanya super_admin/admin; tidak boleh bersarang; target aktif dan bukan diri sendiri; admin tidak boleh impersonasi super_admin; TTL 30 menit hardcoded; audit `user_impersonation_events` dan `user_impersonation_actions` per request; `stop` hanya set `ended_at`, token tidak dicabut; IP dari `X-Forwarded-For` tanpa trusted proxy.

Multi-role (042): role utama = `ORDER BY is_primary DESC, created_at, role_id LIMIT 1`; `user.Roles` semua role; permission = union. Validasi: role utama wajib role sistem; role tambahan hanya custom; hanya super_admin boleh memberi super_admin. Hampir semua logika memakai `user.Role ==` (role utama), bukan `hasRole`.

Permission turunan tugas (dihitung tiap request): guru kehilangan `review_leave_requests` dan `issue_leave_letters` dari role lalu mendapatkannya kembali hanya bila punya `teacher_duty_assignments` aktif dengan `grants_leave_homeroom_review` (scope class) atau `grants_leave_issuance`; pegawai dengan `grants_exit_security` mendapat `scan_exit_permits`.

### 1.3 Role dan permission

`GET /api/roles` (view_roles); `POST /api/roles`, `PUT/DELETE /api/roles/{role}`, `PUT /api/roles/{role}/permissions` (manage_permissions). Slug a-z0-9 dan `_`, 3-50 char; nama >= 3; role sistem tidak bisa di-rename/hapus; hapus ditolak bila dipakai; permission super_admin tidak bisa diubah; role guru tidak boleh diberi permission izin secara manual; permission tak dikenal 400; ganti permission dengan DELETE+INSERT dalam transaksi; urutan `FIELD(id, 'super_admin','admin','guru','pegawai','siswa')`.

### 1.4 Settings dan branding

`GET /api/settings/branding` dan `GET /api/settings/modules` publik; `GET/PUT /api/settings/general` (manage_settings).

| Key                                          | Default      | Validasi                                |
| -------------------------------------------- | ------------ | --------------------------------------- |
| app.name                                     | "SION"       | wajib, <= 150                           |
| app.subtitle                                 | "Pecalang"   | <= 150                                  |
| app.logo / app.favicon / leave.letter_header | ""           | data URI WebP <= 2 MB / 512 KB / 700 KB |
| leave.letter_template                        | JSON default | <= 20 KB, field <= 1200                 |
| violation.warning_letter_template            | JSON default | <= 32 KB, field <= 2400                 |
| school.active_until_day                      | friday       | friday/saturday/sunday                  |
| auth.session_days                            | 1            | 1-365                                   |
| auth.single_device                           | false        | bool                                    |
| schedule.teacher_edit_deadline               | ""           | RFC3339 UTC                             |
| attendance.correction_days                   | 3            | 0-365                                   |
| modules.grading_enabled                      | false        | bool                                    |

Upload branding: tolak `blob:`; validasi magic `RIFF....WEBP`; nama `<prefix>-<unixnano>-<token>.webp`; semua dalam satu transaksi upsert.

### 1.5 Users, profil, import

| Method     | Path                                                   | Permission                                    |
| ---------- | ------------------------------------------------------ | --------------------------------------------- |
| GET/POST   | `/api/users`                                           | view_users / create_users                     |
| PUT/DELETE | `/api/users/{id}`                                      | edit_users / delete_users (arsip -> inactive) |
| POST       | `/api/users/{id}/restore`                              | delete_users                                  |
| GET        | `/api/users/{id}/details`                              | view_users atau diri sendiri                  |
| POST       | `/api/users/{id}/reset-password`                       | edit_users                                    |
| PUT        | `/api/profile`; POST `/api/profile/avatar`             | diri sendiri                                  |
| POST       | `/api/user-import/preview`, `/commit`; GET `/template` | create_users                                  |

Aturan: semua operasi user di-scope tahun ajaran aktif via `academic_year_users` (user di luar tahun aktif = 404). ID `user-<timestamp nanodetik>` (rawan tabrakan). Reset password menghasilkan 12 karakter dan mengembalikannya plaintext. Generator acak memakai modulo bias. Tidak bisa mengarsipkan diri sendiri. Detail: `user_details` + salah satu student/teacher/employee dengan DELETE tiga tabel lalu INSERT; admin dan pegawai sama-sama ke `employee_details`. Avatar: multipart <= 10 MB, file <= 2 MB, konversi lewat binary `cwebp`, nama deterministik `avatar_<userID>.webp` publik.

Import: preview dan commit menerima JSON rows (XLSX diparse di frontend), maksimal 5.000 baris; 33 kolom template (username, email, role, password, nik, nama_lengkap, jenis_kelamin, tempat_lahir, tanggal_lahir, agama, alamat, kecamatan, kota, no_telepon, golongan_darah, nis, nisn, tahun_masuk, nama_ayah, nama_ibu, nama_wali, telepon_wali, pekerjaan_orang_tua, sekolah_asal, nip, nuptk, pendidikan_terakhir, status_kepegawaian, tahun_bergabung, spesialisasi_mengajar, nomor_pegawai, jabatan, pengawas); sheet referensi tersembunyi berisi dropdown; validasi username/email unik di file dan DB; commit dalam satu transaksi, role di-reset ke satu role utama (menghapus multi-role); alias role (teacher, student, employee, administrator).

### 1.6 Master data (`academic_scope.go`)

Semua entitas di-scope `academic_year_id` dan menyertakan `active_academic_year` di respons.

| Path                                                          | Guard lama                                   | Catatan                                                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/api/academic-years[/{id}]`, `/activate`, `/active`          | hanya withAuth                               | activate: nonaktifkan semua, aktifkan satu, `INSERT IGNORE academic_year_users` semua user; delete cascade seluruh data |
| `/api/subjects`, `/rooms`, `/classes`, `/violations`          | hanya withAuth                               | nama <= 150 unik per tahun; poin >= 0                                                                                   |
| `/api/periods`, `/period-day-overrides`                       | hanya withAuth                               | sort_order >= 1 unik, start < end; override unik per (tahun, hari, periode)                                             |
| `/api/teacher-additional-duties`, `/teacher-duty-assignments` | manage_master_data                           |                                                                                                                         |
| `/api/teacher-options`                                        | guru / manage_master_data / manage_schedules |                                                                                                                         |
| `/api/teacher-subject-assignments` (+ `/bulk`, delete)        | hanya withAuth                               | sync kelas maksimal 100; id komposit `teacher:subject`                                                                  |
| `/api/employee-duties`, `/employee-duty-assignments`          | manage_master_data                           |                                                                                                                         |

Flag tugas guru: `grants_all_attendance_reports` (laporan semua + koreksi global), `grants_leave_homeroom_review` (wali kelas, butuh scope class), `grants_leave_issuance` (BK), `grants_exit_bk_approval`, `grants_exit_leadership_approval`, `grants_late_arrival_duty` (tidak dipakai), `grants_late_arrival_leadership`. Scope penugasan: global, class, student, custom. Normalisasi hari menerima English dan Indonesia. Mode override periode: normal, friday_short, advanced, custom.

### 1.7 Siswa per kelas (`student_classes.go`)

`GET /api/student-class-assignments`, `/student-class-unassigned` (limit 100), `POST .../bulk`, `DELETE .../{id}`, import `preview`/`commit`/`template`: semuanya hanya withAuth. Upsert status active, `joined_at` COALESCE, `left_at` NULL. Import mengenali siswa via id/username/NIS; aksi assign/unchanged/move (move butuh flag); `create_classes` dan parser CSV adalah dead code.

### 1.8 Jadwal mengajar (`teaching_schedules.go`)

CRUD `/api/teaching-schedules` + hapus semua. `canManage` = super_admin/admin/manage_schedules; guru tanpa manage_schedules hanya jadwal sendiri, `source` dipaksa teacher, dibatasi `schedule.teacher_edit_deadline`. Siswa difilter ke kelasnya. Validasi: hari dalam hari aktif sekolah; kelas/mapel/guru valid; guru wajib punya `teacher_subject_assignments`; periode aktif dan start <= end. Bentrok kelas dan bentrok guru dicek dengan irisan `sort_order` per hari (409 dengan nama guru/mapel); tanpa bentrok ruangan. Jam kontinu digabung (`schedule_ids[]`).

### 1.9 Presensi oleh guru (`teacher_attendance.go`, `teacher_attendance_reports.go`)

Route: `GET /api/teacher-attendance/current`, `/schedules`, `POST /schedules/{id}/session`, `PUT /sessions/{id}/entries`, `GET /report`. Status H, S, I, D, A.

Alur: jadwal hari ini (kosong jika di luar hari aktif; guru melihat jadwal sendiri atau sebagai pengganti accepted; `currentOnly` membatasi ke jam berjalan); sesi dibuat SELECT-then-INSERT (race); payload sesi berisi `meeting_number`, jurnal sebelumnya, siswa dengan `previous_status`, pelanggaran, `late_arrival_pending`, `can_edit_journal`. Simpan: topik dan kegiatan jurnal wajib bersamaan; siswa harus anggota kelas; siswa dengan terlambat belum selesai dilewati; surat izin issued menimpa status menjadi S/D/I; pelanggaran per sesi delete-and-reinsert; `submitted_at` diisi; jurnal ditulis atas nama guru asli; broadcast monitoring.

Koreksi: `?mode=correction|koreksi`; global bila super_admin/admin/correct_attendance/duty laporan semua/BK; wali kelas untuk kelasnya; hari yang sama sampai `end_time:59` boleh; setelah itu batas `tanggal + correction_days + 1`.

Laporan: scope own/all; status harian `BELUM_LENGKAP`, `A`, `A_SEBAGIAN`, seragam, `CAMPURAN`.

### 1.10 Kalender presensi siswa (`student_attendance.go`)

`GET /api/student-attendance/calendar?month=`: `daily_status` + `source` (official/teacher/mixed/none). Surat izin issued menimpa per hari (sick S, dispensation D, lainnya I); izin keluar issued/exited menimpa hari `created_at` menjadi D (menimpa surat izin). Agregasi mayoritas absolut dengan prioritas D, I, S, A, H, selain itu CAMPURAN.

### 1.11 Kelas binaan (`homeroom_class.go`)

`GET /api/homeroom-class` hanya guru wali (403 bila bukan). Filter tanggal, halaman (<= 50), pencarian nama/NIS/NISN, status. Per siswa: identitas, wali, foto, jumlah dan poin pelanggaran, sesi, status harian dengan prioritas A > S > I > D > H > BELUM_TERCATAT. Bug: expected = submitted.

### 1.12 Jurnal kelas (`class_journals.go`)

`/api/class-journal-options`, `/api/class-journals` (GET/POST/PUT), `/download` (docx atau CSV): hanya guru dan hanya jurnal sendiri; wajib penugasan mengajar; unik per tanggal/kelas/mapel; ekspor CSV BOM UTF-8 dan DOCX landscape A4 dengan kop dari `leave.letter_header`.

### 1.13 Guru pengganti (`teacher_substitutions.go`)

`GET/POST /api/teacher-substitutions`, `POST /{id}/respond`, `GET /teacher-substitution-schedules`, `/teacher-substitution-teachers`: hanya guru. Jadwal milik requester; pengganti bukan diri sendiri; weekday tanggal harus cocok hari jadwal; pengganti guru aktif di tahun aktif; unik per jadwal+tanggal; status pending -> accepted/rejected oleh pengganti saja; tanpa cancel; tanpa cek bentrok pengganti; notifikasi DB + WS.

### 1.14 Izin terencana (`student_leave_api.go`, `student_leave_requests.go`)

Route: `GET/POST /api/leave-requests`, `PUT /{id}/review`, `POST /{id}/issue`, `GET /{id}/letter.svg`, publik `GET /api/leave-letters/verify`.

State: `pending_homeroom -> pending_bk -> issued`, atau `rejected`. Kategori religious_ceremony, sick, dispensation, other (alasan dipaksa label default untuk non-other). Wali kelas otomatis dari duty scope class (409 bila tidak ada). Bukti wajib WebP <= 6 MB ke `uploads/private/leave/`; kompensasi manual bila gagal (tanpa transaksi). Snapshot nama. Issue oleh BK: nomor `SION/IZIN/YYYYMMDD/HEX`, sinkron `attendance_entries` untuk semua sesi dalam rentang, event, notifikasi, dalam satu transaksi. Surat SVG A4 794x1123 dengan placeholder `{{student_name}} {{class_name}} {{reason}} {{date_range}} {{letter_number}} {{nis}} {{address}} {{issued_at}} {{homeroom_name}} {{issuer_name}}`; QR digambar palsu. Verifikasi: HMAC-SHA256 dengan JWT secret, 22 karakter, endpoint publik mengembalikan nama, kelas, alasan, tanggal.

### 1.15 Izin keluar / dispensasi (`exit_permit_api.go`, `exit_permit_reports.go`)

Route: `GET/POST /api/exit-permits`, `DELETE /{id}`, `POST /{id}/approve` (siswa scan QR guru), `POST /{id}/gate-token`, `POST /{id}/gate-scan` (pegawai + scan_exit_permits), `GET /report.docx` (BK).

State: `pending_duty_teacher -> pending_class_teacher -> pending_bk -> pending_leadership -> issued -> exited`. Tahap 1 QR guru mana pun (tanpa validasi piket). Tahap 2 guru berbeda dan sedang mengajar kelas itu atau maksimal 2 jadwal berikutnya. Tahap 3 duty `grants_exit_bk_approval`. Tahap 4 duty `grants_exit_leadership_approval`; saat issued `gate_token_expires_at` = akhir periode. Pembuatan: kelas aktif (FOR UPDATE), maksimal 1 per hari, tidak boleh ada yang belum exited, end > start strict, tujuan <= 500, snapshot, event. Gate token acak 32 char hash SHA-256, scan dalam transaksi FOR UPDATE, single use. Cancel bila belum exited (hapus). Laporan DOCX untuk BK.

### 1.16 Terlambat (`late_arrivals.go`)

Route: `GET /api/late-arrivals/current` (siswa), `/reviews` (guru), `POST /scan` (siswa), `POST /{id}/review` (guru).

State: scan QR guru pertama membuat `pending_duty_teacher`; review piket (pilih pelanggaran + lapor wali) -> `pending_leadership`; scan QR wakil kepala (duty `grants_late_arrival_leadership`, guru berbeda) -> `pending_class_teacher`; scan QR guru pengajar kelas (berbeda dari keduanya) -> `completed`. `late_count` = jumlah record tahun aktif + 1; aksi ke-2 dan ke-5 `call_parent`, ke-3 dan ke-6 `send_home`. Guru tidak boleh scan dua kali. Selama belum completed siswa tidak bisa ditandai hadir (lintas hari di baseline). Broadcast WS ke guru pengajar kelas.

### 1.17 Pelanggaran dan SP

Route: `POST/GET /api/student-violations`, `/student-violation-options`, `/student-violation-status`, `GET /api/violation-reports/download` (BK), `POST/GET /api/violation-warning-letters` (+ `/candidates`, `/{id}/download`) (BK), `GET/PUT /api/violation-sp-settings`.

"Guru BK" = role guru dengan permission `issue_leave_letters`. Ambang per tahun default 25/50/75 (validasi naik, <= 100000). `spLevelForPoints`: >= SP3, >= SP2, >= SP1, "Belum SP". Pencatatan: siswa dengan kelas aktif, maksimal 50 pelanggaran per catatan, notes <= 1000, transaksi, notifikasi BK bila level naik (bug: query permission di role, selalu kosong). Penerbitan: level ternormalisasi "SP 1/2/3"; ditolak bila poin belum cukup; idempoten per level; nomor `{{sequence}}/SP-{{sp_level_number}}/{{month_roman}}/{{year}}` dengan sequence COUNT+1 (race); snapshot JSON; DOCX A4 dengan tanda tangan Orang Tua / Siswa / Guru BK. Laporan rekap dan individu menghitung tanggal pertama menembus tiap ambang.

### 1.18 Konseling (`counseling.go`)

Semua route hanya guru BK: list, detail, `report.html`, create, update, delete, opsi siswa (limit 50), upload bukti. Tabel dibuat saat startup. Jenis karir, permasalahan, pribadi, belajar, sosial, lainnya. Wajib siswa, judul, rencana tindak lanjut; parsing tanggal fleksibel. Section laporan berbeda per jenis. Bukti <= 10 MB dikonversi cwebp ke `uploads/counseling/` publik; URL tidak divalidasi saat disimpan. Error SQL mentah bocor ke klien.

### 1.19 Penilaian (`grading.go`, `grading_extended.go`)

Guard `gradingAvailable`: modul aktif; `manage_grades` hanya role utama guru; `view_own_grades` hanya siswa; guru harus punya penugasan kelas+mapel.

Route: `/api/grading/context`, `/components` (CRUD), `/components/{id}/grades`, `/report`, `/publication`, `/report-analysis`, `/report-scores`, `/report-ranges`, `/tp-mappings`, `/report-export` (XLSX), `/stars` (GET/POST/DELETE), `/api/my-grades`, `/api/my-stars`.

Komponen: code uppercase <= 30, tipe tp/sumatif/praktik/lainnya, kktp 0-100, weight 0-100, tidak bisa dihapus bila ada nilai; total bobot tidak divalidasi 100. Nilai akhir = rata-rata berbobot komponen yang ada nilainya; KKTP akhir serupa. Publikasi per (guru, kelas, mapel); siswa hanya melihat yang dipublikasikan. Analisis rapor: bila ada nilai sebelumnya, cari rentang, `automatic = min(previous + increase, 100)`; `final = manual ?? automatic`; peringatan turun dari sebelumnya (danger) atau selisih > 10 dari nilai murni (warning). Rentang tidak boleh tumpang tindih, kenaikan 0-10. Pemetaan TP ke kode ekspor dengan rentang R dan T; ekspor XLSX sheet e-Rapor dengan dropdown T/R. Bintang kelas 1-999, pengurangan LIFO dengan FOR UPDATE tanpa guard total >= 0.

### 1.20 Pengumuman (`announcements.go`)

`GET/POST /api/announcements` (create_announcements), `DELETE /{id}` (delete_announcements), `GET /api/announcement-recipients`. Audience global atau selected; judul <= 180, pesan <= 500, maksimal 5.000 penerima; fan-out `INSERT ... SELECT` ke notifications dalam transaksi; trigger mengisi outbox; `read_count`. Tanpa target per role/kelas.

### 1.21 Notifikasi dan push (`notifications.go`)

`GET /api/notifications` (page <= 100, status, search), `PUT /{id}/read`, `PUT /read-all`, `GET /api/push/config`, `POST/DELETE /api/push/subscriptions`. Worker: tick 3 detik + wake, 20 pesan per putaran, klaim dengan lock 2 menit, backoff `1 << min(attempts, 8)` detik, menyerah setelah 8; maintenance tiap jam (hapus subscription kedaluwarsa/gagal, outbox > 7 hari, notifikasi dibaca > 180 hari). Web Push VAPID TTL 3600, urgency high, whitelist host FCM/Mozilla/Apple/WNS; 410/404 hapus subscription. Setiap notifikasi juga dikirim realtime `notification_created`. Jenis: leave_review, leave_status, leave_issued, announcement, teacher_substitution_*, warning_letter_issued, student_sp_reached.

### 1.22 Realtime, presence, monitoring

`GET /api/realtime/teacher` dan `/presence` (JWT via subprotocol `sion-auth.<token>`), `/api/realtime/monitoring` dan `GET /api/monitoring` tanpa auth. Origin check: `APP_ORIGINS` exact match atau loopback/host sama. Hub per user dengan Redis pub-sub `sion:realtime:user-events` (dedup via source). Ping 30 detik, read deadline 75 detik, limit 4096 byte. Presence TTL 90 detik, in-memory + Redis ZSET/HASH, snapshot total per role. Monitoring: periode berjalan, ringkasan H/I/S/A/D hari ini, kartu per jadwal berjalan dan kelas tanpa jadwal. Event: notification_created, classroom_entry_scanned, late_arrival__, exit_permit_scanned, teacher_substitution__, presence__, monitoring__.

### 1.23 Dashboard

`GET /api/dashboard`: role, judul, ringkasan, lokasi, `has_homeroom_class`, periode berjalan, jadwal hari ini, quick actions, metrik dan timeline (hardcoded dummy di baseline). `GET /api/admin-dashboard`: total user aktif per jenis, antrean pending, presence online, histogram login per jam 7 hari.

### 1.24 QR guru (`main.go:2583-2684`)

`POST /api/teacher-qr/tokens` (guru): token acak 32 char, hash SHA-256, TTL 30 detik, sekali pakai. `POST /api/teacher-qr/consume` (siswa): alasan <= 500, konsumsi atomik, 410 bila gagal, WS `classroom_entry_scanned`. Token yang sama dipakai untuk izin keluar dan terlambat.

## 2. Cross-cutting

### 2.1 Katalog permission (27 di baseline, 33 di rebuild)

view_dashboard; view/create/edit/delete_announcements; view/create/edit/delete_users; view_roles; manage_permissions; manage_settings; manage_master_data; view_schedules; manage_schedules; view_attendance; manage_attendance; correct_attendance; submit_leave_requests; review_leave_requests (duty); issue_leave_letters (duty); scan_exit_permits (duty); view_notifications; can_supervise (tidak pernah dicek); manage_grades; view_own_grades; + 6 perpustakaan di rebuild. `view_dashboard`, `view_announcements`, `view_notifications`, `view_schedules`, `can_supervise`, `edit_announcements` tidak pernah di-enforce.

### 2.2 Env

`DB_DSN` / `DB_HOST` (127.0.0.1) / `DB_PORT` (3306) / `DB_NAME` (sion) / `DB_USER` (root) / `DB_PASSWORD` (default `12345678` di baseline) / `REDIS_URL` / `JWT_SECRET` (fallback `sion-local-development-secret`) / `API_ADDR` (:8080) / `APP_ORIGINS` / `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` / `CWEBP_PATH`. DSN tanpa `loc=` di baseline sehingga TIMESTAMP diparse UTC sementara `time.Now()` lokal.

### 2.3 Penyimpanan file

`./uploads/branding`, `./uploads/avatars` (nama tertebak), `./uploads/counseling` (bukti BK, publik), `./uploads/private/leave` (surat sakit, publik). Semua lewat `http.FileServer` dengan directory listing. Konversi WebP lewat `cwebp`.

### 2.4 Dokumen

XLSX excelize (template import, e-Rapor); DOCX dirakit manual 4 kali; SVG surat izin; HTML print konseling. Tanpa PDF di baseline (rebuild menambah fpdf, barcode, qrcode).

### 2.5 Konvensi API

Error `{"error": "pesan Indonesia"}` tanpa kode. Pagination `page` + `page_size` (default 10, maks 100) dengan `total`; counseling memakai `meta` (inkonsisten). Beberapa daftar tanpa pagination (LIMIT 100). Tanggal `YYYY-MM-DD`, jam `HH:mm`, timestamp campuran. Status 400/401/403/404/409/410/503.

### 2.6 Zona waktu

Tiga sumber waktu (Go OS, MySQL NOW(), driver UTC) tanpa normalisasi.

### 2.7 Tidak ada di baseline

Rate limit, refresh token, CSRF, security header, logging terstruktur, health dependency, graceful shutdown, pool tuning, timeout, batas body global, audit umum, soft delete umum, idempotency, versi API, OpenAPI.

## 3. Asumsi spesifik sekolah (39)

1. Single-tenant total. 2. Branding default SION/Pecalang. 3. Prefix nomor surat `SION/IZIN`. 4. Template surat default berbahasa Indonesia, aksen `#0f766e`. 5. Tanda tangan SP fixed 3 kolom. 6. SP hanya 3 level. 7. Ambang default 25/50/75. 8. Aturan terlambat ke-2/5 dan ke-3/6 hardcoded. 9. Izin keluar 4 tahap fixed (enum). 10. Terlambat 3 tahap fixed (enum). 11. Izin terencana 2 tahap fixed. 12. "Guru kedua = mengajar sekarang atau 2 jadwal berikutnya" hardcoded. 13. Status H/S/I/D/A di 10 tempat. 14. Skala nilai 0-100 (termasuk CHECK). 15. Tipe penilaian tp/sumatif/praktik/lainnya. 16. Konsep KKTP, TP, e-Rapor, T/R. 17. Kategori `religious_ceremony`. 18. Semester hanya ganjil/genap. 19. Hari aktif hanya sampai Jumat/Sabtu/Minggu. 20. Senin hari pertama, 7 hari fixed. 21. Lima role sistem fixed dengan `FIELD()`. 22. Role tambahan tidak boleh role sistem. 23. BK = guru + permission izin. 24. Seeder demo dengan nama Bali dan `password123` tiap migrate. 25. Migrasi 026 mencocokkan nama Indonesia. 26. Struktur detail terikat Dapodik (NIK, agama, gol darah, NIS/NISN, NIP/NUPTK, PNS/PPPK/GTY). 27. Kelas string bebas tanpa tingkat/jurusan/rombel. 28. Tanpa kenaikan kelas. 29. Aktivasi tahun memasukkan semua user termasuk alumni. 30. Semua pesan Indonesia hardcoded. 31. Bulan Romawi, format tanggal Indonesia. 32. Times New Roman, A4 fixed. 33. Layout SVG absolut. 34. Dependensi `cwebp`. 35. Uploads filesystem lokal. 36. Metrik dashboard fiktif. 37. Timeline dashboard hardcoded. 38. Nama channel Redis `sion:*`. 39. Subprotocol WS `sion-v1`.

## 4. Kualitas kode

- God file: `main.go` 10+ tanggung jawab; `academic_scope.go` 7 entitas CRUD copy-paste (sekitar 1.400 baris duplikasi); pagination diduplikasi 12+ kali; DOCX 4 kali; tiga algoritma status harian; filter jadwal presensi 3 kali.
- Tanpa repository/service; 300+ SQL inline; `map[string]any` sebagai model; validasi menerima `http.ResponseWriter`.
- N+1: listUsers, loadRoles, gradingReport (siswa x komponen), buildReportAnalysis, exportReportWorkbook, myGrades, late arrival per siswa, warning letters per kandidat, violation report per siswa.
- Transaksi hilang: createStudentLeaveRequest, reviewStudentLeaveRequest, reviewLateArrival, issueViolationWarningLetter, ensureAttendanceSession, validasi di luar tx pada assignStudentsToClass.
- Error: sekitar 200 error dibuang (`_ =`), `rows.Err()` jarang dicek, deteksi duplikat via string "Duplicate entry" di 15+ tempat, 409 untuk semua error DB di beberapa handler, hanya 6 `log.Printf`.
- SQL: semua nilai lewat placeholder (aman dari SQLi); concat nama tabel dari whitelist; bug `listSubjects?configured_only` merujuk kolom tabel lain; mutasi `r.URL.RawQuery` untuk mengoper parameter.
- Bug fungsional: notifikasi SP ke BK tidak pernah terkirim; expected = submitted di kelas binaan; terlambat menggantung memblokir presensi selamanya; race token QR terlambat; dead code (transisi izin, ensureClassTx, parser CSV); pengurangan bintang mengabaikan sisa; hapus pengumuman tidak menghapus notifikasi; kolom XLSX > 26 rusak; `fmt.Sprintf` tanpa argumen.

## 5. Temuan keamanan

Kritis: S-1 JWT secret default hardcoded; S-2 password DB default; S-3 master data tanpa permission (siswa bisa menghapus tahun ajaran); S-4 uploads privat publik dengan listing (surat sakit, bukti BK); S-5 monitoring tanpa auth.

Tinggi: S-6 tanpa rate limit login + timing oracle; S-7 token impersonasi tidak dapat dicabut; S-8 logout tidak membatalkan token; S-9 reset password mengembalikan plaintext; S-10 JWT secret dipakai sebagai kunci HMAC surat; S-11 verifikasi surat publik membocorkan PII; S-12 nama avatar tertebak; S-13 CORS permisif saat APP_ORIGINS kosong.

Sedang: S-14 modulo bias; S-15 X-Forwarded-For dipercaya; S-16 error SQL bocor; S-17 `evidence_photo_url` tidak divalidasi (baca file di bawah uploads, bypass sanitasi template); S-18 eksekusi binary eksternal dari path relatif; S-19 tanpa batas body global; S-20 tanpa server timeout; S-21 seeder demo tiap migrate; S-22 hapus pengumuman tanpa scoping/audit; S-23 tanpa security header.

## 6. Test

19 file, 34 fungsi, sekitar 660 baris; semua unit fungsi murni (kecuali 2 httptest impersonasi). Tidak ada test DB, HTTP routing, RBAC, workflow izin keluar/terlambat/izin, koreksi presensi, bentrok jadwal, formula nilai, import, worker, WS, presence. Yang diuji: pagination pengumuman, konversi WebP, scoping jurnal, format DOCX, validasi rentang dan T/R, prioritas status kelas binaan, penyimpanan branding, claims impersonasi, aturan terlambat, origin/subprotocol/whitelist push, agregasi kalender, transisi izin (fungsi tak dipakai), level SP, merge jadwal, policy deadline, riwayat SP, substitusi template.

## 7. Tambahan di `sion-rebuild-go/backend`

53 -> 88 file, sekitar 33.000 baris.

- Modul perpustakaan (sekitar 12.900 baris, 110 route): master data, bibliografi (ISBN lookup Open Library dan Google Books, ekspor XLSX), eksemplar (import, label PDF dengan barcode dan QR), anggota (kartu PDF, bebas pustaka), sirkulasi (pinjam/kembali/perpanjang, struk, hilang, paket kelas, mandiri), overdue + pengingat WhatsApp, booking, denda, libur dan aturan pinjam, opname, kunjungan dan kiosk, laporan (summary, overdue, loans, visits, accession, members, popular, bulanan), pinjaman saya, OPAC publik. Middleware `withLibraryModule`, `withAnyPermission`. Enam permission baru.
- Dukungan mobile: `user_sessions`, refresh token, daftar dan cabut sesi, cache sesi 30 detik, revoke saat logout/reset/ganti password/stop impersonasi; APNs (`APNS_*`), `POST/DELETE /api/push/device-tokens`, badge; login menerima `client`, `device_id`, `device_name` dan mengembalikan `refresh_token` untuk mobile.
- Keamanan: rate limit 10/15 menit per IP dan username; bcrypt dummy untuk timing; produksi wajib JWT >= 32 char dan APP_ORIGINS; default password DB dihapus; master data dibungkus `manage_master_data`; handler uploads memblokir private/counseling, listing, traversal; bukti konseling terautentikasi; body 32 MB global dan 64 KB login; timeout server dan graceful shutdown; pool 25/10/5m; cek sesi dan `ended_at` di withAuth; token layar monitoring dengan constant-time compare; race QR terlambat diperbaiki; retry nomor SP; notifikasi BK diperbaiki via duty.
- Kualitas: `APP_TIMEZONE` ke `time.Local` dan sesi MySQL; kode error stabil (`UNAUTHENTICATED`, `SESSION_EXPIRED`, `IMPERSONATION_ENDED`, `FORBIDDEN`, `NO_ACTIVE_YEAR`, `RATE_LIMITED`, `INVALID_CREDENTIALS`); metrik dashboard nyata; expected_sessions dari jadwal; terlambat difilter per tanggal; `configured_only` dihapus; RFC3339 untuk notifikasi; `SEED_DEMO`; Dockerfile.
- Tetap sama: single-tenant, 5 role fixed, state machine hardcoded, aturan terlambat, SP 3 level, H/S/I/D/A, skala 0-100, asumsi Kurikulum Merdeka, `main.go` sekitar 2.900 baris, tanpa layering, N+1 grading, test unit saja, `cwebp`, uploads lokal.
