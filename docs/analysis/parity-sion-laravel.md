# Lampiran E. Perbandingan fitur: sistem produksi (Laravel) dan newsekolah

> Lampiran D ([parity-sion-before.md](parity-sion-before.md)) membandingkan logika newsekolah dengan kode Go di `reference/sion-rebuild-go`. Kode itu berasal dari lini yang sama dengan sistem yang sekolah pakai hari ini, tetapi bukan sistem itu sendiri: basis data sungguhan sekolah adalah aplikasi Laravel/PHP dengan skema `migrations`, tabel izin Spatie, dan struktur yang berbeda di banyak tempat (`years` bukan `academic_years`, `groups` bukan `classes`, `group_members` bukan penugasan siswa ke kelas). Lampiran ini membaca skema basis data sungguhan itu langsung, tabel demi tabel, dan mencocokkannya dengan modul newsekolah.

Tanggal: 16 September 2026. Sumber produksi: kontainer `nsk-mysql`, basis data `pecalang`, 113 tabel, dibaca lewat `docker exec nsk-mysql mariadb -uroot -ppw pecalang`. Sumber newsekolah: `apps/api/migrations`, skema langsung di kontainer `nsk-etl-pg` (basis data `newsekolah`), dan daftar modul di `apps/api/internal/modules`. Sumber tambahan: `reference/sion-rebuild-go/PRD-rebuild-go-nextjs.json`, dokumen kebutuhan yang menurut isinya sendiri ditulis untuk merombak "monolit Laravel Pecalang" (481 route) menjadi Go + Next.js (dikutip di [database-inventory.md](database-inventory.md) bagian 5, "Ringkasan PRD dan kesenjangan"). Nama basis data produksi yang dianalisis di lampiran ini juga `pecalang`, jadi PRD itu kemungkinan besar ditulis untuk sistem yang sama persis. PRD dipakai di sini hanya untuk menamai dan mendeskripsikan fitur, bukan sebagai sumber angka.

Semua jumlah baris adalah `SELECT COUNT(*)` yang dijalankan langsung terhadap `pecalang`, bukan estimasi `information_schema`. Tidak ada nama, NIS, email, atau isi bebas dari basis data yang dikutip di sini, hanya nama tabel, kolom, nilai enum, dan angka agregat.

Tahun ajaran aktif di `pecalang` saat ini: `years` id 2, semester 1 tahun 2026/2027, 13 Juli sampai 18 Desember 2026. Tahun sebelumnya (semester 2, Januari sampai Mei 2026) sudah tidak aktif. Ini dipakai sebagai acuan saat menilai apakah sebuah fitur "masih dipakai semester ini" atau berhenti sebelum semester berjalan.

## Cara membaca

Tiap bagian mencantumkan: tabel produksi dan jumlah barisnya, apakah sekolah memakainya (dari jumlah baris dan `MAX(updated_at)`), padanan di newsekolah (modul dan tabel Postgres), lalu verdict:

- **Tercakup**: konsep produksi punya padanan newsekolah yang setara atau lebih lengkap.
- **Sebagian**: intinya ada, tetapi satu atau lebih perilaku produksi tidak punya padanan.
- **Tidak ada padanan**: newsekolah tidak punya struktur untuk fitur ini sama sekali.

## Ringkasan

| Area                                      | Tabel produksi | Baris terbesar                    | Verdict                                          |
| ----------------------------------------- | -------------- | --------------------------------- | ------------------------------------------------ |
| Identitas dan akses                       | 8              | `model_has_roles` 2.621           | Tercakup                                         |
| Master data akademik dan kalender         | 8              | `group_members` 2.791             | Tercakup                                         |
| Wali kelas, BK per kelas, piket           | 4              | `class_of_bks` 73                 | Sebagian                                         |
| Jadwal dan versi jadwal                   | 4              | `schedules` 5.018                 | Sebagian                                         |
| Presensi dan jurnal                       | 5              | `attendance_details` 163.442      | Sebagian                                         |
| Penilaian                                 | 5              | `grades` 6.622                    | Tercakup                                         |
| Disiplin: pelanggaran, bintang, suspensi  | 4              | `classroom_star_awards` 3.038     | Sebagian                                         |
| Izin siswa dan guru                       | 6              | `permits` 3.667                   | Sebagian                                         |
| Pengumuman dan notifikasi                 | 4              | `notifications` 45.038            | Sebagian                                         |
| Perpustakaan                              | 7              | `book_codes` 8.804                | Tercakup (newsekolah lebih luas)                 |
| Koperasi dan POS                          | 15             | `coop_stock_logs` 1.895           | **Tidak ada padanan**                            |
| Guru wali, aktivitas mentoring, instrumen | 8              | `mentor_activity_responses` 1.595 | Sebagian                                         |
| Diagnostik siswa                          | 3              | `student_diagnostics` 828         | **Tidak ada padanan**                            |
| Supervisi guru                            | 4              | `supervision_rpm_reviews` 65      | Sebagian                                         |
| HBG dan MGMP                              | 7              | `hbg_submissions` 216             | **Tidak ada padanan**                            |
| SNPMB                                     | 1              | `snpmb_eligibles` 208             | **Tidak ada padanan**                            |
| Kunjungan kampus                          | 1              | `campus_visits` 0                 | Tercakup, tidak pernah dipakai produksi          |
| LMS untuk suspensi                        | 6              | semua 0                           | Tidak ada padanan, tidak pernah dipakai produksi |
| Kontribusi (SPP)                          | 2              | `contribution_payments` 7         | Tercakup                                         |
| Pengaturan, backup, infrastruktur         | 11             | `migrations` 147                  | Sebagian                                         |

Jumlah tabel di atas totalnya 113, sama dengan jumlah tabel di `pecalang`.

## 1. Identitas dan akses

Tabel: `users` (2.518), `user_details` (91), `roles` (15), `permissions` (19), `model_has_roles` (2.621), `model_has_permissions` (1), `role_has_permissions` (20), `webauthn_credentials` (213, terakhir dipakai 15 September 2026).

Lima belas role terdaftar: Super Admin, Administrator, BK, Picket, Student, Class Administrator, Teacher, Supervisor, Pustakawan, Kiosk, Keuangan, Security, Manajemen, Koperasi, Customer. Distribusi pemegang role terbanyak: Student 2.429, Teacher 73, Class Administrator 36, Supervisor 20, Customer 17. Seluruh 2.518 user berstatus aktif.

Padanan newsekolah: modul `identity`, tabel `users`, `user_roles`, `roles`, `permissions`, `role_permissions`, plus `user_profiles`, `staff_profiles`, `student_profiles`, `teacher_profiles`, `mfa_totp`, `sso_google_configs`, `login_attempts`, `webauthn_credentials`.

Verdict: **Tercakup**. Struktur peran-dan-izin produksi (tabel gaya Spatie: `model_has_roles`, `role_has_permissions`) dipetakan satu-satu ke `user_roles`/`role_permissions` newsekolah, dan newsekolah menambah profil per jenis user serta MFA/SSO yang tidak ada di produksi. Role `Customer` dan `Koperasi` di produksi murni untuk koperasi (lihat bagian 11) dan tidak berlaku di luar konteks itu.

## 2. Master data akademik dan kalender

Tabel: `years` (2), `groups` (72), `group_members` (2.791), `subjects` (21), `periods` (10), `rooms` (0), `categories` (1), `school_events` (243, terakhir diperbarui 6 September 2026).

`rooms` kosong: produksi tidak menyimpan data ruang kelas sebagai entitas terpisah walau tabelnya ada. `categories` berisi satu baris ("Buku Penunjang Pelajaran") dan tidak punya foreign key masuk dari tabel manapun; kolom `books.category` sendiri adalah teks bebas, bukan rujukan ke tabel ini. Tabel ini tampak sisa dari skema lama yang sudah digantikan mekanisme kategori lain (koperasi punya `coop_categories` sendiri, perpustakaan tidak memakainya).

Padanan newsekolah: modul `academic` dan `school`, tabel `academic_years`, `terms`, `classes`, `enrollments`, `subjects`, `subject_offerings`, `periods`, `period_templates`, `rooms`, `grade_levels`, `tracks`, `academic_calendar_events`, `school_days`.

Verdict: **Tercakup**. newsekolah menambah `grade_levels`, `tracks`, dan `terms` yang tidak ada strukturnya di produksi (produksi hanya punya `years` dengan semester sebagai kolom, bukan entitas jenjang terpisah). Kalender kegiatan (`school_events`, tiga jenis: libur, ujian, kegiatan) tercakup oleh `academic_calendar_events` yang lebih rinci (per jenjang lewat `academic_calendar_event_grade_levels`).

## 3. Wali kelas, BK per kelas, dan piket

Tabel: `class_administrators` (72, wali kelas per rombel), `class_of_bks` (73, guru BK per rombel), `bk_on_dutis` (5, jadwal piket BK per hari), `management_staff` (4, posisi Waka: Waka Kurikulum, Waka Sarpras, Waka Kesiswaan, Waka Humas).

Padanan newsekolah: `classes.homeroom_teacher_id` (kolom langsung di tabel kelas) untuk wali kelas, dan model generik `duty_types`/`duty_assignments` (dengan `scope_kind`, `scope_class_id`, `starts_on`/`ends_on`) untuk penugasan tambahan lain.

Verdict: **Sebagian**. Wali kelas tercakup langsung lewat kolom di `classes`. Penugasan BK per kelas, jadwal piket BK, dan posisi Waka bisa secara struktural dipetakan ke `duty_types`/`duty_assignments`, tetapi model itu memakai rentang tanggal (`starts_on`/`ends_on`), sedangkan `bk_on_dutis` produksi memakai pengulangan mingguan per hari (kolom `day`). Tidak ada bukti di migrasi bahwa jenis duty untuk BK atau Waka sudah didefinisikan; mekanismenya ada, datanya belum tentu.

## 4. Jadwal dan versi jadwal

Tabel: `schedules` (5.018), `schedule_versions` (3, status draft/review/scheduled/active/archived, terakhir diperbarui 6 September 2026), `schedule_version_teacher_statuses` (70, status per guru: not_started/editing/submitted/approved), `teacher_classes` (1.794).

Padanan newsekolah: modul `scheduling`, tabel `schedules`, `teaching_assignments`, `substitution_requests`.

Verdict: **Sebagian**. Penyimpanan slot jadwal per hari/periode/kelas/mapel tercakup. Alur `schedule_versions`, tempat admin membuka versi jadwal baru, tiap guru mengedit jam mengajarnya sendiri dan mengirim status "submitted" untuk direview lalu diaktifkan, tidak punya padanan: modul `scheduling` newsekolah (`apps/api/internal/modules/scheduling`) hanya berisi edit langsung dengan jendela edit (`edit_window.go`) dan deteksi bentrok (`conflict.go`), tidak ada siklus draft-per-guru dengan status terpisah per versi. Tiga versi dan 70 baris status guru yang diperbarui awal September menunjukkan sekolah memakai alur ini setiap kali menyusun jadwal semester baru.

## 5. Presensi dan jurnal mengajar

Tabel: `attendances` (12.714), `attendance_details` (163.442, status Hadir/Izin/Sakit/Dispen/Alpha), `attendance_change_requests` (39, alur token dengan status pending/approved/expired, kolom `token varchar(8)`), `attendance_normalization_logs` (7), `journals` (7.966, tipe siswa/guru/bk).

`attendances`, `attendance_details`, dan `journals` diperbarui hari ini (16 September 2026), presensi jelas dipakai setiap hari sekolah. `attendance_change_requests` terakhir diperbarui 14 September dan `attendance_normalization_logs` 8 September, jadi kedua alur itu dipakai tidak sesering pencatatan presensi hariannya sendiri.

Padanan newsekolah: modul `attendance`, tabel `attendance_sessions`, `attendance_entries`, `attendance_corrections`, `attendance_daily_summary`, dan modul `scheduling` untuk `class_journals`.

Verdict: **Sebagian**. Pencatatan presensi harian dan rekap tercakup. Dua celah:

- `attendance_change_requests` produksi adalah alur persetujuan: guru mengajukan perubahan dengan token (kolom `token_expires_at` menandakan tenggat), staf lain memverifikasi, status berubah pending menjadi approved atau kedaluwarsa. `attendance_corrections` newsekolah (`apps/api/migrations`) tidak punya token atau status tertunda; kolomnya `entry_id`, `old_status`, `new_status`, `reason`, `corrected_by`, `corrected_at`, artinya koreksi langsung tercatat tanpa tahap persetujuan.
- `journals.type` produksi punya tiga nilai (siswa, guru, bk), sedangkan `class_journals` newsekolah hanya punya satu bentuk jurnal (`teacher_user_id`, `written_by_user_id`, tanpa kolom tipe). Jurnal siswa dan jurnal BK tidak tercakup.

## 6. Penilaian

Tabel: `grades` (6.622), `previous_grades` (163), `report_scores` (32), `grade_publications` (26), `learning_objectives` (100, dengan kolom `kktp`).

Padanan newsekolah: modul `grading`, tabel `grades`, `report_scores`, `report_grade_ranges`, `report_tp_mappings`, `grade_publications`, `assessment_components`.

Verdict: **Tercakup**. `learning_objectives` (tujuan pembelajaran per mapel dengan bobot dan KKTP) dipetakan ke `report_tp_mappings`. newsekolah menambah `assessment_components` dan `report_grade_ranges` yang tidak ada strukturnya di produksi. Perbaikan logika penilaian (rumus kenaikan rapor, override manual) sudah dibahas di Lampiran D dan dicatat selesai di [15-paritas-sion.md](../15-paritas-sion.md).

## 7. Disiplin: pelanggaran, bintang, dan suspensi

Tabel: `violations` (43), `student_has_violations` (645, terakhir diperbarui hari ini), `classroom_star_awards` (3.038, terakhir diperbarui hari ini), `suspensions` (4, terakhir diperbarui 30 Agustus 2026).

Padanan newsekolah: modul `discipline`, tabel `violation_types`, `violation_records`, `star_events`, `warning_letters`.

Verdict: **Sebagian**. Pelanggaran dan bintang kelas tercakup dan aktif dipakai setiap hari. `suspensions` tidak punya padanan: di produksi, suspensi adalah pengeluaran siswa dari kelas reguler untuk periode tertentu (`duration_days`, `start_date`, `end_date`), dan tabel `lms_courses`/`lms_course_student` punya kolom `suspension_id` yang dimaksudkan menautkan siswa tersuspensi ke kursus belajar mandiri (lihat bagian 18). newsekolah tidak punya konsep "siswa disuspensi dari kelas reguler"; `warning_letters` adalah surat peringatan berjenjang (SP), bukan pengeluaran dari kelas. Empat baris suspensi dalam kurun waktu terekam adalah pemakaian tipis tetapi nyata.

## 8. Izin siswa dan guru

Tabel: `permits` (3.667, izin guru/pegawai: Upacara Agama, Urusan Keluarga, Sakit, Lainnya), `student_permits` (1.760, izin keluar siswa dengan alur persetujuan wali kelas, BK, Waka, lalu checkout/checkin security), `special_permit_programs` (1), `special_permit_assignments` (52), `special_permit_consents` (94), `special_permit_managers` (1). Seluruh keluarga `special_permit_*` diperbarui antara 26 Agustus dan 11 September 2026.

Padanan newsekolah: modul `permits`, tabel `leave_requests` (untuk `permits`), `exit_permits` (untuk `student_permits`), `late_arrivals`, `scan_tokens`.

Verdict: **Sebagian**. `permits` dan `student_permits` tercakup: alur berlapis (wali kelas, BK, Waka, security checkout/checkin) di `student_permits` sepadan dengan `exit_permits` newsekolah.

`special_permit_*` **tidak ada padanan**. Ini konsep berbeda dari izin sekali jalan: sebuah "program" izin berkala (misalnya kegiatan rutin tiap hari tertentu, dengan `weekday`, `start_period_id`/`end_period_id`, `movement_type` internal/external/quick) dibuat sekali oleh pengelola program, siswa ditugaskan ke program itu (`special_permit_assignments`), lalu tiap kali izin itu berlaku orang tua atau siswa memberi konsen lewat `special_permit_consents` (kolom `response` accepted/ignored, dengan `ip_address` dan `user_agent` sebagai bukti). Produksi saat ini punya satu program aktif dengan 52 siswa ditugaskan dan 94 catatan konsen terekam, dan konsen terakhir tercatat 11 September, lima hari sebelum tanggal analisis ini. Ini menunjukkan sekolah memakai mekanisme ini untuk mengelola izin rutin satu kelompok siswa tanpa mengajukan izin manual berulang kali, sesuatu yang tidak bisa ditiru dengan `exit_permits` biasa karena `exit_permits` dirancang untuk satu pengajuan sekali jalan, bukan program berulang dengan konsen per kemunculan.

## 9. Pengumuman dan notifikasi

Tabel: `announcements` (24), `notifications` (45.038, diperbarui hari ini), `web_push_subscriptions` (750, terakhir dipakai hari ini), `chats` (155, terakhir diperbarui 2 Agustus 2026).

Padanan newsekolah: modul `notifications`, tabel `notifications` (dipartisi per bulan: `notifications_y2026m09`, dan seterusnya), `notification_preferences`, `notification_settings`, `push_devices`, `message_deliveries`, `whatsapp_provider_configs`, `whatsapp_templates`, dan modul `announcements` dengan `announcement_reads`.

Verdict: **Sebagian**. Pengumuman dan notifikasi tercakup dan lebih lengkap di newsekolah (preferensi per jenis, WhatsApp, partisi bulanan untuk skala). `chats` **tidak ada padanan**: ini fitur konsultasi BK berbasis pesan (pengirim, penerima, balasan lewat `reply_to_id`, opsi anonim) yang berbeda dari notifikasi satu arah. Tidak ada tabel pesan dua arah di skema newsekolah manapun. Pemakaiannya sudah berhenti sejak awal Agustus, sebelum semester berjalan saat ini dimulai pertengahan Juli, jadi datanya ada tetapi tidak aktif di semester berjalan.

## 10. Perpustakaan

Tabel: `books` (59), `book_codes` (8.804, kode eksemplar fisik), `book_loans` (13.699, terakhir diperbarui hari ini), `publishers` (4), `library_settings` (3), `library_visits` (616, terakhir diperbarui hari ini), `student_card_settings` (1, pengaturan cetak kartu pelajar dengan opsi AI untuk foto).

Produksi tidak punya entitas anggota perpustakaan terpisah: `book_loans.user_id` merujuk langsung ke `users`, tanpa jenis anggota, tanpa denda, tanpa reservasi, tanpa opname.

Padanan newsekolah: modul `library`, dengan 23 tabel meliputi `library_titles`, `library_copies`, `library_loans`, `library_members`, `library_member_types`, `library_loan_rules`, `library_violations` (denda dan suspensi anggota), `library_reservations`, `library_stocktakes`, dan lain-lain (daftar lengkap di [15-paritas-sion.md](../15-paritas-sion.md)).

Verdict: **Tercakup**, dan newsekolah jauh lebih luas dari produksi di sini. Sirkulasi inti (13.699 peminjaman, 8.804 kode eksemplar, aktif setiap hari) tercakup penuh. Satu celah: `student_card_settings`, fitur cetak kartu pelajar batch per tahun ajaran dengan opsi mengolah foto lewat API OpenAI, **tidak ada padanan**. Kartu pelajar tidak muncul di modul manapun di newsekolah selain sebagai jenis identifikasi pengunjung di modul `visitors` (bukan penerbitan kartu).

## 11. Koperasi dan POS

Tabel (15, persis sejumlah yang disebut PRD sebagai "cooperative_pos, 15 entitas"): `coop_categories` (15), `coop_items` (132), `coop_discounts` (0), `coop_orders` (17), `coop_order_items` (37), `coop_cart_drafts` (7), `coop_transactions` (740), `coop_transaction_items` (1.655), `coop_debts` (3), `coop_returns` (2), `coop_return_items` (2), `coop_stock_logs` (1.895), `coop_stock_opnames` (0), `coop_stock_opname_items` (0), `coop_stock_opname_schedules` (0).

740 transaksi tersebar di 67 hari berbeda antara 9 Maret dan 7 September 2026; `coop_stock_logs`, terakhir diperbarui 15 September, sehari sebelum tanggal analisis ini. Pengaturan `settings` produksi punya kunci `coop_name` dan `coop_visible`, jadi koperasi punya nama tampilan sendiri dan bisa disembunyikan/ditampilkan dari menu guru, tanda ini fitur yang dikelola aktif, bukan sisa uji coba. Fitur opname stok (hitung fisik terjadwal) ada strukturnya tetapi belum pernah dipakai (tiga tabelnya nol baris).

Padanan newsekolah: tidak ada. Pencarian `coop` dan `cooperative` di `apps/api/internal` dan `apps/api/migrations` tidak menemukan satu pun berkas.

Verdict: **Tidak ada padanan**. Ini kasus paling jelas di seluruh perbandingan ini: kasir (POS) dengan pembayaran tunai/transfer/bon, utang pelanggan, retur sebagian, dan katalog belanja guru terpisah dari kasir, dengan 740 transaksi tersebar hampir sepanjang semester dan hampir 1.900 baris log stok terekam, adalah fitur yang dipakai rutin sekolah dan sama sekali belum punya rencana pembangunan di newsekolah. `docs/12-roadmap.md` sudah menyebut "koperasi/POS (bounded context terpisah)" sebagai modul PRD yang belum dibangun; temuan di sini mengonfirmasi modul itu bukan sekadar terdaftar di dokumen kebutuhan lama, tetapi benar-benar dipakai sekolah secara rutin.

## 12. Guru wali, aktivitas mentoring, dan instrumen

Tabel: `mentor_students` (1.427, satu siswa satu guru wali aktif), `mentor_activities` (85, kegiatan yang dibuat guru wali dengan lokasi dan instrumen opsional), `mentor_activity_responses` (1.595, respons hadir/tidak per siswa per kegiatan), `mentor_guidance_sessions` (243, sesi bimbingan individual), `instruments` (4), `instrument_questions` (24), `activity_instruments` (127, penghubung kegiatan ke instrumen), `student_instrument_responses` (1.240).

`mentor_guidance_sessions` dan `mentor_activity_responses` sama-sama berhenti sekitar Mei 2026, sebelum semester berjalan saat ini dimulai Juli. `instruments` dan `instrument_questions` juga terakhir diisi 25 Januari 2026. Fitur ini pernah dipakai penuh satu semester tetapi belum tersentuh lagi di semester berjalan saat penarikan data ini.

Padanan newsekolah: modul `mentoring`, tabel `mentor_groups`, `mentor_group_members`, `mentor_meeting_notes`, `mentor_term_summaries`, `mentor_group_settings`.

Verdict: **Sebagian**. Penugasan siswa ke satu guru wali (`mentor_students`) tercakup oleh `mentor_groups`/`mentor_group_members`, dan sesi bimbingan individual (`mentor_guidance_sessions`, dengan topik, catatan, kesimpulan) sepadan dengan `mentor_meeting_notes`. Yang tidak tercakup: `mentor_activities`, kegiatan kelompok yang dibuat guru wali untuk seluruh siswa asuhnya sekaligus, dengan respons hadir/tidak per siswa dan instrumen survei opsional yang bisa dilampirkan ke kegiatan itu. `mentor_meeting_notes` newsekolah adalah catatan satu-ke-satu, bukan kegiatan kelompok dengan presensi dan instrumen. Seluruh mekanisme instrumen (`instruments`, `instrument_questions`, `student_instrument_responses`) juga tidak ada padanannya, terlepas dari konteks mentoring: ini adalah bank pertanyaan generik yang bisa dipakai ulang di kegiatan mana pun, berbeda dari pertanyaan supervisi guru (`supervision_questions`) yang skopenya khusus modul supervisi.

## 13. Diagnostik siswa

Tabel: `student_diagnostics` (828, terakhir diperbarui kemarin, 15 September 2026), `diagnostic_questions` (12), `diagnostic_options` (48).

Ini adalah survei yang PRD gambarkan sebagai "satu kali" per siswa, menghasilkan tiga kelompok skor tersimpan sebagai JSON: gaya belajar VARK (visual/auditori/membaca-menulis/kinestetik), tingkat risiko psikologis dari lima dimensi (marah, keangkuhan, percaya diri, keluarga, resiliensi) dengan level LOW/MEDIUM/HIGH, dan minat (STEM, seni, sosial-humaniora, kinestetik-lapangan). Tabelnya sendiri tidak menegakkan itu: 828 baris berasal dari hanya 679 `student_id` berbeda, jadi sebagian siswa sudah mengisi lebih dari sekali (kemungkinan mengulang, karena tidak ada kolom versi atau tanggal isi selain `created_at`/`updated_at`). Pembaruan terakhir kemarin menunjukkan ini bukan survei satu angkatan yang sudah selesai, tetapi terus berjalan seiring siswa baru mengisi atau mengulang.

Padanan newsekolah: tidak ada. Pencarian `diagnostic` di seluruh `apps/api/internal` hanya menemukan satu komentar kode yang tidak berkaitan (bukan fitur).

Verdict: **Tidak ada padanan**. Ini modul yang secara eksplisit disebut sebagai kesenjangan di [database-inventory.md](database-inventory.md) bagian 5 ("diagnostic (VARK, risiko psikologis, minat): tidak ada") maupun di [01-analisis-aplikasi-lama.md](../01-analisis-aplikasi-lama.md). Temuan di sini menambahkan bukti pemakaian nyata: 679 siswa berbeda sudah mengisi, sebagian lebih dari sekali, dan data terus bertambah, artinya guru BK atau wali kelas kemungkinan memakai hasilnya sebagai rujukan aktif, bukan data yang terkumpul lalu diabaikan.

## 14. Supervisi guru

Tabel: `supervisions` (71, terakhir diperbarui hari ini), `supervision_observations` (58), `supervision_questions` (20, tipe checklist/reflection), `supervision_rpm_reviews` (65, penilaian dokumen rencana pembelajaran dengan skor 1-4 per pertanyaan).

Padanan newsekolah: modul `supervision`, tabel `supervision_cycles`, `supervision_observations`, `supervision_scheduled_observations`.

Verdict: **Sebagian**. Siklus pra-observasi dan observasi tercakup. `supervision_questions`, bank pertanyaan checklist/refleksi yang bisa dikelola admin, dan `supervision_rpm_reviews`, penilaian terpisah atas dokumen rencana pembelajaran yang diunggah guru (skor per pertanyaan, catatan umum), tidak ditemukan padanannya di skema `supervision_cycles`/`supervision_observations` newsekolah; kedua tabel itu tidak menyimpan struktur pertanyaan bank atau skor per item dokumen. Perlu pengecekan langsung ke kode modul `supervision` untuk memastikan apakah penilaian dokumen RPM tercakup di jalur lain (mis. lampiran generik) atau memang belum ada.

## 15. HBG dan MGMP

Tabel MGMP: `mgmp_groups` (17, kelompok kerja guru per mata pelajaran, diisi 20 Agustus 2026), `mgmp_memberships` (73, posisi ketua/sekretaris/anggota).

Tabel HBG: `hbg_managers` (1), `hbg_sessions` (5, sesi terjadwal dengan lembar kerja versi tertentu, status draft/published/completed/cancelled), `hbg_worksheet_templates` (5), `hbg_worksheet_versions` (5), `hbg_submissions` (216, alur draft/submitted/returned/revised/approved).

`hbg_sessions` dibuat 14 September dan `hbg_submissions` terus bertambah sampai 15 September, dua dan satu hari sebelum data ini ditarik. Ini modul paling aktif secara waktu di seluruh basis data selain presensi harian.

MGMP dan HBG tidak disebut sama sekali di `PRD-rebuild-go-nextjs.json` (2026-07-25), berbeda dari modul lain di lampiran ini yang punya deskripsi PRD. Artinya kedua modul ini ditambahkan ke sistem produksi setelah PRD itu ditulis, dan tidak tercermin di dokumen kebutuhan mana pun yang jadi rujukan rebuild newsekolah sejauh ini. HBG terhubung ke MGMP lewat `mgmp_group_id` di `hbg_sessions` dan `hbg_worksheet_templates`, jadi MGMP adalah prasyarat struktural untuk HBG walau tabelnya sendiri tidak sering berubah.

Fungsi HBG dari skema: fasilitator (`facilitator_id`) menjadwalkan sesi untuk kelompok MGMP tertentu dengan tenggat pengumpulan, lembar kerja punya versi terpisah dari template (`hbg_worksheet_versions.schema`, disimpan sebagai JSON dengan `schema_version`), peserta mengumpulkan jawaban yang bisa dikembalikan untuk direvisi dan disetujui ulang. Apa kepanjangan HBG tidak bisa dipastikan dari skema atau dari kode referensi manapun.

Padanan newsekolah: tidak ada untuk keduanya.

Verdict: **Tidak ada padanan**. Diberi tempat khusus di lampiran ini karena instruksi tugas memintanya, dan karena datanya menunjukkan pemakaian paling baru dari semua modul yang tidak tercakup: HBG sedang dipakai aktif dalam dua hari terakhir sebelum tanggal analisis ini.

## 16. SNPMB

Tabel: `snpmb_eligibles` (208, terakhir diperbarui 15 Januari 2026).

Kunci di `settings` produksi: `snpmb_announcement_date`, `snpmb_display_end_date`, `snpmb_success_message`, semuanya ada isinya (bukan baris kosong), menandakan fitur ini dikonfigurasi untuk ditampilkan ke siswa pada tanggal tertentu, bukan cuma tabel perhitungan internal BK.

Padanan newsekolah: tidak ada.

Verdict: **Tidak ada padanan**. Datanya sendiri hanya diperbarui sekali, pertengahan Januari, karena SNPMB (jalur seleksi masuk perguruan tinggi negeri) adalah proses musiman: ranking kelayakan dihitung sekali per tahun untuk siswa kelas akhir menjelang periode pendaftaran, bukan aktivitas harian. Ini fitur yang sekolah pakai, tetapi jendelanya sempit, sekali setahun, jadi urgensinya beda dari HBG atau koperasi yang tercatat aktif hampir sepanjang semester.

## 17. Kunjungan kampus

Tabel: `campus_visits` (0 baris).

Padanan newsekolah: modul `visitors`, tabel `visitor_expected_guests`, `visitor_visits`, `visitor_incidents`, dengan desain yang secara sengaja tidak menyimpan nomor identitas atau foto tamu (lihat komentar di `apps/api/internal/modules/visitors/domain/visitors.go`).

Verdict: **Tercakup secara struktural, tetapi produksi tidak pernah memakai fiturnya sendiri**. Tabel `campus_visits` ada sejak skema produksi dibuat (kolom `check_in_guard_id`, `check_out_guard_id`, status active/completed/auto_closed) dan PRD menjelaskannya cukup rinci (QR 30 detik, auto-checkout jam 01:00, arsip harian jam 06:00), tetapi nol baris berarti fitur ini tidak pernah dipakai sekolah, mungkin karena keamanan kampus dikelola dengan cara lain di luar sistem. newsekolah sudah membangun modul `visitors` yang lebih lengkap dari produksi (menambah `visitor_incidents` yang tidak ada di produksi), padahal tidak ada bukti sekolah membutuhkannya.

## 18. LMS untuk siswa suspensi

Tabel: `lms_assignments`, `lms_courses`, `lms_course_student`, `lms_materials`, `lms_progress`, `lms_submissions`, seluruhnya 0 baris.

`lms_courses.suspension_id` dan `lms_course_student.suspension_id` menautkan modul ini ke tabel `suspensions` (bagian 7): rancangannya, siswa yang disuspensi dari kelas reguler mendapat kursus belajar mandiri sebagai gantinya. Empat suspensi tercatat di produksi, tetapi nol kursus LMS pernah dibuat, jadi bahkan siswa yang disuspensi pun tidak pernah diarahkan ke jalur ini.

Padanan newsekolah: tidak ada.

Verdict: **Tidak ada padanan, dan tidak ada bukti dibutuhkan**. Ini satu-satunya modul di lampiran ini yang datanya nol secara total, bukan sekadar berhenti di tengah semester. Sebelum membangun ini, perlu konfirmasi dengan sekolah apakah LMS untuk suspensi memang direncanakan dipakai atau memang tidak relevan dengan cara sekolah menangani siswa bermasalah.

## 19. Kontribusi (SPP)

Tabel: `contribution_payments` (7), `contribution_settings` (1).

Padanan newsekolah: modul `billing`, tabel `bills`, `payments`, `fee_types`, `fee_discounts`.

Verdict: **Tercakup**, dan newsekolah lebih lengkap (jenis biaya bertingkat, diskon, bukan cuma satu nominal per tahun ajaran seperti `contribution_settings.default_amount`). Tujuh baris pembayaran adalah volume kecil, kemungkinan karena sistem lama hanya dipakai mencatat, bukan sebagai kanal pembayaran utama sekolah.

## 20. Pengaturan, backup, dan infrastruktur

Tabel: `settings` (19 kunci, mencakup `active_year`, `grading_range_config`, `sp1_threshold`/`sp2_threshold`/`sp3_threshold`, `wa_enabled`, `friday_period_mode`), `backup_settings` (1, konfigurasi endpoint/bucket MinIO untuk backup, terakhir diubah 12 Mei 2026), dan tabel infrastruktur framework Laravel: `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs`, `sessions` (0 baris, mengindikasikan produksi tidak memakai session driver berbasis tabel), `password_reset_tokens` (0 baris), `migrations` (147 baris).

Padanan newsekolah: `platform_settings`, `tenant_settings`, `feature_flags` untuk pengaturan; `river_job`, `river_queue`, `river_leader` (River) untuk antrean job, menggantikan `jobs`/`job_batches`/`failed_jobs` Laravel; `schema_migrations` menggantikan `migrations`; `password_resets` menggantikan `password_reset_tokens`.

Verdict: **Sebagian**. Pengaturan per sekolah tercakup dan lebih terstruktur (bertipe, per tenant). Tabel antrean dan migrasi adalah infrastruktur kerangka kerja, bukan fitur produk, jadi bukan celah, hanya padanan teknologi yang berbeda (River di Go, queue Laravel di PHP).

Satu celah nyata: `backup_settings` adalah fitur admin sekolah mengatur sendiri tujuan backup (endpoint, access key, secret key, bucket, region MinIO) lewat antarmuka, dengan kemampuan uji koneksi, jalankan backup manual, lihat daftar file, dan restore dari arsip ZIP, sesuai deskripsi modul `settings_backup_integrations` di PRD. Pencarian `minio`/`backup` di `apps/api/internal` hanya menemukan `platform/storage/storage.go` (klien objek storage tingkat infrastruktur, dikonfigurasi lewat variabel lingkungan saat deploy) dan satu rujukan ke klien itu di `modules/school/module.go`; keduanya bukan fitur yang bisa diatur admin sekolah dari dalam aplikasi. Tidak ada UI restore-dari-backup di newsekolah. PRD produksi juga menyebut webhook Telegram (`/majukan`, `/normalkan`, `/status`, `/pengumuman`) sebagai kanal notifikasi cadangan; pencarian `telegram` di `apps/api` tidak menemukan hasil, jadi integrasi ini juga tidak ada padanannya.

## Yang produksi lakukan tetapi tidak ada di kedua snapshot referensi

`reference/sion` dan `reference/sion-rebuild-go` (kode Go) maupun `PRD-rebuild-go-nextjs.json` (dokumen kebutuhan, ditulis 2026-07-25) sama-sama tidak menyebut:

- **MGMP** (`mgmp_groups`, `mgmp_memberships`): kelompok kerja guru per mata pelajaran.
- **HBG** (lima tabel di bagian 15): satu-satunya modul di seluruh basis data yang datanya bertambah dalam dua hari terakhir sebelum tanggal analisis ini.
- **Versi jadwal dengan status per guru** (`schedule_versions`, `schedule_version_teacher_statuses`): alur draft-review-approve untuk penyusunan jadwal semester, berbeda dari edit jadwal langsung yang dideskripsikan PRD di modul `schedule`.

Ketiganya kemungkinan ditambahkan ke sistem produksi setelah PRD ditulis. Konsekuensinya: dokumen kebutuhan yang selama ini jadi rujukan cakupan fitur newsekolah (`docs/01-analisis-aplikasi-lama.md`, `docs/11-feature-recommendations.md`, `docs/12-roadmap.md`) tidak mencakup ketiganya sama sekali, bukan cuma menandainya sebagai "belum dibangun".

## Yang newsekolah bangun tetapi produksi tidak punya datanya

Empat modul newsekolah tidak punya tabel padanan APAPUN di produksi, bukan sekadar tidak dipakai:

- **`staffattendance`** (`staff_attendance_records`, `staff_attendance_corrections`, `staff_attendance_schedules`): produksi tidak punya satu tabel pun untuk absensi pegawai/guru. `management_staff` hanya daftar empat posisi Waka, bukan log kehadiran.
- **`family`** (relasi orang tua-siswa, lewat `parent_students`): tidak ada tabel keluarga atau orang tua di produksi sama sekali. Login orang tua tampaknya belum jadi bagian dari sistem yang berjalan.
- **`integrations`** (`integration_api_keys`, `integration_webhook_endpoints`, `integration_webhook_deliveries`): produksi tidak punya tabel API key atau webhook keluar untuk pihak ketiga.
- **`visitors`** (bagian 17 di atas): tabelnya sudah ada di produksi (`campus_visits`) tetapi nol baris.

Absensi pegawai dan integrasi API pihak ketiga adalah pekerjaan besar (masing-masing modul penuh di newsekolah) yang dibangun tanpa ada bukti dari data produksi bahwa sekolah memakainya. Ini bukan berarti keduanya salah dibangun, keduanya bisa jadi kebutuhan yang belum terlayani sistem lama sama sekali, tetapi patut dikonfirmasi ke sekolah sebelum menganggapnya prioritas tinggi, karena tidak seperti koperasi atau HBG, tidak ada jejak pemakaian yang bisa dijadikan bukti kebutuhan.

## Yang harus ada sebelum sekolah bisa pindah dari sistem lama

Diurutkan dari yang paling dipakai sekolah hari ini ke yang paling jarang, berdasarkan jumlah baris dan `MAX(updated_at)` yang tercatat di atas, bukan urutan kerumitan teknis.

1. **Koperasi dan POS** (bagian 11). 740 transaksi tersebar di 67 hari berbeda antara Maret dan awal September 2026, 15 tabel, tidak ada satu baris kode pun untuk ini di newsekolah. Modul paling besar yang hilang total.
2. **HBG** (bagian 15). Dipakai dalam dua hari terakhir sebelum tanggal analisis ini, dan tidak disebut di dokumen kebutuhan manapun yang ada. Perlu klarifikasi ke sekolah tentang apa isi dan tujuan modul ini sebelum bisa dirancang, karena skema saja tidak menjelaskan kepanjangannya.
3. **Diagnostik siswa** (bagian 13). 679 siswa berbeda sudah mengisi, data terus bertambah, dan sudah lama tercatat sebagai kesenjangan di `database-inventory.md` tanpa pernah dibangun.
4. **Versi jadwal per guru** (bagian 4). Dipakai setiap penyusunan jadwal semester (tiga versi tercatat), berisiko menyulitkan admin sekolah setiap pergantian semester bila tidak ada penggantinya.
5. **Izin berkala dengan konsen** (`special_permit_*`, bagian 8). Satu program aktif, 52 siswa, konsen terakhir tercatat lima hari sebelum tanggal analisis ini. Konsep "program izin berulang dengan konsen per kemunculan" perlu dirancang terpisah dari `exit_permits` yang sudah ada.
6. **Perubahan presensi bertoken** (bagian 5). Sudah tercatat sebagai kesenjangan sejak Lampiran B; koreksi presensi newsekolah saat ini langsung tercatat tanpa tahap verifikasi staf lain.
7. **Kegiatan wali kelas berkelompok dan instrumen** (bagian 12). Dipakai penuh satu semester lalu berhenti; instrumen (survei) sebagai konsep generik terpisah dari pertanyaan supervisi.
8. **Backup mandiri oleh sekolah** (bagian 20). Diubah terakhir Mei 2026, jadi tidak sesering yang lain, tetapi kehilangan kemampuan restore mandiri berisiko tinggi saat migrasi data sungguhan berlangsung.
9. **SNPMB, MGMP, jurnal siswa/BK, penilaian dokumen RPM, kartu pelajar** (bagian 6, 14, 15, 16). Dipakai sekolah tetapi musiman atau jarang; bisa dijadwalkan setelah delapan item di atas.
10. **LMS untuk suspensi** dan **kunjungan kampus** (bagian 17, 18). Nol pemakaian di produksi. Konfirmasi kebutuhan ke sekolah sebelum membangun; jangan jadi prioritas berdasarkan asumsi bahwa tabel yang ada di skema lama pasti dibutuhkan.
