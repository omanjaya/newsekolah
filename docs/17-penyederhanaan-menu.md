# 17. Penyederhanaan Menu

Rencana mengurangi menu sidebar supaya setiap pengguna menemukan pekerjaannya tanpa harus menghafal letak fitur. Dokumen ini melengkapi bagian "Arsitektur informasi" di [07-ui-ux.md](07-ui-ux.md).

## Masalah

- Ada sekitar 85 halaman. Sebagian sudah digabung menjadi menu bertab (`apps/web/lib/navigation-workspaces.ts`), tetapi admin masih melihat sekitar 31 menu dalam 8 grup.
- Grup disusun per modul teknis, bukan per pekerjaan. Contohnya Kesiswaan berisi izin, pelanggaran, konseling, kegiatan, mentoring, piket, dan scan masuk kelas.
- Menu pribadi tercecer. Absen saya, pinjaman buku saya, dan laporan supervisi saya berada di grup yang berbeda-beda.
- Ada grup yang hanya berisi satu menu untuk sebagian pengguna, misalnya Perpustakaan untuk guru biasa.
- Banyak menu sebenarnya hanya untuk dilihat (monitor, siswa berisiko), atau merupakan akibat dari fitur lain (surat peringatan dari pelanggaran, jurnal dari presensi).

## Prinsip

1. **Beranda menjawab "apa yang harus saya kerjakan sekarang".** Tugas harian selesai dari beranda tanpa membuka menu.
2. **Kelompokkan per pekerjaan, bukan per modul.** Urutkan dari yang paling sering dipakai.
3. **Maksimal enam menu per grup.** Kalau lebih, gabungkan menjadi tab di satu halaman.
4. **Grup berisi satu menu dilebur.** Menunya naik ke atas tanpa judul grup.
5. **Tiga pertanyaan untuk setiap menu:**
   - Hanya dilihat, tidak dikerjakan? Jadikan kartu di beranda.
   - Akibat dari fitur lain? Jadikan bagian dari fitur induknya.
   - Diatur sekali lalu jarang disentuh? Pindahkan ke Pengaturan.

## Struktur sidebar

```
Beranda
Perlu Tindakan       badge jumlah antrean
Scan                 siswa, satpam, guru piket
Laporan

AKADEMIK             Jadwal, Presensi & Jurnal, Nilai, Wali Kelas
KESISWAAN            Izin & Keterlambatan, Tata Tertib, Konseling BK, Kegiatan & Prestasi, Pendampingan
PIKET & GERBANG      Piket, Buku Tamu
KEPEGAWAIAN          Absensi Pegawai, Supervisi
PERPUSTAKAAN         Sirkulasi, Katalog, Anggota, Kunjungan, Stok Opname, Pengaturan Perpustakaan
ADMINISTRASI         Tagihan & Pembayaran
DATA SEKOLAH         Siswa & Kelas, Pengguna & Akses, Mata Pelajaran, Pembagian Tugas, Tahun Ajaran, Struktur Sekolah

-- bawah --
Pengaturan Sekolah   satu halaman, empat bagian, dengan pencarian
Kelola Sekolah       konsol platform
```

Lonceng di header memuat Notifikasi dan Pengumuman. Menu avatar memuat Profil, Absensi Saya, Keamanan, dan Tampilan.

## Penggabungan fitur

| No  | Penggabungan                                                                                                | Menu yang hilang dari sidebar                  |
| --- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | Satu halaman **Scan** (`/scan`) membaca semua QR dan memilih aksi dari tujuan token                         | Scan Masuk Kelas dan layar scan lain           |
| 2   | Satu kotak **Perlu Tindakan** (`/inbox`) untuk izin, izin keluar, terlambat, dan SP                         | Antrean per jenis                              |
| 3   | Pengumuman dan Notifikasi masuk ke lonceng                                                                  | Pengumuman (kecuali bagi pembuat pengumuman)   |
| 4   | Laporan satu pintu, dengan tombol Ekspor di tiap modul                                                      | Laporan per modul                              |
| 5   | Jurnal menjadi bagian bawah layar presensi sesi                                                             | -                                              |
| 6   | Layar kiosk dibuka dari halaman induknya                                                                    | Kiosk Perpustakaan, Kiosk Kunjungan, Monitor   |
| 7   | **Pengaturan Perpustakaan** (`/library/settings`): aturan pinjam, jenis anggota, data                       | Aturan Peminjaman, Jenis Anggota, Data Pustaka |
| 8   | **Pengaturan Sekolah** (`/settings`) dengan empat bagian dan pencarian                                      | Sub-halaman pengaturan                         |
| 9   | Absen pegawai menjadi kartu di beranda dan entri menu avatar                                                | Absensi Saya                                   |
| 10  | **Wali Kelas** menjadi pusat kerja wali kelas, dengan tab presensi, izin, tata tertib, nilai, dan orang tua | -                                              |
| 11  | Kandidat dan riwayat **Surat Peringatan** masuk ke halaman Tata Tertib                                      | Surat Peringatan                               |
| 12  | Siswa berisiko dan kehadiran hari ini menjadi kartu beranda                                                 | -                                              |
| 13  | **Profil Siswa** (`/students/[id]`) menggantikan tiga halaman detail siswa                                  | -                                              |
| 14  | Orang tua tidak memakai sidebar, cukup beranda per anak                                                     | -                                              |

## Profil Siswa

Satu halaman untuk semua orang yang mengurus siswa. Header berisi identitas, kelas, dan NIS, dengan aksi utama di kanan. Tabnya: Ringkasan, Presensi, Nilai, Izin, Tata Tertib, Konseling (hanya BK), Perpustakaan, dan Orang Tua. Setiap tab hanya tampil bila pembaca memegang izin untuk datanya.

## Data Sekolah

Data Sekolah dibuka serius sekali di awal tahun ajaran, lalu sesekali saja. Grupnya ditaruh paling bawah dan tertutup secara bawaan. Guru tidak melihat grup ini sama sekali. Wizard Tahun Ajaran Baru menjadi pintu utama awal tahun, dan beranda admin menampilkan daftar data yang belum lengkap beserta tautan perbaikannya.

## Status (10 Oktober 2026)

| Bagian                                                                                          | Status                                         |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Grup Piket & Gerbang; Absensi Saya ke menu avatar; grup satu menu dilebur                       | Selesai                                        |
| Scan universal (`/scan`), kamera beruntun dengan umpan balik warna dan getar                    | Selesai                                        |
| Perlu Tindakan (`/inbox`) sebagai satu-satunya tempat menyetujui izin, dengan setujui sekaligus | Selesai                                        |
| Profil Siswa (`/students/[id]`); nama siswa di daftar staf menaut ke profil                     | Selesai                                        |
| `Ctrl+K`: cari siswa dan aksi cepat; tombol "+" di tab bawah HP                                 | Selesai                                        |
| Pengaturan Sekolah (`/settings`) dan Pengaturan Perpustakaan (`/library/settings`)              | Selesai                                        |
| Lonceng dengan tab Pengumuman; menu Pengumuman hanya untuk pembuat pengumuman                   | Selesai                                        |
| Kartu beranda: absen masuk/pulang, siswa berisiko (BK), kehadiran hari ini (pimpinan)           | Selesai                                        |
| Kandidat dan riwayat SP sebagai tab di Tata Tertib; Wali Kelas sebagai hub bertab               | Selesai                                        |
| Pembelajaran (mapel + pembagian tugas) dan Kegiatan Siswa (ekskul + pendampingan) satu menu     | Selesai                                        |
| Perpustakaan: Stok Opname di Katalog, Kunjungan di Sirkulasi                                    | Selesai                                        |
| Status alur kerja memakai satu pemetaan warna dan kata (`SemanticStatusBadge`)                  | Selesai                                        |
| Tab bawah mobile mengikuti peran                                                                | Selesai                                        |
| Jurnal di layar presensi                                                                        | Sudah ada sebelumnya (`session-journal-panel`) |
| Laporan satu pintu                                                                              | Belum                                          |
| Orang tua tanpa sidebar                                                                         | Belum: web belum punya jenis profil orang tua  |

## Celah yang ditemukan

- **Tab Nilai di Wali Kelas belum ada.** Tidak ada endpoint nilai satu kelas lintas mapel; buku nilai butuh kelas dan mapel sekaligus.
- **Tab Izin di Profil Siswa hanya menampilkan izin yang menunggu pembaca.** Belum ada endpoint riwayat izin per siswa (`GET /v1/students/{id}/leave-requests` atau filter `student_id`).
- **Tab Nilai di Profil Siswa** memakai snapshot pendampingan (nilai terbit bulan ini, izin `view_mentoring`).
- **Cari siswa di `Ctrl+K`** belum menampilkan kelas dan NIS; endpoint direktori hanya mengirim nama dan username.
- **Detail izin dan izin keluar** belum menaut ke profil siswa; payload detail hanya membawa `student_name`.
- **Scan terlambat** belum bisa membawa alasan, dan input manual harus kode lengkap `sion:...`.
- **Hitungan kandidat SP** di Perlu Tindakan hanya mencakup 200 kandidat pertama. Rekomendasi: endpoint hitungan khusus (lihat audit skalabilitas web).

Audit skalabilitas: [backend](analysis/audit-skalabilitas-2026-10-10.md) dan [web](analysis/audit-skalabilitas-web-2026-10-10.md).
