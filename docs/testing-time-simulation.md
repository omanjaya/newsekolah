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
- **analytics** dan **activities**: tidak ada keputusan bisnis yang bergantung pada "sekarang/hari ini" di luar apa yang sudah diteruskan lewat `ctx` dari modul lain (mis. `analytics.TodaySubmittedCount` meneruskan `ctx` ke pembaca attendance). Semua tanggal aktivitas/pertemuan/keanggotaan klub (`meeting_date`, `joined_on`, `left_on`, dll.) adalah input wajib dari pemanggil, bukan default "hari ini".

Sengaja tetap memakai waktu asli (didokumentasikan, bukan terlewat):

- **reports**: `ScheduleService.RunDueSchedules`, `runOne`, `failRun`, dan `FinalizeRun` -- job periodik River tanpa request dan tanpa header simulasi, persis seperti contoh "rekomputasi at-risk malam hari" di bawah.
- **analytics**: `Recompute`/`RecomputeAllTenants` -- job periodik River yang menghitung ulang skor risiko setiap siswa; belum ada endpoint interaktif yang memanggilnya.
- Setiap modul di atas: `effective_from` pada versi kebijakan tenant (`tenant_policies`, mis. skala penilaian, tingkatan SP) hanya dicatat sebagai bookkeeping (pembacaan kebijakan selalu mengambil versi terbaru, tidak memfilter berdasarkan `effective_from`), dan pengecekan `HasActiveDuty` (`starts_on <= current_date` / `ends_on >= current_date`) tetap memakai `current_date` di SQL -- ini adalah "izin berdasarkan penugasan" yang menurut aturan di atas tetap memakai waktu asli, sama seperti pola yang sudah ada di `attendance`.

## Implementasi

Browser mengirim `X-Simulation-Time` berisi waktu efektif dalam RFC3339 pada request yang mendukung simulasi. Backend mewajibkan sesi login interaktif dan memeriksa izin `platform_superadmin` pada pelaku asli, termasuk saat impersonation. Header yang tidak valid atau tanpa izin ditolak.

Middleware memasang waktu pada context request; service bisnis mengambilnya lewat `clock.Now(ctx, fallback)`. Jam proses, database, dan `clock.Real` tidak diubah. Jangan mengganti jam autentikasi atau audit dengan helper simulasi.

Pengujian mencakup isolasi request, penolakan pengguna tanpa izin, impersonation, pergantian tanggal WITA, scan masuk/pulang, batas koreksi, dan batas edit jadwal. Untuk kesiswaan dan pelaporan: nomor surat peringatan mengikuti tahun simulasi (`discipline/simulation_integration_test.go`), tanggal publikasi rapor mengikuti waktu simulasi (`grading/simulation_integration_test.go`), dan waktu check-in/check-out tamu plus status overstay di gate board mengikuti waktu simulasi (`visitors/service/simulation_integration_test.go`) -- setiap kasus juga membuktikan request tanpa header simulasi tetap memakai jam asli.
