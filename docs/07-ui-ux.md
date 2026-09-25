# 07. UI/UX

Dokumen ini membahas struktur pengalaman: siapa memakai apa, navigasi, alur utama, dan standar interaksi, plus (bagian 0) arah visual yang dipakai di seluruh peran. Referensi visual mentah: `docs/design-reference-hijau-segar.html` (artboard statis, gaya inline adalah sumber kebenaran tampilan).

## 0. Arah visual: Hijau Segar

Dipilih 2026-09-25 sebagai arah untuk semua peran, menjawab kesan UI lama yang datar untuk siswa SMA. Fondasi (token, komponen `packages/ui`, shell aplikasi) sudah diterapkan; redesain per layar menyusul di tugas lain.

**Warna.** Latar netral hangat `--color-bg` `#F7F6F2`, permukaan kartu `--color-surface` putih dengan ring 1px `--color-border` `#EAE8E1` (garis pemisah halus pakai `--color-line` `#E6E4DD`, sedikit lebih gelap dari ring). Teks `--color-fg` `#1B1D1A`, teks sekunder `--color-fg-muted` `#5E625B`. Aksen teal-hijau `--color-accent` `#0F7A5F` dengan versi lembut `--color-accent-soft` `#DDF2EA` + teks di atasnya `--color-accent-soft-fg` `#0B3B2E`, dan versi pekat untuk hover/pressed `--color-accent-strong`. Lima warna kategori (`--color-category-{green,amber,purple,blue,red}`, masing-masing punya `-soft` dan `-soft-fg`) dipakai untuk ikon dalam lingkaran lembut (kartu statistik, avatar inisial) berdasarkan topik, bukan status. Warna semantik `success`/`warning`/`danger`/`info` adalah alias ke `green`/`amber`/`red`/`blue`. Status presensi (`--color-status-*`) memetakan ke palet yang sama. Setiap pasangan token (teks pada latar, ikon pada latar lembut) diperiksa WCAG AA otomatis oleh `packages/ui-tokens/scripts/contrast-check.ts` (94 pasang, `pnpm --filter @newsekolah/ui-tokens test`).

**Mode gelap** memakai charcoal hangat (`--color-bg` `#171613`, `--color-surface` `#211F1B`) dengan aksen hijau yang dicerahkan (`#2FD6A0`) supaya tetap kontras, dan setiap chip lembut jadi tint alpha-rendah dari warnanya di latar gelap. Mekanisme ganti tema (`data-theme`, `prefers-color-scheme`) tidak berubah.

**Aksen tenant.** Sekolah yang mengganti warna mereknya tetap menimpa `--color-accent`/`--color-accent-fg` lewat `--tenant-accent`/`--tenant-accent-dark` (`TenantProvider`, `lib/tenant/accent.ts`); default platform sekarang `#0F7A5F`, bukan navy `#1F3A5F` lama. Token turunan (`accent-soft`, `accent-strong`, warna kategori) sengaja tetap milik sistem, bukan ikut warna tenant -- itu bahasa dekoratif platform, sama seperti warna kategori lain, dan komponen yang butuh warna tenant murni (garis penanda item aktif di sidebar, gradasi panel login) tetap membaca `--color-accent` langsung.

**Radius.** Kartu `--radius-lg` (20px), kontrol (tombol, input, popover) `--radius-md` (14px), badge/pill/tab aktif/avatar `--radius-full`. Elemen kecil (checkbox, skeleton) tetap `--radius-xs`/`--radius-sm`.

**Tipografi.** Manrope (600/700/800) untuk judul dan angka besar (`font-heading`), Plus Jakarta Sans (400-700) untuk teks isi (`font-sans`) -- keduanya dimuat via `next/font` (self-hosted, sesuai `font-src 'self'` di CSP), menggantikan "Inter" yang sebelumnya cuma disebut di fallback tanpa pernah benar-benar dimuat.

**Komponen bersama** (`packages/ui`) yang sudah dipetakan ke token ini: `Button` (varian primary/secondary/ghost/danger, tinggi sentuh 44px), `Card` (baru: `CardHeader`/`Title`/`Description`/`Content`/`Footer`), `Badge` (pill lembut per kategori/semantik), `Input`/`Select`/`Textarea`, `Tabs` (pill aktif), `Avatar` (inisial dari palet kategori), `Stat`/`StatGrid` (ikon-dalam-lingkaran + angka Manrope), `DataTable` (kontainer kartu, hover baris, seleksi lembut), `Dialog`/`Sheet`, `EmptyState`. `Toast` dan komponen unggah berkas sengaja tidak disentuh (dimiliki tugas lain saat ini).

## 1. Persona dan tugas utama

| Persona               | Perangkat utama                      | Tugas harian                                              | Tugas berkala                     |
| --------------------- | ------------------------------------ | --------------------------------------------------------- | --------------------------------- |
| Guru                  | HP (mobile app/PWA), laptop di kelas | Presensi 3-6 sesi, tampilkan QR, jurnal, lihat notifikasi | Nilai, pengganti, laporan         |
| Wali kelas            | HP, laptop                           | Review izin, pantau kelas binaan                          | Rapor, komunikasi orang tua       |
| Guru BK               | Laptop                               | Antrean izin, SP, konseling                               | Laporan pelanggaran               |
| Guru piket / pimpinan | HP                                   | Scan terlambat dan izin keluar                            | Monitor kehadiran                 |
| Siswa                 | HP                                   | Scan QR masuk/terlambat, ajukan izin, lihat status        | Nilai, perpustakaan               |
| Orang tua             | HP                                   | Lihat presensi dan izin anak, notifikasi                  | Nilai, SP                         |
| Satpam                | HP                                   | Scan gerbang                                              | Riwayat                           |
| Pustakawan            | PC dengan scanner USB                | Sirkulasi, kunjungan                                      | Opname, laporan                   |
| Operator TU / admin   | PC                                   | Master data, pengguna, import                             | Tahun ajaran baru, kenaikan kelas |
| Kepala sekolah        | HP, PC                               | Dashboard kehadiran                                       | Laporan bulanan                   |
| Operator platform     | PC                                   | Onboarding sekolah, kesehatan                             | Billing                           |

Prinsip: layar pertama setiap persona menjawab "apa yang harus saya lakukan sekarang" dalam satu request dan tanpa scroll.

## 2. Arsitektur informasi

Navigasi web memakai satu registri `navigation.ts` untuk sidebar, tab mobile, pencarian halaman, dan menu akun. Item disaring berdasarkan permission dan jenis profil.

```
Beranda
Pengumuman
Laporan

Master Data     Kelas dan Siswa, Guru dan Pegawai, Tahun Ajaran, Struktur Sekolah, Pembelajaran, Penugasan, Import Rombel
Akademik        Jadwal, Presensi siswa, Jurnal, Guru Pengganti, Kelas Binaan, Penilaian, Kalender, Kenaikan Kelas, Tahun Ajaran Baru
Kesiswaan       Pelanggaran, Surat Peringatan, Konseling, Perizinan, Kegiatan, Prestasi, Mentoring
Kepegawaian     Presensi Pegawai, Supervisi
Perpustakaan    Katalog, Sirkulasi, Anggota, Opname, Kunjungan, Data dan Aturan Perpustakaan
Administrasi    Keuangan, Tamu, Insiden dan Rekap Kunjungan
```

Struktur Sekolah menggabungkan Tingkat Kelas, Peminatan, dan Ruang dalam tiga tab. Tambah dan edit menggunakan modal; tab aktif tersimpan di URL dan tautan lama diarahkan ke tab yang sesuai.

Pembelajaran menggabungkan Mapel, Mapel per Tahun Ajaran, dan Jam Pelajaran dalam tiga tab. Form tambah/edit dan pembuatan template jam menggunakan modal; tautan lama diarahkan ke tab yang sesuai.

Penugasan menggabungkan pembagian Mengajar, Tugas Tambahan, dan Jenis Tugas sebagai tab sejajar. Penambahan tugas tetap melalui modal; pengaturan jenis tugas tetap membutuhkan izin `manage_permissions`.

Pengaturan dan konsol platform (khusus pengguna berizin) berada tetap di bagian bawah sidebar. Profil, keamanan akun, preferensi notifikasi, dan tampilan tersedia dari menu avatar. Notifikasi diakses lewat lonceng pada header. Grup sidebar hanya terbuka otomatis ketika memuat halaman aktif; pilihan pengguna disimpan.

Tab bawah mobile tetap memakai pintasan sesuai peran. Pencarian global (`Ctrl/Cmd+K`) menjangkau semua halaman yang diizinkan, termasuk menu yang dipindahkan dari sidebar.

## 3. Pola layar

| Pola              | Dipakai untuk                                         | Ketentuan                                                                                                                                                                            |
| ----------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Beranda per peran | Semua                                                 | Kartu "sekarang" (periode berjalan + aksi), antrean tugas (izin menunggu, presensi belum submit), ringkasan angka, pengumuman terbaru. Tanpa widget cuaca                            |
| Daftar            | Master data, riwayat, laporan                         | `DataTable` server-side, `FilterBar` di URL, aksi baris ikon dengan label, aksi massal saat ada seleksi, empty state dengan aksi                                                     |
| Detail            | Siswa, izin, bibliografi                              | Header identitas, tab (ringkasan, riwayat, dokumen), timeline event, aksi utama di kanan atas, aksi berbahaya di bawah terpisah                                                      |
| Form              | Semua CRUD                                            | Satu kolom di mobile, dua kolom maksimal di desktop, kelompok field dengan judul, validasi saat blur, simpan draf otomatis untuk form panjang, tombol simpan tetap terlihat (sticky) |
| Wizard            | Onboarding, import, tahun ajaran baru, kenaikan kelas | Langkah bernomor, dapat kembali, ringkasan sebelum commit, laporan hasil                                                                                                             |
| Workflow          | Izin keluar, terlambat, izin terencana                | `Stepper` dengan tahap, siapa yang menyetujui, kapan; aksi scan besar di mobile; status akhir jelas                                                                                  |
| Scanner           | Guru QR, siswa scan, satpam, pustakawan               | Layar penuh, bingkai target, umpan balik getar/bunyi/warna, hasil terakhir di bawah, mode beruntun, tombol beralih ke input manual                                                   |
| Kiosk/monitor     | Lobi, perpustakaan                                    | Tanpa navigasi, font besar, kontras tinggi, refresh otomatis, token tampilan                                                                                                         |
| Dokumen           | Surat, SP, kartu, label                               | Preview PDF di panel, unduh/cetak, riwayat penerbitan                                                                                                                                |

## 4. Alur utama yang dirancang ulang

### Presensi guru (target < 30 detik untuk 36 siswa)

Beranda menampilkan sesi berjalan dengan tombol "Isi presensi". Grid default semua Hadir; ketuk siswa untuk ganti status (segmented H S I D A); pencarian nama; toggle "hanya yang tidak hadir"; siswa dengan surat izin terbit terkunci dengan penjelasan; siswa dalam proses terlambat ditandai; jurnal di bawah dengan topik dari pertemuan sebelumnya sebagai saran; simpan bekerja offline dan menampilkan status sinkron. Koreksi setelah jendela meminta alasan dan tercatat di audit.

### Izin keluar (siswa)

Satu layar: tujuan, rentang jam, ringkasan tahap yang akan dilalui. Setelah dibuat, layar status menunjukkan tahap saat ini dengan tombol "Pindai QR guru" besar; setelah tahap terakhir muncul QR gerbang dengan waktu berlaku. Orang tua menerima notifikasi saat terbit dan saat keluar.

### Guru piket

Layar "Piket hari ini": tombol tampilkan QR (mode: masuk kelas, terlambat, izin keluar tahap piket, dengan purpose berbeda), antrean review terlambat dengan pilihan pelanggaran, riwayat. Tidak perlu masuk menu.

### Onboarding sekolah

Wizard 6 langkah dengan indikator kelengkapan; setiap langkah bisa dilewati dan kembali; import menampilkan preview dan kesalahan per baris dengan saran perbaikan; di akhir, beranda admin menampilkan checklist "siap dipakai".

### Orang tua

Beranda per anak: status hari ini, izin aktif, pengumuman, notifikasi. Persetujuan izin terencana lewat tombol di notifikasi (link bertanda tangan, tanpa perlu ingat password bila memakai magic link).

## 5. Standar interaksi

- Umpan balik: setiap mutasi menghasilkan toast atau perubahan langsung pada elemen; tidak ada halaman yang hanya "reload".
- Loading: skeleton bentuk konten sampai 1 detik, lalu indikator; navigasi antar halaman tanpa overlay layar penuh (data dari cache TanStack Query).
- Error: judul apa yang terjadi, satu kalimat apa yang bisa dilakukan, tombol tindakan; kode error ditampilkan kecil untuk dukungan.
- Konfirmasi: hanya untuk aksi tidak dapat dibatalkan; menyebut objek dan dampaknya; alternatif undo 10 detik untuk hapus item tunggal.
- Tanggal dan waktu: zona waktu sekolah di semua permukaan; relatif ("2 jam lalu") hanya untuk < 24 jam dengan tooltip absolut.
- Keyboard: semua tabel dan form dapat dioperasikan tanpa mouse; pintasan didokumentasikan di `?`.
- Mobile: target sentuh minimal 44 px; aksi utama dalam jangkauan ibu jari (bawah); sheet bukan modal tengah; gesture tidak menjadi satu-satunya cara.
- Notifikasi: preferensi per kategori dan kanal; ringkasan harian sebagai opsi agar tidak membanjiri guru.
- Mode gelap mengikuti sistem, dapat dipaksa; kontras diperiksa otomatis.
- Bahasa: Indonesia baku ringan, kata kerja pada tombol, tanpa tanda seru dan emoji.

## 6. Aksesibilitas

WCAG 2.2 AA: kontras 4.5:1, fokus terlihat, label terhubung, landmark, skip link, focus trap dan restore pada dialog, status disampaikan lewat `aria-live` untuk hasil scan dan simpan, ukuran teks mengikuti pengaturan sistem (mobile Dynamic Type), animasi hormat `prefers-reduced-motion`. Uji axe di CI dan uji manual VoiceOver/TalkBack untuk presensi, scan, dan izin.

## 7. Ikon

Lucide, konsisten untuk konsep yang sama di semua permukaan (contoh: `qr-code` untuk tampilkan QR, `scan-line` untuk memindai, `calendar-check` untuk presensi, `door-open` untuk izin keluar, `clock-alert` untuk terlambat, `book-open` untuk perpustakaan, `shield-alert` untuk pelanggaran). Peta ikon per konsep disimpan di `packages/ui/icons.ts` agar tidak ada dua ikon untuk satu konsep.

## 8. Yang tidak dibawa dari UI lama

Widget cuaca dan geolokasi, salam per jam, metrik dummy, `?demo` di monitor, install PWA yang tersembunyi di dropdown, tiga layar loading berurutan, alias route (`/exit-permits` merender halaman lain), label berbeda untuk route yang sama, glyph "✓" sebagai indikator.
