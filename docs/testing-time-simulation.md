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

## Implementasi

Browser mengirim `X-Simulation-Time` berisi waktu efektif dalam RFC3339 pada request yang mendukung simulasi. Backend mewajibkan sesi login interaktif dan memeriksa izin `platform_superadmin` pada pelaku asli, termasuk saat impersonation. Header yang tidak valid atau tanpa izin ditolak.

Middleware memasang waktu pada context request; service bisnis mengambilnya lewat `clock.Now(ctx, fallback)`. Jam proses, database, dan `clock.Real` tidak diubah. Jangan mengganti jam autentikasi atau audit dengan helper simulasi.

Pengujian mencakup isolasi request, penolakan pengguna tanpa izin, impersonation, pergantian tanggal WITA, scan masuk/pulang, batas koreksi, dan batas edit jadwal.
