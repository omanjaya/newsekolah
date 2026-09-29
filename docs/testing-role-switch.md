# Ganti role dari topbar

Superadmin dapat membuka **Ganti role** di topbar untuk menguji aplikasi sebagai akun lain di sekolah yang sama.

1. Pilih role, misalnya Guru, Siswa, atau Orang tua.
2. Cari dan pilih akun aktif yang akan dipakai untuk testing.
3. Mulai testing. Menu, izin, dan data aplikasi mengikuti akun tersebut.
4. Gunakan kontrol yang sama untuk berpindah ke akun atau role lain.
5. Pilih **Kembali ke superadmin** setelah selesai.

Role yang tidak mempunyai akun aktif menampilkan daftar kosong. Fitur ini tidak membuat akun baru dan tidak mengubah penetapan role. Jika akun mempunyai beberapa role atau tugas tambahan, izin tambahannya tetap berlaku, sama seperti ketika akun tersebut login sendiri.

## Simulasi waktu

Aktifkan [simulasi tanggal dan jam](testing-time-simulation.md) sebelum berganti role untuk menguji absensi dan jadwal. Pengaturan waktu tetap mengikuti superadmin asal dan sekolahnya saat berganti akun maupun kembali ke superadmin.

## Sesi dan data

- Testing dibatasi hingga 30 menit dengan waktu asli. Mengganti akun atau menggeser waktu simulasi tidak memperpanjang batas ini.
- Akses kontrol testing diperiksa oleh backend menggunakan sesi superadmin asal. Pengguna biasa tidak memperoleh kontrol ini hanya karena mempunyai role yang sedang diuji.
- Kredensial untuk kembali ke superadmin disimpan melalui cookie HttpOnly yang dilindungi server, bukan localStorage atau sessionStorage.
- Login browser menggunakan cookie bersama antartab. Pergantian sesi dapat membuat tab lain perlu memuat ulang atau login kembali.
- Impersonation biasa melalui daftar pengguna tetap terpisah dari kontrol testing ini.

**Perubahan yang disimpan selama testing adalah perubahan data sungguhan.** Kembali ke superadmin tidak membatalkan absensi, perubahan jadwal, atau aksi lainnya. Gunakan sekolah dan akun pengujian.
