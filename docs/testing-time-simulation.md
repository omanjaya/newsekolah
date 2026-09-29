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

Simulasi disimpan per tab browser dan terikat ke sekolah serta akun superadmin asal. Request pengguna lain tetap memakai waktu asli. Autentikasi (validitas sesi, kedaluwarsa token), pencatatan audit/database (`created_at`/`updated_at`/`computed_at`), serta pekerjaan latar belakang (termasuk `announcements.publish_scheduled` dan penerima notifikasi berbasis duty) tetap memakai waktu asli. Tahun ajaran aktif tetap mengikuti pengaturan sekolah (bendera `is_active`, bukan tanggal). Tampilan monitor melalui WebSocket tidak memakai header simulasi.

**Izin berdasarkan penugasan (duty) adalah pengecualian yang disengaja**: validitas duty (`starts_on`/`ends_on` dibandingkan terhadap tanggal bisnis saat ini) memakai `clock.Now(ctx, ...)`, sehingga untuk request superadmin yang sedang menjalankan simulasi -- termasuk saat mengimpersonasi pengguna lain -- tanggal simulasi menentukan duty mana yang aktif dan izin apa yang diberikannya. Untuk request lain (tanpa header simulasi), hasilnya identik dengan sebelumnya karena `clock.Now` jatuh kembali ke waktu asli. Ini tidak pernah memengaruhi keabsahan sesi/token itu sendiri.

**Kembali ke waktu asli hanya menghentikan simulasi. Data absensi/jadwal yang disimpan selama testing tetap tersimpan.** Mode ini bukan database sementara atau mekanisme undo. Modul di luar cakupan di atas belum mendukung simulasi waktu secara menyeluruh.

## Implementasi

Browser mengirim `X-Simulation-Time` berisi waktu efektif dalam RFC3339 pada request yang mendukung simulasi. Backend mewajibkan sesi login interaktif dan memeriksa izin `platform_superadmin` pada pelaku asli, termasuk saat impersonation. Header yang tidak valid atau tanpa izin ditolak.

Middleware memasang waktu pada context request; service bisnis mengambilnya lewat `clock.Now(ctx, fallback)`. Jam proses, database, dan `clock.Real` tidak diubah. Jangan mengganti jam autentikasi atau audit dengan helper simulasi.

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
