# Simulasi waktu untuk testing

Superadmin dapat mengatur tanggal dan jam melalui **Simulasi waktu untuk pengujian** di bagian atas aplikasi. Gunakan sekolah testing karena penyimpanan data tetap berjalan seperti biasa.

1. Masuk sebagai superadmin, buka **Simulasi waktu untuk pengujian**.
2. Pilih tanggal dan jam dalam zona waktu sekolah.
3. Pilih **Bekukan** untuk mempertahankan waktu pilihan, atau **Berjalan** agar waktu maju normal dari titik tersebut.
4. Terapkan simulasi. Banner menampilkan waktu yang sedang digunakan.
5. Gunakan tombol tambah 15 menit, 1 jam, atau 1 hari untuk berpindah skenario.
6. Untuk menguji peran guru/pegawai, aktifkan simulasi sebelum masuk sebagai pengguna tersebut melalui impersonation.
7. Kembalikan ke waktu asli setelah selesai.

## Cakupan

- Jadwal hari ini dan batas waktu edit jadwal guru.
- Daftar sesi absensi siswa, filter tanggal/bulan, dan batas waktu simpan/koreksi.
- Scan masuk/pulang pegawai dan perhitungan keterlambatan, mengikuti zona waktu sekolah.
- Tanggal pada dashboard dan tampilan terkait yang memakai sumber waktu simulasi.
- Periode "hari ini" (`GET /v1/academic/periods/today`), kalender akademik, dan jadwal pengganti (substitusi) yang berlaku pada hari tersebut.
- Jendela tampil pengumuman (`starts_at`/`ends_at` pada pengumuman berstatus published) di `GET /v1/me/announcements`.
- Validitas penugasan (duty) berbasis tanggal (`starts_on`/`ends_on`) yang menentukan izin efektif (`EffectivePermissions`) pengguna yang sedang disimulasikan/diimpersonasi.

### Cakupan perpustakaan

- Peminjaman (borrow): `borrowed_at` dan `due_on` dihitung dari waktu simulasi, mengikuti hari kerja kebijakan sirkulasi (libur akhir pekan dan kalender libur tenant).
- Pengembalian (return): keterlambatan (hari kerja), denda (fine, termasuk `per_tenor`/`constant`), dan penalti (denda/suspend/peringatan) dihitung dari tanggal pengembalian simulasi.
- Perpanjangan (renew): batas dasar perpanjangan (`max(due_on, sekarang)`) dan `due_on` baru mengikuti waktu simulasi.
- Kehilangan (mark lost) dan pencatatan pelanggaran manual (denda, suspend) memakai waktu simulasi untuk `returned_at`/`suspended_until`.
- Reservasi: waktu pemesanan (`requested_at`) dan jendela ambil (`ready_at`/`expires_at`) saat sebuah salinan diserahkan ke antrean berikutnya (lewat pengembalian atau pembatalan) memakai waktu simulasi.
- Kunjungan (guest book) dan baca di tempat (read-in-place): `visited_at`/`started_at`, dedupe kunjungan 30 menit, dan ringkasan kunjungan hari ini mengikuti waktu simulasi serta zona waktu tenant.
- Dashboard: peminjaman/pengembalian/kunjungan "hari ini", jumlah terlambat, dan tren 30 hari mengikuti waktu simulasi.
- Registrasi anggota (manual, otomatis saat pinjam pertama, dan massal per peran/kelas): `registered_on`, `valid_until`, dan nomor anggota bertanggal mengikuti waktu simulasi. Profil `/v1/library/me` sendiri hanya membaca data tersimpan, tidak menghitung ulang waktu.
- Laporan dan opname (stocktake): periode laporan default, ringkasan katalog, laporan bulanan, daftar anggota terlambat, dan waktu mulai/tutup sesi opname mengikuti waktu simulasi.
- Kebijakan sirkulasi: versi kebijakan baru (dibuat otomatis maupun lewat pembaruan) mencatat waktu simulasi sebagai `created_at`.

Tetap memakai waktu asli di modul perpustakaan: pengingat jatuh tempo harian dan auto-kedaluwarsa reservasi (pekerjaan latar belakang berjadwal, tanpa konteks request), cache hasil pencarian ISBN, tahun pada nomor aksesi eksemplar baru, dan tanggal cetak pada surat bebas pustaka.

Simulasi disimpan per tab browser dan terikat ke sekolah serta akun superadmin asal. Request pengguna lain tetap memakai waktu asli. Autentikasi, kedaluwarsa token, izin berdasarkan penugasan, pencatatan audit/database, serta pekerjaan latar belakang tetap memakai waktu asli. Tahun ajaran aktif tetap mengikuti pengaturan sekolah. Tampilan monitor melalui WebSocket tidak memakai header simulasi.

Simulasi disimpan per tab browser dan terikat ke sekolah serta akun superadmin asal. Request pengguna lain tetap memakai waktu asli. Autentikasi (validitas sesi, kedaluwarsa token), pencatatan audit/database (`created_at`/`updated_at`/`computed_at`), serta pekerjaan latar belakang (termasuk `announcements.publish_scheduled` dan penerima notifikasi berbasis duty) tetap memakai waktu asli. Tahun ajaran aktif tetap mengikuti pengaturan sekolah (bendera `is_active`, bukan tanggal). Tampilan monitor melalui WebSocket tidak memakai header simulasi.

**Izin berdasarkan penugasan (duty) adalah pengecualian yang disengaja**: validitas duty (`starts_on`/`ends_on` dibandingkan terhadap tanggal bisnis saat ini) memakai `clock.Now(ctx, ...)`, sehingga untuk request superadmin yang sedang menjalankan simulasi -- termasuk saat mengimpersonasi pengguna lain -- tanggal simulasi menentukan duty mana yang aktif dan izin apa yang diberikannya. Untuk request lain (tanpa header simulasi), hasilnya identik dengan sebelumnya karena `clock.Now` jatuh kembali ke waktu asli. Ini tidak pernah memengaruhi keabsahan sesi/token itu sendiri.

## Cakupan web (apps/web)

Setiap keputusan "waktu sekarang" di web (bukan waktu server yang sekadar ditampilkan) mengikuti `businessNow()` dari `apps/web/lib/simulation/clock.ts`, direfresh lewat `useSimulation()`/`useBusinessNow()` atau lewat invalidasi query otomatis saat simulasi berubah (`simulation-sync.tsx`).

Mengikuti jam simulasi:

- Tenggat "hari ini"/bulan berjalan: `lib/tenant-date.ts` dan `features/attendance/api.ts`'s `todayInZone`/`thisMonthInZone`/`nowTimeInZone`, dipakai luas (jadwal, absensi, cuti, kalender, laporan).
- Dashboard: sapaan dan tanggal header (`dashboard-view.tsx`), blok guru (`home/blocks/teacher.tsx`, sesi berjalan/berikutnya), blok siswa (`home/blocks/student.tsx`, jadwal hari ini dan jam berjalan).
- Absensi: kalender "hari ini" (`attendance-calendar.tsx`), editor sesi dan draf autosimpan (`session-editor.tsx`, `lib/attendance-draft.ts`), tampilan cek-masuk mandiri staf (`self-check-in-view.tsx`).
- Jadwal: grid mingguan dan hari yang sedang berjalan (`schedule-view.tsx`, `schedule-week-grid.tsx`).
- Jurnal: panel hari ini dan default tanggal pelajaran (`journal-today-panel.tsx`, `journal-form.tsx`, `lib/journal-draft.ts`).
- Formulir dan draf lain yang defaultnya "hari ini"/"sekarang": presensi kepegawaian dan kelas (`school/components/*`), kedisiplinan (`counseling-form.tsx`, `violation-record-form.tsx`, `lib/counseling-draft.ts`, `lib/warning-letter-number.ts`), penilaian (`lib/gradebook-draft.ts`, `lib/use-gradebook-save.ts`), ekstrakurikuler (`achievements-view.tsx`, `club-detail-view.tsx`), kalender sekolah (`calendar-view.tsx`), mutasi kelas/kenaikan (`promotion-view.tsx`), bimbingan (`mentor-meeting-note-form.tsx`), supervisi (`complete-observation-form.tsx`, `lib/observation-draft.ts`), insiden pengunjung (`incident-form.tsx`, `incident-log-view.tsx`), perizinan keluar (`exit-permit-panels.tsx`'s catatan waktu lolos gerbang), tagihan (`features/billing/api.ts`'s `currentPeriod`).
- Perpustakaan: jatuh tempo dan status terlambat (`lib/due-date.ts` lewat pemanggilnya, bukan helper itu sendiri), laporan dan filter tanggal (`library-reports-view.tsx`, `visits-view.tsx`), profil peminjaman sendiri dan anggota (`my-library-view.tsx`, `member-detail-view.tsx`), struk cetak sirkulasi (`desk-receipt-dialog.tsx`).
- Label hari relatif ("hari ini"/"kemarin") pada notifikasi dan pengumuman (`lib/use-day-label.ts`).

Tetap memakai waktu asli (`new Date()`/`Date.now()`) secara sengaja:

- Kedaluwarsa API key integrasi (`integrations/components/api-keys-panel.tsx`) -- itu adalah kedaluwarsa token autentikasi, bukan keputusan bisnis.
- Penjadwalan ulang dan status koneksi WebSocket (`lib/realtime/live-socket-provider.tsx`) dan jendela peredam toast sesi berakhir (`lib/session/auth-redirect-flag.ts`).
- Kunci `React key`/urutan daftar yang murni lokal dan sekali pakai (mis. `Date.now()` pada kunci event di `exit-permit-panels.tsx` dan `stocktake-session-view.tsx`).
- Implementasi jam simulasi itu sendiri (`lib/simulation/clock.ts`), yang memang membaca jam asli sebagai sumber "waktu berjalan".

**Kembali ke waktu asli hanya menghentikan simulasi. Data absensi/jadwal yang disimpan selama testing tetap tersimpan.** Mode ini bukan database sementara atau mekanisme undo. Modul di luar cakupan di atas belum mendukung simulasi waktu secara menyeluruh.

## Cakupan permits

Modul permits (izin terlambat, izin keluar, cuti/leave request, workflow engine, template dokumen, antrean duty, scan gerbang) mengikuti simulasi waktu untuk setiap keputusan bisnis:

- Waktu dan hari/periode pencatatan keterlambatan (late arrival): `opened_at`, `local_date`, dan waktu setiap event tahap workflow.
- Jendela izin keluar (exit permit): pengecekan "satu izin keluar per hari", `IssueGateToken`'s periode berakhir, dan waktu scan gerbang (`GateScan`'s `exited_at`) yang menentukan kembali tepat waktu atau terlambat.
- Tanggal "aktif hari ini" untuk leave request: kelayakan approver berbasis duty (`tenantNow`) di `ReviewLeaveRequest`/`ListLeaveRequestsForReview`, dan `LeaveOverride`/`GetIssuedLeaveCoveringDate` yang menerima tanggal dari pemanggil.
- Penomoran surat (letter numbering) berbasis bulan/tahun: `IssueDocument` dan `IssueLeaveLetter`.
- Perhitungan tanggal lokal (local date) di zona waktu sekolah untuk seluruh keputusan di atas, lewat `service.tenantNow`.

Tetap memakai waktu asli (real time), bukan simulasi, karena berupa keamanan atau pekerjaan latar belakang tanpa request context:

- Penerbitan dan konsumsi scan token (`IssueScanToken`, `ConsumeScanToken`) -- termasuk kedaluwarsa token gerbang (`gate_exit`) -- adalah kontrol anti-replay, bukan keputusan bisnis.
- URL upload bukti (evidence) yang di-presign (`RequestEvidenceUpload`'s `ExpiresAt`) dan tampilan sisa detik token (`toAPIToken`'s `ExpiresInSeconds`) mengikuti waktu asli token itu sendiri.
- Job latar belakang tanpa request context: `ExpireHangingInstances` dan `CleanupExpiredScanTokens`.
- Bookkeeping `effective_from` saat `tenant_policies` diisi otomatis pertama kali (`evidenceRequired`, `lateArrivalActions`).

Tes: `apps/api/internal/modules/permits/simulation_integration_test.go` membuktikan keterlambatan yang dibuka pada konteks Senin 07:20 simulasi jatuh di hari itu, status kembali tepat waktu/terlambat pada izin keluar mengikuti jam simulasi, dan kelayakan reviewer "aktif hari ini" pada leave request mengikuti tanggal simulasi.

## Cakupan kesiswaan dan pelaporan (student affairs and reporting coverage)

Modul-modul berikut mengikuti waktu simulasi lewat `clock.Now(ctx, s.clock)` pada keputusan bisnis yang terikat waktu:

- **discipline**: tahun pada nomor surat peringatan (SP) yang diterbitkan lokal, saat tidak ada `DocumentIssuer` terpasang.
- **grading**: `published_at` pada publikasi nilai rapor (`Publish`) dan `computed_at` pada `report_scores` (rekomputasi otomatis maupun override manual) -- keduanya kolom bisnis yang dibaca siswa/orang tua, bukan bookkeeping, sehingga kolomnya diganti dari `now()` SQL menjadi parameter dari clock yang tersimulasi.
- **reports**: tanggal tanda tangan (`Signature.Date`) pada laporan yang diekspor interaktif (`RunDocument`/`attachLetterhead`), dan tanggal "jadwal berikutnya" pada `ListSchedulesWithNextRun`/`NextRunAt` (layar admin, bukan job latar belakang).
- **visitors**: `arrived_at`/`departed_at` saat tamu check-in/check-out, nomor badge tamu yang dinomori lokal (tanpa `DocumentIssuer`), status "overstay" pada gate board (`Board`), dan `closed_at` saat insiden ditutup.
- **mentoring**: bulan default ("bulan ini") pada `StudentSnapshot` yang membaca rekap kehadiran bulanan siswa.
- **supervision**: tanggal tanda tangan pada laporan siklus supervisi guru yang diekspor (`ExportTeacherReport`).
- **discipline, mentoring, supervision, visitors**: pengecekan `HasActiveDuty` yang menentukan siapa boleh membuka catatan konseling/catatan bimbingan/laporan observasi/insiden pengunjung selain penulis/pelapornya sendiri (`readerRole`/`noteReaderRole`/`observationReaderRole` masing-masing modul) kini memakai `today` dari `s.tenantNow` (pola yang sama dengan permits' `HasActiveDuty`), bukan lagi `current_date` bawaan SQL. Perbaikan ini juga membetulkan bug zona waktu: sesi Postgres selalu berjalan pada UTC, bukan zona waktu tenant, sehingga `current_date` bisa salah menilai jendela `starts_on`/`ends_on` di dekat pergantian hari lokal (mis. `2026-10-05T23:30:00Z` sudah menjadi `2026-10-06` di Asia/Makassar). Diuji di `discipline/simulation_integration_test.go`, `mentoring/simulation_integration_test.go`, `supervision/simulation_integration_test.go`, dan `visitors/service/simulation_integration_test.go`: masing-masing membuktikan duty yang `starts_on`-nya di masa depan baru aktif saat tanggal simulasi berada dalam jendelanya (dan belum aktif tanpa simulasi), dan `discipline/simulation_integration_test.go` juga membuktikan tanggal lokal tenant (bukan UTC) yang dipakai.
- **analytics** dan **activities**: tidak ada keputusan bisnis yang bergantung pada "sekarang/hari ini" di luar apa yang sudah diteruskan lewat `ctx` dari modul lain (mis. `analytics.TodaySubmittedCount` meneruskan `ctx` ke pembaca attendance). Semua tanggal aktivitas/pertemuan/keanggotaan klub (`meeting_date`, `joined_on`, `left_on`, dll.) adalah input wajib dari pemanggil, bukan default "hari ini".

Sengaja tetap memakai waktu asli (didokumentasikan, bukan terlewat):

- **reports**: `ScheduleService.RunDueSchedules`, `runOne`, `failRun`, dan `FinalizeRun` -- job periodik River tanpa request dan tanpa header simulasi, persis seperti contoh "rekomputasi at-risk malam hari" di bawah.
- **analytics**: `Recompute`/`RecomputeAllTenants` -- job periodik River yang menghitung ulang skor risiko setiap siswa; belum ada endpoint interaktif yang memanggilnya.
- Setiap modul di atas: `effective_from` pada versi kebijakan tenant (`tenant_policies`, mis. skala penilaian, tingkatan SP) hanya dicatat sebagai bookkeeping (pembacaan kebijakan selalu mengambil versi terbaru, tidak memfilter berdasarkan `effective_from`).

## Implementasi

Browser mengirim `X-Simulation-Time` berisi waktu efektif dalam RFC3339 pada request yang mendukung simulasi. Backend mewajibkan sesi login interaktif dan memeriksa izin `platform_superadmin` pada pelaku asli, termasuk saat impersonation. Header yang tidak valid atau tanpa izin ditolak.

Middleware memasang waktu pada context request; service bisnis mengambilnya lewat `clock.Now(ctx, fallback)`. Jam proses, database, dan `clock.Real` tidak diubah. Jangan mengganti jam autentikasi atau audit dengan helper simulasi.

Pengujian mencakup isolasi request, penolakan pengguna tanpa izin, impersonation, pergantian tanggal WITA, scan masuk/pulang, batas koreksi, dan batas edit jadwal. Untuk kesiswaan dan pelaporan: nomor surat peringatan mengikuti tahun simulasi (`discipline/simulation_integration_test.go`), tanggal publikasi rapor mengikuti waktu simulasi (`grading/simulation_integration_test.go`), dan waktu check-in/check-out tamu plus status overstay di gate board mengikuti waktu simulasi (`visitors/service/simulation_integration_test.go`) -- setiap kasus juga membuktikan request tanpa header simulasi tetap memakai jam asli. Untuk `HasActiveDuty` keempat modul itu (discipline, mentoring, supervision, visitors): duty dengan `starts_on` di masa depan baru dihormati saat tanggal simulasi jatuh dalam jendelanya dan tidak dihormati tanpa simulasi (`discipline/simulation_integration_test.go`, `mentoring/simulation_integration_test.go`, `supervision/simulation_integration_test.go`, `visitors/service/simulation_integration_test.go`'s masing-masing `TestSimulatedFutureDutyHonoredWithinSimulatedWindow`), dan `discipline/simulation_integration_test.go`'s `TestSimulatedDutyUsesTenantLocalDate` membuktikan tanggal lokal tenant (Asia/Makassar), bukan UTC, yang menentukan jendela tersebut.

Pengujian mencakup isolasi request, penolakan pengguna tanpa izin, impersonation, pergantian tanggal WITA, scan masuk/pulang, batas koreksi, dan batas edit jadwal.

## Cakupan akademik, jadwal, pengumuman, dan penugasan (duty)

- `GET /v1/academic/periods/today` (`academic/transport/http/handler.go`'s `tenantNow`): periode yang sedang berjalan mengikuti `clock.Now(ctx, h.clock)` pada zona waktu sekolah, bukan lagi selalu `h.clock.Now()`. Diuji di `internal/modules/academic/period_simulation_test.go`.
- Kebijakan jumlah term saat membuat tahun ajaran (`academic/service.termCountPolicy`, membaca `tenant_policies` versi yang berlaku pada tanggal tertentu) dan tanggal `starts_on`/`ends_on` penugasan homeroom yang disinkronkan dari form kelas (`academic/service.syncHomeroomDuty`) kini memakai `clock.Now(ctx, ...)`.
- Impor massal pendaftaran siswa (`CommitEnrollmentImport`): tanggal `joined_on` memakai `clock.Now(ctx, ...)`, bukan waktu proses.
- Pratinjau kop laporan (`school/transport/http.PreviewTenantReportHeader`): tanggal contoh mengikuti `clock.Now(ctx, ...)`. Tahun ajaran aktif tetap berbasis `is_active`, bukan tanggal, sehingga tidak diubah.
- Substitusi (`scheduling`): setiap query bertanggal (termasuk `ListAcceptedSubstitutionsForSubstituteDate`, yang dipakai `attendance.ListSessions` untuk daftar sesi "hari ini") sudah menerima tanggal sebagai parameter sejak awal -- modul scheduling sendiri tidak pernah membaca jam server untuk keputusan bisnis (`schedule.go`'s `s.now(ctx)` sudah memakai `clock.Now(ctx, ...)` sejak simulasi diperkenalkan). Diuji ulang di `internal/modules/scheduling/simulation_integration_test.go` dan `internal/modules/attendance/simulation_integration_test.go` (`TestAcceptedSubstitutionAppearsUnderSimulatedDay`).
- Jendela tampil pengumuman (`announcements.ListForUser`, kueri `ListActiveAnnouncementsForUser`): `starts_at`/`ends_at` dibandingkan terhadap `clock.Now(ctx, ...)`, bukan `now()` di database. Validasi `Schedule()` (penjadwalan draft, `starts_at` harus di masa depan) memakai clock yang sama. Job latar belakang `announcements.publish_scheduled` (`ListDueScheduled`, transisi scheduled->published) tetap memakai `now()` asli karena berjalan di luar konteks request. Diuji di `internal/modules/announcements/publish_window_simulation_test.go`.
- Absensi (`attendance`): `TodaySubmittedCount` (dashboard "sudah lapor hari ini") dan cek "wali kelas" (`GetHomeroomClassForTeacher`, kueri `GetHomeroomClassForAttendance` di `cross_reads.sql`) kini mengikuti tanggal bisnis pemanggil (`clock.Now(ctx, ...)` atau tanggal record yang sedang diproses), bukan `current_date` database. `queries/daily_summary.sql`'s `computed_at` tetap `now()` (kolom audit). Presensi WebSocket monitor (`module.go`'s `livePresence.Snapshot`) dan `policy.go`'s `CreatePolicy` seeding (kolom `created_at`) sengaja tetap memakai jam asli. Diuji di `internal/modules/attendance/simulation_integration_test.go` (`TestHomeroomGlobalCorrectorScopeFollowsDutyWindow`, `TestAcceptedSubstitutionAppearsUnderSimulatedDay`).
- Identitas (`identity`): validitas duty berbasis tanggal (`duties.sql`'s `ListActiveDutyAssignmentsForUser` dan `session_active.sql`'s `ListActiveDutyAssignmentsWithPermissions`, dipanggil bersama oleh `repository.ListActiveDuties` untuk satu `authz.Principal`) memakai `clock.Now(ctx, ...)`, sehingga `EffectivePermissions` -- yang dipanggil ulang oleh authz middleware pada setiap request pengguna yang diimpersonasi -- mengikuti tanggal simulasi. `duties.sql`'s `ListUserIDsWithActiveDuty` (penerima notifikasi lewat event bus) dan `IsSessionActive` (validitas sesi) sengaja tetap memakai `current_date`/`now()` asli: yang pertama adalah jalur pengiriman notifikasi latar belakang, yang kedua adalah autentikasi. Diuji di `internal/modules/identity/service/duty_time_simulation_test.go`.
