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

Susunan yang berlaku (17 November 2026), dengan nama menu persis seperti di aplikasi:

```
Beranda
Perlu tindakan       angka antrean
Pindai               siswa, satpam, guru piket
Pengumuman           hanya pembuat pengumuman
Laporan              pusat laporan, laporan perpustakaan, rekap kunjungan

AKADEMIK             Jadwal dan kalender, Presensi dan jurnal, Nilai, Wali kelas
KESISWAAN            Izin dan keterlambatan, Tata tertib, Konseling BK, Kegiatan siswa
PIKET DAN GERBANG    Piket, Buku tamu
KEPEGAWAIAN          Presensi pegawai, Supervisi
PERPUSTAKAAN         Dasbor perpustakaan, Katalog, Sirkulasi, Anggota, Pengaturan perpustakaan
ADMINISTRASI         Tagihan dan pembayaran
DATA SEKOLAH         Siswa dan kelas, Pengguna dan akses, Pembelajaran, Tahun ajaran, Struktur sekolah

-- bawah --
Pengaturan sekolah   satu halaman, empat bagian, dengan pencarian
Kelola sekolah       konsol platform
```

Lonceng di header memuat Notifikasi dan Pengumuman. Menu avatar memuat Profil, Presensi saya, Keamanan akun, dan Tampilan.

Menu sidebar, judul halaman, breadcrumb, dan tab area membaca label yang sama dari registri navigasi, jadi satu halaman hanya punya satu nama. Rute yang sekarang hanya mengalihkan (Aturan peminjaman, Jenis anggota) tetap ada tetapi tidak tampil di menu maupun di pencarian `Ctrl+K`. `offeredTo` di registri mempersempit siapa yang ditawari sebuah menu tanpa menutup rutenya: Keterlambatan hanya untuk siswa, Peringatan dini untuk peran pengawas dan tugas BK, pimpinan, atau wali kelas, dan Jurnal mengajar tidak untuk tugas gerbang.

## Tab bawah HP per peran

Di HP sidebar diganti tab bawah: Beranda, dua tab, **tombol tengah** yang menonjol, satu tab, lalu Menu. Tombol tengah adalah satu tugas utama pembaca hari itu dan menggantikan tombol "+" mengambang yang lama. Aturannya ada di `apps/web/lib/mobile-navigation.ts`; peran dikenali dari jenis profil, tugas tambahan, dan menu yang dipegang, dalam urutan baris tabel ini (baris pertama yang cocok yang dipakai).

| Peran                  | Dikenali dari                             | Bilah (tombol tengah ditebalkan)                                                             |
| ---------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| Siswa                  | jenis profil siswa                        | Beranda, Jadwal, **Pindai**, Izin, Menu                                                      |
| TU, admin              | memegang Pengguna sekolah                 | Beranda, Tindakan, **Aksi cepat**, Pengguna, Menu                                            |
| Guru BK                | tugas BK atau halaman Catatan konseling   | Beranda, Tindakan, **Catat** (pelanggaran), Konseling, Menu                                  |
| Guru piket             | tugas piket                               | Beranda, Pindai, **QR piket**, Presensi, Menu                                                |
| Satpam                 | tugas gerbang                             | Beranda, Tamu, **Pindai**, Izin, Menu                                                        |
| Pustakawan             | tugas pustakawan atau Sirkulasi           | Beranda, Katalog, **Sirkulasi**, Anggota, Menu                                               |
| Kepala sekolah, wakil  | tugas pimpinan atau Presensi pegawai      | Beranda, Laporan, **Tindakan**, Presensi, Menu                                               |
| Petugas buku tamu lain | memegang Buku tamu                        | Beranda, Tamu, **Pindai** (atau Tambah tamu), Izin, Menu                                     |
| Wali kelas             | jenis profil guru dengan tugas wali kelas | Beranda, Tindakan, **Presensi** (isi presensi), Jadwal, Menu                                 |
| Guru                   | jenis profil guru                         | Beranda, Jadwal, **Presensi** (isi presensi), Nilai, Menu                                    |
| Lainnya                | selain di atas                            | Beranda, dua dari Tindakan, Pindai, Jadwal, Presensi, Laporan, dengan pilihan umum di tengah |

Aturan tambahan:

- Tombol tengah tidak pernah menuju halaman yang tertutup bagi pembaca (izin atau modul). Bila tujuan perannya tertutup, tombol memakai pilihan umum: lembar aksi cepat bila pembaca punya dua aksi cepat atau lebih, aksi itu sendiri bila hanya satu, selain itu Perlu tindakan. TU dan admin selalu mendapat pilihan umum.
- Tombol Presensi guru langsung membuka sesi yang sedang berjalan atau berikutnya begitu jadwal hari itu termuat.
- Tujuan tombol tengah tidak diulang sebagai tab. Bila salah satu tab peran tidak terbuka bagi pembaca, slotnya diisi Profil, Perlu tindakan, atau Pindai.
- Pembaca tanpa tombol tengah mendapat Beranda dan tiga tab sebelum Menu.
- Aksi cepat yang bukan tombol tengah tetap ada di lembar Menu, kecuali bila tombol tengah sendiri membuka lembar aksi cepat.
- Angka antrean menempel di tab (atau tombol tengah) tempat antrean itu berada; Menu menjumlahkan sisanya.

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
| 9   | Presensi pegawai menjadi kartu di beranda dan entri menu avatar                                             | Presensi saya                                  |
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

| Bagian                                                                                          | Status                                                                                                         |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Grup Piket & Gerbang; Absensi Saya ke menu avatar; grup satu menu dilebur                       | Selesai                                                                                                        |
| Scan universal (`/scan`), kamera beruntun dengan umpan balik warna dan getar                    | Selesai                                                                                                        |
| Perlu Tindakan (`/inbox`) sebagai satu-satunya tempat menyetujui izin, dengan setujui sekaligus | Selesai                                                                                                        |
| Profil Siswa (`/students/[id]`); nama siswa di daftar staf menaut ke profil                     | Selesai                                                                                                        |
| `Ctrl+K`: cari siswa dan aksi cepat; tombol tengah di tab bawah HP (menggantikan tombol "+")    | Selesai                                                                                                        |
| Pengaturan Sekolah (`/settings`) dan Pengaturan Perpustakaan (`/library/settings`)              | Selesai                                                                                                        |
| Lonceng dengan tab Pengumuman; menu Pengumuman hanya untuk pembuat pengumuman                   | Selesai                                                                                                        |
| Kartu beranda: absen masuk/pulang, siswa berisiko (BK), kehadiran hari ini (pimpinan)           | Selesai                                                                                                        |
| Kandidat dan riwayat SP sebagai tab di Tata Tertib; Wali Kelas sebagai hub bertab               | Selesai                                                                                                        |
| Pembelajaran (mapel + pembagian tugas) dan Kegiatan Siswa (ekskul + pendampingan) satu menu     | Selesai                                                                                                        |
| Perpustakaan: Stok Opname di Katalog, Kunjungan di Sirkulasi                                    | Selesai                                                                                                        |
| Status alur kerja memakai satu pemetaan warna dan kata (`SemanticStatusBadge`)                  | Selesai                                                                                                        |
| Tab bawah mobile mengikuti peran                                                                | Selesai                                                                                                        |
| Jurnal di layar presensi                                                                        | Sudah ada sebelumnya (`session-journal-panel`)                                                                 |
| Laporan satu pintu                                                                              | Sebagian: `/reports` menggabungkan pusat laporan, laporan perpustakaan, dan rekap kunjungan dengan satu header |
| Orang tua tanpa sidebar                                                                         | Belum: web belum punya jenis profil orang tua                                                                  |

## Celah yang ditemukan

- **Tab Nilai di Wali Kelas belum ada.** Tidak ada endpoint nilai satu kelas lintas mapel; buku nilai butuh kelas dan mapel sekaligus.
- **Tab Izin di Profil Siswa hanya menampilkan izin yang menunggu pembaca.** Belum ada endpoint riwayat izin per siswa (`GET /v1/students/{id}/leave-requests` atau filter `student_id`).
- **Tab Nilai di Profil Siswa** memakai snapshot pendampingan (nilai terbit bulan ini, izin `view_mentoring`).
- **Cari siswa di `Ctrl+K`** belum menampilkan kelas dan NIS; endpoint direktori hanya mengirim nama dan username.
- **Detail izin dan izin keluar** belum menaut ke profil siswa; payload detail hanya membawa `student_name`.
- **Scan terlambat** belum bisa membawa alasan, dan input manual harus kode lengkap `sion:...`.
- **Hitungan kandidat SP** di Perlu Tindakan hanya mencakup 200 kandidat pertama. Rekomendasi: endpoint hitungan khusus (lihat audit skalabilitas web).

Audit skalabilitas: [backend](analysis/audit-skalabilitas-2026-10-10.md) dan [web](analysis/audit-skalabilitas-web-2026-10-10.md).
