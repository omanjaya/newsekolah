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

## Implementasi

Browser mengirim `X-Simulation-Time` berisi waktu efektif dalam RFC3339 pada request yang mendukung simulasi. Backend mewajibkan sesi login interaktif dan memeriksa izin `platform_superadmin` pada pelaku asli, termasuk saat impersonation. Header yang tidak valid atau tanpa izin ditolak.

Middleware memasang waktu pada context request; service bisnis mengambilnya lewat `clock.Now(ctx, fallback)`. Jam proses, database, dan `clock.Real` tidak diubah. Jangan mengganti jam autentikasi atau audit dengan helper simulasi.

Pengujian mencakup isolasi request, penolakan pengguna tanpa izin, impersonation, pergantian tanggal WITA, scan masuk/pulang, batas koreksi, dan batas edit jadwal.
