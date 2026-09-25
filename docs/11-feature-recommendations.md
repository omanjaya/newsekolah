# 11. Rekomendasi Fitur

Pendapat tentang fitur yang paling memudahkan pengguna, diurutkan menurut dampak terhadap adopsi di sekolah baru. Fitur dari aplikasi lama tetap dipertahankan seluruhnya (inventaris di 01-analisis-aplikasi-lama.md); daftar ini adalah tambahan dan perbaikan pengalaman.

## Tingkat 1: penentu adopsi sekolah baru

| #   | Fitur                                       | Masalah yang diselesaikan                                | Catatan implementasi                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Wizard onboarding sekolah**               | Sekolah baru butuh berhari-hari menyiapkan master data   | Langkah: profil dan logo, jenjang (SD/SMP/SMA/SMK) yang menentukan template kelas dan penilaian, tahun ajaran dan semester, jam pelajaran (template 45 menit dengan istirahat), import guru dan siswa, undang admin. Bisa dijeda dan dilanjutkan                                                            |
| 2   | **Import dari Dapodik dan Excel**           | Data siswa dan guru sudah ada di Dapodik                 | Terima ekspor Excel Dapodik (siswa, PTK, rombel) dan template sendiri; preview, deteksi duplikat, pemetaan kolom tersimpan, rollback per batch                                                                                                                                                              |
| 3   | ~~**Portal dan aplikasi orang tua**~~       | Orang tua tidak tahu anak alfa atau izin keluar          | Diputuskan tidak dikerjakan (keputusan produk, 25 Sep 2026, lihat [15-paritas-sion.md](15-paritas-sion.md)): tidak ada akun login orang tua atau fitur apa pun untuk orang tua yang masuk. Data kontak wali (nama, telepon, hubungan) tetap ada di profil siswa untuk surat, laporan, dan WhatsApp ke wali. |
| 4   | **Notifikasi WhatsApp dan email**           | Push web sering tidak sampai; orang tua memakai WhatsApp | Adapter WhatsApp Business API (resmi) atau gateway yang dipilih sekolah; template pesan per peristiwa; preferensi per pengguna; log pengiriman                                                                                                                                                              |
| 5   | **Presensi cepat untuk guru**               | Mengisi presensi per siswa lambat di HP                  | Default semua Hadir, sentuh untuk ubah, pencarian nama, mode "hanya yang tidak hadir", kerja offline, satu ketukan salin dari sesi sebelumnya                                                                                                                                                               |
| 6   | **Dashboard "hari ini" per peran**          | Pengguna mencari menu untuk hal rutin                    | Guru: jadwal berikutnya dengan tombol presensi; kepala: kehadiran real-time; siswa: status hari ini dan izin aktif; BK: antrean                                                                                                                                                                             |
| 7   | **Pencarian global dan command palette**    | Menu banyak (60+ halaman)                                | `Ctrl/Cmd+K`: cari siswa, guru, kelas, halaman, aksi ("buat izin"); hasil dibatasi permission                                                                                                                                                                                                               |
| 8   | **Kartu pelajar dan kartu pegawai digital** | QR tersebar di beberapa tempat                           | Satu kartu di aplikasi: foto, NIS/NIP, QR dinamis berpurpose, dapat ditambahkan ke Apple Wallet / Google Wallet; menggantikan kartu fisik untuk gerbang dan perpustakaan                                                                                                                                    |

## Tingkat 2: mengurangi beban operasional

| #   | Fitur                                      | Catatan                                                                                                                                          |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 9   | **Kalender akademik terpadu**              | Libur nasional otomatis, hari efektif, ujian; dipakai penjadwalan, perhitungan jatuh tempo perpustakaan, dan laporan kehadiran                   |
| 10  | **Pusat laporan**                          | Semua ekspor (PDF/XLSX) di satu tempat dengan jadwal otomatis (rekap mingguan ke kepala sekolah via email), riwayat unduhan, format sesuai Dinas |
| 11  | **Editor template dokumen**                | Surat izin, SP, kartu, label dengan variabel `{{siswa.nama}}`; pratinjau langsung; kop surat dari branding                                       |
| 12  | **Audit log dan pemulihan**                | Linimasa perubahan per objek, siapa mengubah presensi; tempat sampah untuk master data yang terhapus; batalkan aksi dalam 10 detik               |
| 13  | **Pengaturan mandiri per sekolah**         | Ambang SP, aturan terlambat, jendela koreksi presensi, modul aktif, bahasa, zona waktu; tidak lagi lewat SQL                                     |
| 14  | **Manajemen sesi dan perangkat**           | Pengguna melihat perangkat aktif dan bisa keluar dari semuanya                                                                                   |
| 15  | **Pusat bantuan dalam aplikasi**           | Panduan per halaman, tur singkat saat pertama masuk, video 1 menit; mode sandbox dengan data contoh untuk pelatihan guru                         |
| 16  | **Pengumuman bertarget dengan tanda baca** | Target per peran, kelas, angkatan; lampiran; konfirmasi "sudah dibaca"; terjadwal                                                                |
| 17  | **Aksi massal**                            | Pindah kelas, naik kelas, kelulusan, reset password massal, penugasan guru per semester dengan salin dari semester lalu                          |

## Tingkat 3: nilai tambah dan diferensiasi

| #   | Fitur                                      | Catatan                                                                                                                        |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 18  | **SPP dan pembayaran**                     | Tagihan, virtual account (Midtrans/Xendit), rekonsiliasi; project `laporanspp` yang sudah ada menjadi referensi domain         |
| 19  | **Integrasi e-Rapor dan Dapodik dua arah** | Ekspor format resmi, sinkron perubahan rombel                                                                                  |
| 20  | **API publik dan webhook**                 | Sekolah dengan sistem lain (perpustakaan RFID, absen sidik jari, CBT) bisa integrasi; token API per tenant                     |
| 21  | **Analitik peringatan dini**               | Siswa dengan tren alfa/terlambat naik, nilai turun; ditampilkan ke wali kelas dan BK dengan penjelasan, bukan skor hitam kotak |
| 22  | **Absensi guru dan pegawai**               | Check-in berbasis lokasi atau QR di gerbang, rekap untuk TPP; project `absensi` yang ada sebagai referensi                     |
| 23  | **Ekstrakurikuler dan kegiatan**           | Pendaftaran, presensi kegiatan, sertifikat                                                                                     |
| 24  | **Mode kiosk sekolah**                     | Layar di lobi: monitor kehadiran, pengumuman, scan kunjungan perpustakaan; token tampilan, tanpa login                         |
| 25  | **Multi-bahasa**                           | `id` default, `en` untuk sekolah internasional; kerangka i18n sejak awal                                                       |

## Perbaikan pengalaman yang murah tetapi terasa

- Pesan error yang menjelaskan tindakan berikutnya ("Tahun ajaran belum aktif. Aktifkan di Pengaturan > Tahun Ajaran") dengan tautan.
- Status kosong yang mengajari ("Belum ada jadwal. Impor dari Excel atau buat manual").
- Simpan draf otomatis pada form panjang (jurnal, konseling).
- Tanggal relatif dan zona waktu sekolah yang konsisten di semua tampilan.
- Mode gelap mengikuti sistem.
- Pintasan keyboard di tabel (j/k, enter, / untuk cari) untuk operator TU.
- Konfirmasi tindakan berbahaya menyebut objeknya ("Hapus kelas X-2 beserta 36 penugasan siswa?").

## Fitur lama yang perlu dirombak, bukan disalin

| Fitur lama                                                  | Masalah                                                | Bentuk baru                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| Tiga algoritma status harian siswa berbeda                  | Angka di kalender, wali kelas, dan laporan tidak cocok | Satu fungsi domain `DailyStatus` dengan aturan yang dapat diatur sekolah |
| Izin keluar dua jam menandai seharian dispensasi            | Data presensi salah                                    | Status per sesi; izin keluar hanya menimpa sesi dalam rentang waktu      |
| QR guru tanpa purpose                                       | QR presensi bisa dipakai menyetujui izin keluar        | `scan_tokens.purpose` wajib                                              |
| Nomor surat `COUNT+1`                                       | Duplikat saat bersamaan                                | Sequence per tenant per tahun                                            |
| Alur terlambat yang tidak pernah selesai memblokir presensi | Siswa hilang dari presensi                             | Kedaluwarsa otomatis di akhir hari lewat job                             |
| Login biometrik berbasis token panjang di localStorage      | Tidak aman                                             | Passkey (WebAuthn) di web, biometrik membuka SecureStore di mobile       |
