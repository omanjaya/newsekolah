# Usulan penyatuan halaman dan sidebar sekolah

Tanggal: 29 September 2026. Status: diterapkan pada web dan navigasi mobile web; validasi integrasi dicatat di bawah.

## Keputusan utama

Satukan halaman berdasarkan pekerjaan yang diselesaikan pengguna: mengajar satu pertemuan, memproses izin, melayani peminjaman, mengelola satu tahun ajaran. Menu bukan daftar seluruh route. Impor, cetak, kios, konfigurasi, dan laporan kontekstual menjadi tindakan dari halaman pemiliknya.

Tetap sediakan tujuan tersendiri untuk pekerjaan yang berbeda: wali kelas, konseling BK, supervisi, stok opname, penilaian, dan pembayaran. Penyatuan tampilan tidak berarti menyatukan tabel data, aturan bisnis, atau hak akses.

Sidebar mengikuti izin, tugas/penugasan, dan konteks pengguna. Akun dengan banyak tugas memperoleh gabungan menu tanpa duplikasi; tidak perlu berganti peran untuk bekerja. Menu tidak diurutkan ulang otomatis berdasarkan frekuensi pemakaian.

## Dasar pemeriksaan

- Registri saat ini berisi 82 tujuan: 64 berpenempatan utama, 13 footer, dan 5 tersembunyi dari sidebar. Angka ini sebelum penyaringan permission/profil, bukan jumlah yang dilihat setiap pengguna.
- Grup utama sudah tertutup secara default kecuali grup aktif. Menambah accordion tidak menyelesaikan banyaknya pilihan di dalam grup.
- Jurnal sudah menjadi bagian editor sesi presensi; halaman jurnal terpisah memberi akses cepat dan riwayat yang perlu tetap tersedia saat digabung.
- `homeroom` hanya mensyaratkan `view_attendance`, sedangkan halaman sebenarnya memeriksa tugas wali kelas. `view_academic_data` diberikan juga kepada siswa dan dipakai untuk beberapa menu data sekolah. Izin membaca data pendukung belum membuktikan relevansi suatu menu.
- Pengguna Sekolah mencakup guru, pegawai, siswa, dan orang tua; tidak tepat mengganti namanya menjadi GTK tanpa memisahkan fungsi akun.
- Penilaian sudah memiliki ekspor e-Rapor. Belum ada dasar untuk menamai seluruh fitur sebagai penerbitan rapor lengkap.
- Billing telah mencakup tagihan, pembayaran, jenis biaya, pembuatan tagihan, dan tunggakan. Halaman ini tidak perlu dipecah lagi.
- Halaman orang tua sudah menggabungkan kehadiran, nilai, kedisiplinan, tagihan, dan persetujuan izin per anak.

Sumber kode: `apps/web/lib/navigation*.ts`, `components/sidebar.tsx`, `lib/navigation-permissions.ts`, `lib/mobile-navigation.ts`, `apps/api/internal/platform/authz/role_defaults.go`, serta komponen fitur terkait. Pemeriksaan ini berbasis kode; belum merupakan hasil observasi langsung pengguna atau pengukuran pemakaian produksi.

## Acuan Indonesia dan bahasa

Gunakan Dapodik sebagai acuan istilah administrasi sekolah seperti peserta didik, rombongan belajar, GTK, tahun ajaran, pembelajaran, dan tugas tambahan. Istilah tersebut muncul dalam [dokumentasi/perubahan resmi Dapodik](https://dapo.kemendikdasmen.go.id/unduhan). Untuk label sehari-hari, usulan ini memilih “Siswa & Kelas”, “Mata Pelajaran”, dan “Pembagian Tugas”, dengan istilah resmi dalam bantuan atau ekspor.

[Panduan resmi e-Rapor SMK](https://smk.kemendikdasmen.go.id/p/e-rapor-smk) membedakan pekerjaan administrator, guru mapel, wali kelas, dan siswa. Ini mendukung usulan akses berdasarkan pekerjaan. Tidak berarti semua sekolah harus memakai struktur menu e-Rapor atau seluruh fiturnya sudah tersedia di aplikasi ini.

[Dokumentasi resmi SLiMS](https://slims.web.id/web/pages/docs/) menjadi acuan konteks perpustakaan. [Alur stok opname SLiMS](https://slims.web.id/docs/user-guide/Modules/Stocktake/initialize/current/) memasukkan nomor eksemplar untuk inventarisasi; pekerjaan ini tetap membutuhkan ruang tersendiri, berbeda dari transaksi pinjam-kembali.

Acuan tersebut membuktikan istilah dan contoh alur di ekosistem Indonesia, bukan peringkat popularitas atau bukti bahwa rancangan ini sudah paling mudah. Kesederhanaannya masih perlu diuji dengan pengguna sekolah.

| Label yang disarankan            | Catatan                                                                                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Beranda                          | Hindari Dashboard pada label utama.                                                                                                                         |
| Absensi Siswa / Absensi & Jurnal | Gunakan istilah secara konsisten; pencarian tetap menerima “presensi” dan “kehadiran”. Pilihan “absensi” adalah usulan bahasa, bukan hasil survei nasional. |
| Absensi Saya / Absensi Pegawai   | Bedakan tindakan pribadi dan pengelolaan pegawai.                                                                                                           |
| Wali Kelas                       | Lebih langsung daripada Kelas Binaan; tidak disamakan dengan Guru Wali.                                                                                     |
| Pendampingan Siswa               | Halaman mentoring; sebut Guru Wali pada nama penanggung jawab.                                                                                              |
| Izin & Keterlambatan             | Jangan menyebut terlambat sebagai jenis izin yang otomatis disetujui.                                                                                       |
| Tata Tertib                      | Catatan pelanggaran, tindak lanjut, dan surat peringatan.                                                                                                   |
| Konseling BK                     | Tetap terpisah dari hukuman/pelanggaran.                                                                                                                    |
| Siswa & Kelas                    | Rombel dipakai dalam penjelasan administratif.                                                                                                              |
| Pengguna & Akses                 | Akun semua jenis pengguna dan pemberian peran.                                                                                                              |
| Tagihan & Pembayaran             | Jangan menjanjikan akuntansi sekolah lengkap dengan label “Keuangan”.                                                                                       |
| Sirkulasi                        | Untuk petugas, dengan judul halaman “Peminjaman & Pengembalian”.                                                                                            |
| Stok Opname                      | Pertahankan istilah pekerjaan pustakawan; bantu dengan penjelasan “Pemeriksaan koleksi”.                                                                    |
| Pengaturan Sekolah               | Identitas, dokumen, notifikasi, keamanan sistem, integrasi, persetujuan, dan audit.                                                                         |

## Peta halaman tujuan

Ini inventori seluruh tujuan yang mungkin tersedia, bukan satu sidebar yang wajib ditampilkan kepada semua pengguna. Judul bagian hanya membantu penempatan; perubahan utamanya adalah penyatuan pekerjaan di dalam halaman.

### Umum

| Tujuan akhir | Keputusan                                                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Beranda      | Satu beranda sesuai pekerjaan. Ringkasan perpustakaan masuk beranda pustakawan; untuk admin lintas tugas tersedia ringkasan modul di beranda tanpa dashboard duplikat di sidebar. |
| Pengumuman   | Tetap; baca dan kelola pada halaman yang sama sesuai izin.                                                                                                                        |
| Laporan      | Tetap untuk pimpinan/operator/pengguna berizin. Menjadi pintu ke laporan lintas modul, memakai tampilan dan logika laporan milik modul, bukan membangun laporan duplikat.         |

### Pembelajaran

| Tujuan akhir      | Halaman yang disatukan                                       | Perilaku                                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jadwal & Kalender | Jadwal, kalender akademik, guru pengganti                    | Jadwal mingguan/hari ini sebagai tampilan awal; libur/kegiatan kalender sebagai lapisan atau tampilan bulanan. Ajukan pengganti dari sesi; permintaan masuk/keluar tetap punya antrean yang terlihat, bukan hanya tombol tersembunyi di satu sesi.                  |
| Absensi & Jurnal  | Presensi, jurnal, laporan presensi                           | Satu daftar sesi dan riwayat. Buka sesi untuk absensi serta jurnal. Ringkasan jelas membedakan “absensi tersimpan” dan “jurnal lengkap”; akses jurnal cepat serta rekap tetap tersedia. Untuk pengguna baca saja tampilkan label Absensi Siswa atau Kehadiran Saya. |
| Nilai             | Penilaian guru, nilai pribadi siswa sebagai varian per peran | Guru mengisi nilai, siswa membaca nilai sendiri; tidak menyatukan endpoint atau cakupan datanya. Ekspor e-Rapor tetap tindakan di halaman penilaian. Orang tua membacanya lewat Anak Saya.                                                                          |
| Wali Kelas        | Kelas binaan                                                 | Tetap ruang kerja mandiri untuk kelas yang ditugaskan. Ringkasan kehadiran, izin menunggu, dan tindak lanjut membuka detail pemilik data dengan konteks siswa/kelas.                                                                                                |

Jadwal dan absensi tetap dua tujuan: menyusun/melihat jadwal berbeda dari mencatat pelaksanaan. Keduanya saling terhubung lewat sesi yang sama. Jangan membuat satu halaman “Akademik” dengan seluruh fitur di dalamnya.

### Layanan siswa

| Tujuan akhir         | Halaman yang disatukan                               | Perilaku                                                                                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Izin & Keterlambatan | Izin terencana, izin keluar, keterlambatan           | Satu antrean/status/riwayat, dengan jenis yang jelas. Form, persetujuan, QR, dan penyelesaian tetap mengikuti alur masing-masing. Tombol siswa: Ajukan izin tidak masuk, Ajukan izin keluar, Lapor terlambat.                                                                   |
| Tata Tertib          | Pelanggaran, surat peringatan, catatan pribadi siswa | Daftar kasus dan riwayat per siswa. Terbitkan surat menjadi tindakan dari tindak lanjut; daftar surat dan arsip tetap dapat dicari. Siswa hanya melihat catatan yang berhak dilihat.                                                                                            |
| Konseling BK         | Konseling, pemantauan siswa/early warning            | Antrean siswa yang perlu perhatian dengan tautan ke riwayat terkait; buat tindak lanjut konseling jika berizin. Pengguna yang hanya berizin pemantauan tetap melihat pemantauan, tanpa catatan konseling. Tidak menganggap indikator risiko sebagai pelanggaran atau diagnosis. |
| Kegiatan & Prestasi  | Ekstrakurikuler, agenda kegiatan, prestasi           | Ruang kerja kesiswaan dengan tiga tampilan bermakna: Ekstrakurikuler, Agenda, Prestasi. Kegiatan ekskul punya anggota dan pertemuan; prestasi juga dapat dicatat mandiri tanpa kegiatan internal. Tidak dipaksa ke satu tabel CRUD.                                             |
| Pendampingan Siswa   | Kelompok mentoring, kelompok saya                    | Daftar kelompok berawal dari penugasan sendiri; pilihan semua kelompok hanya jika cakupan akses membolehkan. Satu detail kelompok/siswa untuk pencatatan dan perkembangan.                                                                                                      |
| Piket                | Piket dan akses monitor kehadiran                    | Tetap akses langsung bagi petugas; antrean, QR dan tindakan harian dalam satu ruang kerja. Monitor adalah tombol Buka layar monitor yang membuka tampilan khusus. Pimpinan berizin tetap dapat membuka monitor dari beranda kehadiran.                                          |

Pindai masuk kelas menjadi tindakan utama pada beranda/jadwal siswa, bukan tujuan sidebar tersendiri. Pada HP tetap mudah dicapai; jangan dipindahkan ke menu tambahan yang membutuhkan beberapa ketukan.

### Kepegawaian

| Tujuan akhir    | Keputusan                                                                                                                                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Absensi Pegawai | Satukan check-in pribadi dan administrasi absensi dalam satu area. Guru/pegawai tanpa izin administrasi hanya melihat Absensi Saya dan riwayat sendiri. Admin punya pilihan Saya/Semua Pegawai berdasarkan izin; tombol absen tetap langsung tersedia di beranda. |
| Supervisi       | Satukan siklus supervisi dan hasil supervisi saya. Pengamat melihat jadwal/siklus yang menjadi kewenangannya; guru melihat hasil miliknya. Laporan, observasi, dan detail guru tetap halaman turunan.                                                             |

### Data sekolah

| Tujuan akhir     | Keputusan                                                                                                                                                                                                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Siswa & Kelas    | Kelas, keanggotaan kelas, data siswa yang sesuai konteks, dan impor penempatan. Impor menjadi tindakan dengan pratinjau, bukan menu. Siswa tanpa penempatan tetap dapat ditemukan.                                                                                                              |
| Pengguna & Akses | Pengguna sekolah serta peran dan akses. Kelola akun, tautan orang tua-anak, reset sandi, dan penetapan peran dari pengguna; definisi peran melalui pengaturan akses halaman ini. Pengelolaan definisi peran tetap izin terpisah.                                                                |
| Mata Pelajaran   | Pertahankan halaman Pembelajaran yang sudah menggabungkan mapel, mapel per tahun ajaran, dan jam pelajaran. Ganti nama pintu masuk agar tugasnya lebih mudah ditebak.                                                                                                                           |
| Pembagian Tugas  | Pertahankan Penugasan: mengajar, wali/tugas tambahan, jenis tugas. Jangan dicampur ke daftar akun atau jadwal harian. Jenis tugas menjadi pengaturan, bukan tugas harian.                                                                                                                       |
| Tahun Ajaran     | Tahun ajaran, persiapan tahun baru, kenaikan/penempatan kelas menjadi satu siklus kerja. Tahun lama tetap dapat dibuka; perubahan tahun aktif dan pemindahan siswa tetap langkah tersendiri dengan pratinjau hasil. Tidak memaksa pengguna menjalankan seluruh wizard untuk koreksi satu kelas. |
| Struktur Sekolah | Pertahankan tingkat, peminatan, ruang yang sudah disatukan. Tidak perlu menambah tab ini ke Siswa & Kelas atau Mata Pelajaran.                                                                                                                                                                  |

Pengguna & Akses bukan pengganti daftar akademik siswa. Identitas orang dapat dipakai bersama, tetapi akun masuk dan penempatan kelas memiliki tujuan berbeda. Aksi edit identitas konsisten dan tidak membuat data siswa ganda.

### Perpustakaan

| Tujuan akhir | Keputusan                                                                                                                                                                                                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Katalog      | Katalog, eksemplar, impor buku. Detail judul memuat eksemplar; pencarian barcode lintas judul dan operasi massal eksemplar tetap tersedia melalui tampilan Eksemplar pada Katalog. Data referensi katalog diakses dari pengaturan Katalog.                                                                                                   |
| Sirkulasi    | Pinjam-kembali per anggota dan peminjaman kelas dalam satu ruang transaksi, dengan pilihan Individu/Kelas. Pelanggaran perpustakaan menjadi area Denda & Sanksi dan muncul juga pada transaksi/anggota. Jangan menghilangkan sanksi nonmoneter atau catatan yang tidak terkait pinjaman. Kios mandiri diluncurkan dari tindakan halaman ini. |
| Anggota      | Daftar anggota dan detailnya. Jenis anggota serta aturan pinjam dikelola lewat Pengaturan Peminjaman, terhubung dari Anggota dan Sirkulasi. Aturan dasar, pengecualian per tanggal, penutupan pinjaman, dan batas anggota tetap jelas.                                                                                                       |
| Kunjungan    | Pencatatan dan riwayat kunjungan. Tombol Buka kios kunjungan meluncurkan layar khusus.                                                                                                                                                                                                                                                       |
| Stok Opname  | Tetap; aktivitas inventarisasi, pemindaian, selisih dan penutupan opname merupakan satu pekerjaan berkala.                                                                                                                                                                                                                                   |

Ringkasan pustakawan berada di Beranda. Laporan perpustakaan diakses lewat Laporan dengan cakupan izin perpustakaan, serta tombol Rekap pada halaman terkait; akses tidak boleh mensyaratkan izin laporan umum tambahan. Pengaturan lokal tetap dapat ditemukan dari halaman perpustakaan, bukan mewajibkan hak admin sekolah.

Untuk peminjam, tampilkan Pinjaman Buku sebagai tujuan pribadi. Katalog hanya tampil bila pengguna berhak mengaksesnya; rancangan ini tidak otomatis memberi izin katalog kepada siswa. Jangan menampilkan lima menu operasional pustakawan kepada peminjam biasa.

### Tata usaha

| Tujuan akhir         | Keputusan                                                                                                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buku Tamu            | Papan tamu, tamu dijadwalkan, insiden, rekap. Hari ini sebagai awal; filter Akan Datang/Sedang Berkunjung/Selesai. Insiden tetap dapat dicatat mandiri dan memiliki tampilan sendiri bila berizin. Tidak memaksa semua insiden menjadi anak satu kunjungan. |
| Tagihan & Pembayaran | Pertahankan ruang kerja billing. Jenis biaya menjadi pengaturan; buat tagihan tindakan; tunggakan dan rekap tetap mudah dibuka. Tagihan anak tetap di Anak Saya untuk orang tua.                                                                            |

### Pengaturan, akun, dan platform

Satu pintu Pengaturan Sekolah di bawah sidebar. Isinya halaman pengaturan dengan bagian bernama jelas, bukan seluruh form dimuat dalam satu halaman panjang:

| Bagian                | Isi                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| Identitas Sekolah     | Merek sekolah, logo dan tampilan identitas organisasi.                                                 |
| Dokumen & Surat       | Template, kop laporan, penandatangan. Kop bersama dipakai dokumen terkait, bukan disalin per template. |
| Notifikasi & WhatsApp | Default notifikasi sekolah dan kanal WhatsApp. Preferensi notifikasi pribadi tetap menu akun.          |
| Login & Keamanan      | Kebijakan sesi dan SSO. Keamanan akun sendiri tetap menu avatar.                                       |
| Integrasi             | Koneksi eksternal sesuai fitur yang sudah tersedia.                                                    |
| Alur Persetujuan      | Konfigurasi workflow; tidak digabung ke antrean izin sehari-hari.                                      |
| Riwayat Aktivitas     | Audit log, tetap dapat dicari dan dibatasi izin.                                                       |

Persiapan Sekolah menjadi checklist dari Beranda dan Pengaturan, dapat dibuka kembali setelah selesai. Pengguna & Akses tetap pintu administrasi utama, dengan tautan dari Pengaturan bila dibutuhkan. Konsol Platform terpisah untuk superadmin yang berhak, diberi label Kelola Sekolah. Tidak dicampur dengan identitas satu sekolah.

Notifikasi di lonceng; Profil, Keamanan Akun, Preferensi Notifikasi, dan Tampilan di avatar. Tidak perlu dikembalikan ke sidebar.

## Contoh sidebar menurut pekerjaan

Menu berikut adalah rancangan awal; tambahan mengikuti izin dan tugas nyata. Tidak ada batas angka kaku. Pengumuman tersedia secara konsisten; Laporan hanya untuk akses yang relevan. Pintasan personal dapat ditambahkan tanpa mengubah urutan baku.

| Pengguna                  | Tujuan yang diprioritaskan                                                                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guru mapel                | Beranda, Jadwal & Kalender, Absensi & Jurnal, Nilai, Absensi Saya, Pengumuman. Pinjaman Buku dan fitur tambahan sesuai akses tetap dapat dijangkau.                                                                                    |
| Guru merangkap wali kelas | Menu guru ditambah Wali Kelas, dengan antrean izin/tindak lanjut untuk kelasnya. Tidak membutuhkan ganti peran.                                                                                                                        |
| Guru BK                   | Beranda, Izin & Keterlambatan, Tata Tertib, Konseling BK, Absensi Saya, Pengumuman, Laporan sesuai izin. Menu mengajar muncul jika memiliki penugasan mengajar.                                                                        |
| Guru piket / satpam       | Beranda, Piket, Izin & Keterlambatan sesuai kewenangan, Buku Tamu bila ditugaskan, Absensi Saya, Pengumuman. Scan/QR langsung tersedia.                                                                                                |
| Siswa                     | Beranda, Jadwal & Kalender, Kehadiran Saya, Nilai Saya, Izin & Keterlambatan, Catatan Tata Tertib, Pinjaman Buku, Pengumuman. Pindai masuk kelas menjadi tombol utama. Tidak menampilkan data sekolah/konfigurasi.                     |
| Orang tua                 | Beranda yang menyajikan Anak Saya dengan pemilih anak, Izin Anak, Pengumuman. Nilai, kehadiran, catatan dan tagihan tetap di konteks anak; tidak dibuat empat menu baru. Pinjaman Buku pribadi hanya bila layanan relevan dan berizin. |
| Pustakawan                | Beranda, Sirkulasi, Katalog, Anggota, Kunjungan, Stok Opname, Laporan; Pengumuman tetap tersedia. Pengaturan perpustakaan berada di halaman terkait.                                                                                   |
| Bendahara / TU            | Beranda, Tagihan & Pembayaran, Buku Tamu bila ditugaskan, Absensi Saya, Laporan, Pengumuman. Jabatan bendahara adalah persona usulan, bukan asumsi bahwa role bakunya sudah ada.                                                       |
| Operator sekolah          | Beranda, Siswa & Kelas, Pengguna & Akses, Mata Pelajaran, Pembagian Tugas, Tahun Ajaran, Struktur Sekolah, Jadwal & Kalender, Laporan, Pengumuman, Pengaturan Sekolah.                                                                 |
| Kepala sekolah            | Beranda pemantauan, Laporan, Supervisi, Absensi Pegawai, Pengumuman; data/detail lain menurut kewenangan. Tidak menjadikan seluruh halaman input sebagai pilihan utama.                                                                |
| Superadmin                | Seluruh tujuan yang berhak diakses, dengan label bagian dan pintasan; Kelola Sekolah terpisah di bawah. Jangan memaksa inventori admin yang lengkap menjadi 5–7 menu generik.                                                          |

Guru Wali dan Wali Kelas harus dibedakan: Pendampingan Siswa mengikuti penugasan mentoring, Wali Kelas mengikuti rombel binaan. Guru bisa memiliki keduanya.

Saat data penugasan belum tersedia, tampilkan akses relevan berdasarkan izin dengan penjelasan belum ada penugasan dan jalur menghubungi operator. Jangan menyembunyikan fungsi secara spekulatif hanya dari slug role. Pemilihan tampilan awal tidak boleh memberi akses tambahan.

## Bentuk penyatuan yang harus terasa di halaman

1. Pilihan data yang sama memakai filter: kelompok Saya/Semua yang diizinkan, tamu berdasarkan status, izin berdasarkan jenis. Jangan membuat tab untuk setiap variasi filter.
2. Pekerjaan berbeda pada objek sama memakai detail/tindakan: eksemplar dalam buku, surat peringatan dari kasus, guru pengganti dari jadwal.
3. Tampilan yang memang berbeda dapat memakai tab sedikit dan jelas: Kegiatan & Prestasi berisi Ekstrakurikuler/Agenda/Prestasi. Itu bukan alasan memindahkan 17 menu menjadi 17 tab.
4. Proses panjang tetap wizard: impor, persiapan tahun ajaran, pemindahan siswa. Tampilkan ringkasan sebelum menyimpan.
5. Kios, monitor dan pemindai tetap layar khusus. Pengurangan menu tidak menghapus mode layar penuh atau URL langsung.
6. Setiap halaman memiliki awal yang berguna: sesi hari ini, antrean izin, peminjaman, atau kunjungan aktif. Jangan menyambut pengguna dengan kartu-kartu submenu yang harus diklik lagi.
7. Tahun ajaran/semester, tanggal, kelas, dan anak aktif dipertahankan dalam URL/tautan kontekstual. Label lingkup selalu terlihat untuk mencegah mengubah data pada konteks salah.

## Urutan penerapan

1. **Akses dan istilah:** pisahkan kelayakan tampil di sidebar dari izin membaca API; pastikan tugas wali kelas/piket/pembimbing ditangani; tetapkan label, sinonim pencarian, dan menu per persona. Simpan semua route lama selama migrasi.
2. **Penyatuan dengan ketergantungan rendah:** impor ke halaman pemiliknya, kios/monitor sebagai tindakan, mentoring Saya/Semua, supervisi Saya/Siklus, katalog/eksemplar, pengguna/akses, dan pengaturan sekolah. Selesaikan tiap alur beserta tautan lama sebelum menghapus menu lamanya.
3. **Penyatuan pekerjaan harian:** absensi/jurnal/rekap, jadwal/guru pengganti, antrean perizinan, sirkulasi, buku tamu. Uji form dan transisi status per jenis, bukan hanya tampilan daftar.
4. **Proses berkala dan lintas konteks:** siklus tahun ajaran, kegiatan/prestasi, konseling/pemantauan, beranda orang tua/pustakawan, dan laporan lintas modul.

Belum perlu mengubah model data hanya untuk merapikan navigasi. Penggabungan daftar lintas endpoint mungkin membutuhkan agregasi server; pagination, pencarian, dan jumlah antrean tidak boleh hanya menggabungkan satu halaman pertama dari beberapa sumber.

## Kriteria penerimaan

- Semua 82 tujuan lama memiliki pemilik baru yang jelas; halaman detail, formulir, dan scanner tetap dapat dicapai.
- Guru dapat membuka sesi dan menyelesaikan absensi serta jurnal tanpa memasukkan kelas/tanggal dua kali; status simpan keduanya jelas, termasuk draf/offline yang sudah didukung.
- Penerima permintaan guru pengganti, peninjau izin, dan petugas konseling menemukan antrean tugasnya dari beranda atau halaman pemilik.
- Siswa tidak melihat menu pengelolaan sekolah hanya karena API jadwal membutuhkan referensi kelas/tahun ajaran. Orang tua selalu berada dalam cakupan anaknya.
- Izin komponen tetap independen: melihat pemantauan tidak membuka catatan konseling; melihat anggota tidak otomatis mengubah aturan; laporan perpustakaan tidak mensyaratkan izin laporan sekolah.
- Jangan menghapus entri registri route begitu saja: `permissionForPath` sekarang memakai registri navigasi dan route yang tidak dikenal tidak memperoleh gate dari registri. Pisahkan metadata route dari presentasi menu, atau pertahankan entri tersembunyi beserta seluruh batasannya. Backend tetap memeriksa izin dan cakupan.
- URL lama diarahkan atau dilayani secara kompatibel, mempertahankan ID/query/hash yang relevan, tanpa loop atau perluasan akses. Tautan notifikasi, QR, bookmark, dan pencarian global tetap bekerja. Riwayat Favorit/Terakhir memetakan key lama ke tujuan baru dan menghindari duplikasi.
- Sidebar, menu HP, bottom bar, pencarian global, breadcrumb dan tautan internal memakai label/tujuan yang konsisten. Satu halaman gabungan ditandai aktif sekali. Alias pencarian: presensi/absensi, rombel/kelas, sirkulasi/pinjam, mentoring/pendampingan.
- Pengujian akses mencakup akun dengan banyak tugas dan akun tanpa tugas, bukan hanya admin; gunakan izin saat ini, jangan memberi izin baru demi menghilangkan error navigasi.
- Uji navigasi dengan perwakilan guru, BK/wali kelas, operator, siswa/orang tua, dan pustakawan menggunakan tugas nyata. Catat pilihan pertama, salah masuk, waktu menemukan fitur, dan kebutuhan bantuan sebelum/sesudah. Target jumlah klik/waktu ditetapkan setelah baseline, bukan diklaim berhasil dari jumlah menu saja.

## Lampiran: pemetaan seluruh tujuan saat ini

Tabel berikut melacak setiap entri registri satu kali. Tujuan adalah rancangan UI; belum menetapkan URL baru atau menghapus URL lama.

| Menu lama                   | Route saat ini                    | Tujuan usulan                                    | Bentuk penyatuan                                                                                       |
| --------------------------- | --------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Beranda                     | `/dashboard`                      | Beranda                                          | Tetap; ringkasan mengikuti pekerjaan.                                                                  |
| Jadwal                      | `/schedule`                       | Jadwal & Kalender                                | Tampilan jadwal dan akses sesi.                                                                        |
| Presensi                    | `/attendance`                     | Absensi & Jurnal                                 | Daftar sesi; varian baca sesuai peran.                                                                 |
| Guru pengganti              | `/substitutions`                  | Jadwal & Kalender                                | Tindakan sesi dan antrean permintaan pengganti.                                                        |
| Kelas binaan                | `/homeroom`                       | Wali Kelas                                       | Tetap, tampil berdasarkan tugas wali kelas.                                                            |
| Laporan presensi            | `/attendance/reports`             | Absensi & Jurnal → Rekap                         | Tampilan rekap; tautan juga dari Laporan dengan izin yang sesuai.                                      |
| Presensi pegawai            | `/staff-attendance`               | Absensi Pegawai                                  | Administrasi seluruh pegawai untuk pengguna berizin.                                                   |
| Presensi kerja              | `/check-in`                       | Absensi Pegawai / Absensi Saya                   | Tindakan pribadi dan riwayat; pintasan Beranda.                                                        |
| Jurnal mengajar             | `/journal`                        | Absensi & Jurnal                                 | Isi jurnal pada sesi, akses cepat dan riwayat tetap tersedia.                                          |
| Monitor langsung            | `/monitor`                        | Piket / Beranda pemantauan → Buka monitor        | Mode layar khusus; permission monitor tetap independen.                                                |
| Penilaian                   | `/grading`                        | Nilai                                            | Pengisian nilai dan ekspor e-Rapor.                                                                    |
| Nilai                       | `/my-grades`                      | Nilai Saya                                       | Varian baca pribadi; tidak memakai hak kelola nilai.                                                   |
| Anak                        | `/children`                       | Beranda orang tua                                | Anak Saya menyatu ke beranda; pemilih anak dan URL anak dipertahankan.                                 |
| Pelanggaran                 | `/discipline/violations`          | Tata Tertib                                      | Daftar catatan/kasus dan riwayat siswa.                                                                |
| Poin kedisiplinan           | `/my-discipline`                  | Catatan Tata Tertib                              | Varian siswa, cakupan pribadi.                                                                         |
| Surat Peringatan            | `/discipline/warning-letters`     | Tata Tertib                                      | Tindakan penerbitan dan arsip surat.                                                                   |
| Konseling                   | `/discipline/counseling`          | Konseling BK                                     | Tindak lanjut dengan batas akses sendiri.                                                              |
| Peringatan dini             | `/analytics`                      | Konseling BK → Pemantauan Siswa                  | Tetap dapat dibuka pemegang izin pemantauan tanpa izin konseling; pintasan bagi guru/pimpinan.         |
| Izin Terencana              | `/leave-requests`                 | Izin & Keterlambatan                             | Jenis Izin Tidak Masuk; alur persetujuan sendiri.                                                      |
| Izin Keluar                 | `/exit-permits`                   | Izin & Keterlambatan                             | Jenis Izin Keluar; QR dan tahapan tetap.                                                               |
| Terlambat                   | `/late-arrivals`                  | Izin & Keterlambatan                             | Jenis Keterlambatan; pencatatan dan verifikasi sendiri.                                                |
| Piket                       | `/duty`                           | Piket                                            | Ruang kerja harian petugas tetap langsung.                                                             |
| Pindai masuk kelas          | `/classroom-entry`                | Beranda / Jadwal siswa → Pindai masuk kelas      | Tindakan utama, scanner dan tautan langsung tetap ada.                                                 |
| Pengumuman                  | `/announcements`                  | Pengumuman                                       | Tetap; baca/kelola sesuai izin.                                                                        |
| Notifikasi                  | `/notifications`                  | Lonceng header                                   | Daftar dan detail notifikasi tetap tersedia.                                                           |
| Kelas dan siswa             | `/school/classes`                 | Siswa & Kelas                                    | Daftar siswa, kelas dan keanggotaan.                                                                   |
| Pengguna sekolah            | `/school/users`                   | Pengguna & Akses                                 | Akun semua profil, tautan keluarga, impor akun dan reset sandi.                                        |
| Pembelajaran                | `/school/learning`                | Mata Pelajaran                                   | Mapel, penawaran per tahun ajaran dan jam pelajaran.                                                   |
| Penugasan                   | `/school/assignments`             | Pembagian Tugas                                  | Mengajar/tugas tambahan; pengaturan jenis tugas.                                                       |
| Kalender akademik           | `/school/calendar`                | Jadwal & Kalender                                | Kalender akademik dan pengelolaan agenda/libur sesuai izin.                                            |
| Kenaikan kelas              | `/school/promotion`               | Tahun Ajaran                                     | Langkah kenaikan/penempatan; dapat dibuka tersendiri untuk koreksi.                                    |
| Tahun ajaran                | `/academic/years`                 | Tahun Ajaran                                     | Daftar tahun/semester, aktif dan historis.                                                             |
| Struktur Sekolah            | `/school/structure`               | Struktur Sekolah                                 | Tingkat, peminatan dan ruang; tetap.                                                                   |
| Impor penempatan kelas      | `/academic/enrollment-import`     | Siswa & Kelas → Impor penempatan                 | Wizard dari tindakan halaman.                                                                          |
| Persiapan tahun ajaran baru | `/academic/new-year-setup`        | Tahun Ajaran → Siapkan tahun baru                | Wizard persiapan terhubung ke proses kenaikan.                                                         |
| Dasbor                      | `/library`                        | Beranda pustakawan                               | Ringkasan operasional, rute lama tetap punya tujuan kompatibel.                                        |
| Katalog                     | `/library/catalogue`              | Katalog                                          | Daftar judul, detail dan pencarian koleksi.                                                            |
| Eksemplar                   | `/library/copies`                 | Katalog → Eksemplar                              | Pencarian barcode lintas judul dan tindakan massal tetap tersedia.                                     |
| Sirkulasi                   | `/library/desk`                   | Sirkulasi                                        | Peminjaman/pengembalian individu.                                                                      |
| Peminjaman kelas            | `/library/class-loans`            | Sirkulasi → Kelas                                | Peminjaman/pengembalian massal tetap alur tersendiri.                                                  |
| Opname                      | `/library/stocktake`              | Stok Opname                                      | Tetap ruang inventarisasi khusus.                                                                      |
| Master data                 | `/library/master-data`            | Katalog → Pengaturan Katalog                     | Jenis bahan, sumber, mitra, kategori, lokasi dan DDC.                                                  |
| Aturan peminjaman           | `/library/loan-rules`             | Anggota / Sirkulasi → Pengaturan Peminjaman      | Aturan, pengecualian periode dan kebijakan; satu tujuan bersama.                                       |
| Laporan perpustakaan        | `/library/reports`                | Laporan → Perpustakaan                           | Laporan lama tetap tersedia, tidak membutuhkan izin laporan umum tambahan.                             |
| Kios mandiri                | `/library/kiosk`                  | Sirkulasi → Buka kios mandiri                    | Tetap layar penuh dengan URL operasional.                                                              |
| Anggota perpustakaan        | `/library/members`                | Anggota                                          | Daftar dan detail anggota.                                                                             |
| Jenis anggota               | `/library/member-types`           | Anggota / Sirkulasi → Pengaturan Peminjaman      | Jenis anggota dan aturan dasar terkait.                                                                |
| Pelanggaran perpustakaan    | `/library/violations`             | Sirkulasi → Denda & Sanksi                       | Daftar mandiri tetap ada di dalam ruang transaksi; terkait anggota/pinjaman bila relevan.              |
| Impor koleksi               | `/library/import`                 | Katalog → Impor buku                             | Wizard dari tindakan Katalog.                                                                          |
| Kunjungan                   | `/library/visits`                 | Kunjungan                                        | Pencatatan dan riwayat pengunjung perpustakaan.                                                        |
| Kios kunjungan              | `/library/visit-kiosk`            | Kunjungan → Buka kios kunjungan                  | Mode khusus, bukan sidebar baru.                                                                       |
| Pinjaman saya               | `/library/me`                     | Pinjaman Buku                                    | Tujuan pribadi peminjam; pustakawan membuka melalui akses pribadi tanpa menduplikasi menu operasional. |
| Papan Tamu                  | `/visitors/board`                 | Buku Tamu                                        | Kunjungan hari ini, aktif dan riwayat.                                                                 |
| Tamu Dijadwalkan            | `/visitors/expected`              | Buku Tamu                                        | Tamu terjadwal dan tindakan jadwalkan tamu.                                                            |
| Insiden                     | `/visitors/incidents`             | Buku Tamu → Insiden                              | Tetap dapat mencatat insiden tanpa kunjungan terkait; batas izin terpisah.                             |
| Rekap Kunjungan             | `/visitors/recap`                 | Buku Tamu → Rekap                                | Rekap lokal, juga dapat ditautkan dari Laporan sesuai izin.                                            |
| Ekstrakurikuler             | `/activities/clubs`               | Kegiatan & Prestasi → Ekstrakurikuler            | Kelompok, anggota dan detail ekskul.                                                                   |
| Kalender kegiatan           | `/activities/events`              | Kegiatan & Prestasi → Agenda                     | Agenda lintas kegiatan, juga tampil sebagai lapisan kalender bila berizin.                             |
| Prestasi                    | `/activities/achievements`        | Kegiatan & Prestasi → Prestasi                   | Catatan per siswa, tidak wajib terikat kegiatan internal.                                              |
| Pembayaran SPP              | `/billing`                        | Tagihan & Pembayaran                             | Pertahankan transaksi, tagihan, tunggakan dan pengaturan biaya.                                        |
| Kelompok mentoring          | `/mentoring/groups`               | Pendampingan Siswa                               | Daftar kelompok sesuai cakupan; pengaturan kelompok tetap berizin.                                     |
| Kelompok saya               | `/mentoring/my-groups`            | Pendampingan Siswa                               | Filter penugasan saya sebagai awal.                                                                    |
| Siklus supervisi            | `/supervision/cycles`             | Supervisi                                        | Siklus/jadwal/observasi bagi pengelola atau pengamat berizin.                                          |
| Supervisi saya              | `/supervision/my-report`          | Supervisi                                        | Hasil saya bagi guru, tidak membuka laporan guru lain.                                                 |
| Peran dan Akses             | `/settings/roles`                 | Pengguna & Akses → Pengaturan Akses              | Definisi peran tetap izin terpisah dari edit akun.                                                     |
| Pusat laporan               | `/reports`                        | Laporan                                          | Pusat laporan dan jadwal pengiriman sesuai izin; tidak menggandakan mesin laporan modul.               |
| Onboarding                  | `/setup`                          | Beranda / Pengaturan Sekolah → Persiapan Sekolah | Checklist dapat dibuka kembali.                                                                        |
| Sesi dan keamanan           | `/settings/security`              | Avatar → Keamanan Akun                           | Tetap pengaturan pribadi.                                                                              |
| Sesi & login                | `/settings/session`               | Pengaturan Sekolah → Login & Keamanan            | Kebijakan sesi tingkat sekolah.                                                                        |
| Merek Sekolah               | `/settings/branding`              | Pengaturan Sekolah → Identitas Sekolah           | Identitas visual sekolah.                                                                              |
| Kop Laporan                 | `/settings/report-header`         | Pengaturan Sekolah → Dokumen & Surat             | Kop dan penandatangan bersama.                                                                         |
| Masuk dengan Google         | `/settings/sso`                   | Pengaturan Sekolah → Login & Keamanan            | Konfigurasi SSO, izin tetap.                                                                           |
| Jejak audit                 | `/settings/audit-logs`            | Pengaturan Sekolah → Riwayat Aktivitas           | Audit log tetap dapat dicari dan dibatasi izin.                                                        |
| Integrasi                   | `/settings/integrations`          | Pengaturan Sekolah → Integrasi                   | Koneksi eksternal.                                                                                     |
| Notifikasi                  | `/settings/notifications`         | Avatar → Notifikasi Saya                         | Preferensi pribadi, terpisah dari kebijakan sekolah.                                                   |
| Default notifikasi          | `/settings/notification-defaults` | Pengaturan Sekolah → Notifikasi & WhatsApp       | Default sekolah dengan izin sendiri.                                                                   |
| Template dokumen            | `/settings/document-templates`    | Pengaturan Sekolah → Dokumen & Surat             | Template dokumen menggunakan kop bersama.                                                              |
| Alur persetujuan            | `/settings/workflows`             | Pengaturan Sekolah → Alur Persetujuan            | Konfigurasi workflow, bukan antrean operasional.                                                       |
| WhatsApp                    | `/settings/whatsapp`              | Pengaturan Sekolah → Notifikasi & WhatsApp       | Kanal dan operasi WhatsApp sesuai fitur/izin.                                                          |
| Tampilan                    | `/settings/appearance`            | Avatar → Tampilan                                | Preferensi pribadi.                                                                                    |
| Profil                      | `/profile`                        | Avatar → Profil                                  | Tetap; akses profil mobile tetap tersedia.                                                             |
| Sekolah                     | `/platform`                       | Kelola Sekolah                                   | Footer khusus pemegang izin platform lintas sekolah.                                                   |

## Lampiran: halaman turunan yang tetap dapat dicapai

Halaman turunan bukan pilihan sidebar baru. Masing-masing tetap dimiliki ruang kerja induk; URL akhir diputuskan pada implementasi.

| Route turunan saat ini                                      | Pemilik tujuan                        |
| ----------------------------------------------------------- | ------------------------------------- |
| `/activities/clubs/[clubId]`                                | Kegiatan & Prestasi → Ekstrakurikuler |
| `/analytics/[studentId]`                                    | Konseling BK → Pemantauan Siswa       |
| `/attendance/[sessionId]`                                   | Absensi & Jurnal                      |
| `/discipline/students/[studentId]`                          | Tata Tertib → Riwayat siswa           |
| `/leave-requests/[instanceId]`                              | Izin & Keterlambatan                  |
| `/library/catalogue/[titleId]`                              | Katalog                               |
| `/library/members/[userId]`                                 | Anggota                               |
| `/library/stocktake/[stocktakeId]`                          | Stok Opname                           |
| `/mentoring/groups/[groupId]`                               | Pendampingan Siswa                    |
| `/mentoring/groups/[groupId]/students/[studentId]`          | Pendampingan Siswa                    |
| `/schedule/bulk`                                            | Jadwal & Kalender                     |
| `/school/users/import`                                      | Pengguna & Akses                      |
| `/supervision/cycles/[cycleId]/observe/[scheduledId]`       | Supervisi                             |
| `/supervision/cycles/[cycleId]`                             | Supervisi                             |
| `/supervision/cycles/[cycleId]/report`                      | Supervisi                             |
| `/supervision/cycles/[cycleId]/teachers/[teacherId]/report` | Supervisi                             |
| `/supervision/observations/[observationId]`                 | Supervisi → Detail observasi          |

Cakupan pemeriksaan: 82 entri navigasi dan 17 halaman turunan; total 99 route halaman di `apps/web/app/(app)`. Halaman di luar shell seperti login tidak termasuk penyederhanaan sidebar.

## Catatan implementasi

Implementasi memakai proyeksi workspace dari registri route yang tetap utuh. Sidebar dan menu HP menampilkan tujuan gabungan; pencarian masih menjangkau halaman/tindakan lama. Favorit dan riwayat lama dipetakan ke tujuan gabungan tanpa menyimpan ID siswa atau URL detail.

Penyatuan yang memerlukan konteks kerja telah diterapkan: antrean izin dari sumber server yang sesuai izin, filter layanan, pengisian jurnal dari sesi, permintaan pengganti terisi dari jadwal milik guru, konteks tahun sumber/tujuan, mentoring Saya/Semua, kunjungan aktif beserta tamu terjadwal, dan sanksi perpustakaan per anggota. Halaman yang sudah memiliki pekerjaan lengkap tetap menggunakan view yang sama dengan navigasi kontekstual; route lama tidak dihapus.

Pengaturan sekolah menggunakan pemilih bagian dan tautan lokal singkat. Bagian pribadi tetap melalui avatar. Pemindahan bagian menghormati perlindungan perubahan form yang belum disimpan. Laporan sekolah/perpustakaan/tamu memiliki izin masing-masing dan parameter pilihan tab yang terpisah. Provider terjemahan laporan/beranda memuat katalog perpustakaan hanya pada route yang memerlukannya.

Hak melihat data referensi tidak lagi otomatis menampilkan administrasi sekolah kepada siswa; Wali Kelas memerlukan penugasan. Pengguna dengan izin administrasi tambahan tetap mendapat menu pengelolaan. Beranda orang tua memuat Anak Saya, sedangkan pengguna guru/pegawai yang juga mempunyai akses anak mendapat tindakan Anak Saya. Kios, impor, dan monitor tetap dapat dibuka dari halaman pemilik dan pencarian.

Pemeriksaan otomatis meliputi izin per workspace, alias/favorit, menu mobile, isolasi laporan, permintaan pengganti, konteks tahun ajaran, draf, antrean izin, zona waktu kunjungan, dan izin personal versus administrasi. Pengujian kegunaan dengan pengguna sekolah tetap menjadi tindak lanjut; hasil unit/integrasi tidak dianggap bukti kepuasan pengguna.

Validasi implementasi: `pnpm typecheck`, `pnpm lint`, dan `pnpm test` berhasil untuk 14 paket/task; suite web berisi 376 tes dalam 70 file. Lint menyisakan tujuh peringatan lama tanpa error. Setelah perbaikan terakhir pada aksesibilitas sidebar dan penanda halaman detail, typecheck web dan pemeriksaan terarah dijalankan kembali. Pemeriksaan browser memverifikasi sidebar baru dan antrean izin gabungan, tetapi pemeriksaan visual menyeluruh termasuk breakpoint mobile belum selesai karena sesi preview lokal berulang kali kembali ke login saat reload. Konfigurasi sementara preview telah dihentikan dan server proyek dikembalikan ke konfigurasi awal.
