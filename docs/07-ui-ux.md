# 07. UI/UX

Arah visual ada di [DESIGN.md](../DESIGN.md). Dokumen ini membahas struktur pengalaman: siapa memakai apa, navigasi, alur utama, dan standar interaksi. Skill `antislop` (UI, mobile, aksesibilitas, copy) dipakai saat implementasi dengan `DESIGN.md` sebagai arah.

## 1. Persona dan tugas utama

| Persona | Perangkat utama | Tugas harian | Tugas berkala |
|---|---|---|---|
| Guru | HP (mobile app/PWA), laptop di kelas | Presensi 3-6 sesi, tampilkan QR, jurnal, lihat notifikasi | Nilai, pengganti, laporan |
| Wali kelas | HP, laptop | Review izin, pantau kelas binaan | Rapor, komunikasi orang tua |
| Guru BK | Laptop | Antrean izin, SP, konseling | Laporan pelanggaran |
| Guru piket / pimpinan | HP | Scan terlambat dan izin keluar | Monitor kehadiran |
| Siswa | HP | Scan QR masuk/terlambat, ajukan izin, lihat status | Nilai, perpustakaan |
| Orang tua | HP | Lihat presensi dan izin anak, notifikasi | Nilai, SP |
| Satpam | HP | Scan gerbang | Riwayat |
| Pustakawan | PC dengan scanner USB | Sirkulasi, kunjungan | Opname, laporan |
| Operator TU / admin | PC | Master data, pengguna, import | Tahun ajaran baru, kenaikan kelas |
| Kepala sekolah | HP, PC | Dashboard kehadiran | Laporan bulanan |
| Operator platform | PC | Onboarding sekolah, kesehatan | Billing |

Prinsip: layar pertama setiap persona menjawab "apa yang harus saya lakukan sekarang" dalam satu request dan tanpa scroll.

## 2. Arsitektur informasi

Navigasi lama: 60+ item dalam grup "Operasional" 20 item tanpa sub-struktur, label berbeda antar sidebar/mobile/eyebrow. Baru: satu registri `navigation.ts`, maksimal 7 grup, label identik di semua permukaan, item disaring permission dan modul.

```
Beranda
Akademik        Jadwal, Presensi, Jurnal, Guru Pengganti, Kelas Binaan, Penilaian
Perizinan       Izin Terencana, Izin Keluar, Terlambat, Gerbang (satpam), Verifikasi
Kesiswaan       Pelanggaran, Surat Peringatan, Konseling, Laporan Kesiswaan
Perpustakaan    Sirkulasi, Katalog, Anggota, Opname, Kunjungan, Laporan, OPAC
Komunikasi      Pengumuman, Notifikasi
Data Sekolah    Tahun Ajaran, Kelas dan Siswa, Guru dan Pegawai, Mapel, Ruang, Jam Pelajaran, Tugas, Katalog Pelanggaran
Pengaturan      Profil Sekolah, Kebijakan (presensi, disiplin, izin, penilaian), Template Dokumen, Peran dan Akses, Integrasi, Sesi dan Keamanan, Modul
```

Siswa dan orang tua melihat versi ringkas: Beranda, Presensi, Izin, Nilai, Perpustakaan, Pengumuman, Profil.

Pencarian global (`Ctrl/Cmd+K`) menjangkau halaman, siswa, guru, kelas, dan aksi ("buat pengumuman", "buka presensi X-2"). Ini pengganti menjelajah menu untuk pengguna berpengalaman.

## 3. Pola layar

| Pola | Dipakai untuk | Ketentuan |
|---|---|---|
| Beranda per peran | Semua | Kartu "sekarang" (periode berjalan + aksi), antrean tugas (izin menunggu, presensi belum submit), ringkasan angka, pengumuman terbaru. Tanpa widget cuaca |
| Daftar | Master data, riwayat, laporan | `DataTable` server-side, `FilterBar` di URL, aksi baris ikon dengan label, aksi massal saat ada seleksi, empty state dengan aksi |
| Detail | Siswa, izin, bibliografi | Header identitas, tab (ringkasan, riwayat, dokumen), timeline event, aksi utama di kanan atas, aksi berbahaya di bawah terpisah |
| Form | Semua CRUD | Satu kolom di mobile, dua kolom maksimal di desktop, kelompok field dengan judul, validasi saat blur, simpan draf otomatis untuk form panjang, tombol simpan tetap terlihat (sticky) |
| Wizard | Onboarding, import, tahun ajaran baru, kenaikan kelas | Langkah bernomor, dapat kembali, ringkasan sebelum commit, laporan hasil |
| Workflow | Izin keluar, terlambat, izin terencana | `Stepper` dengan tahap, siapa yang menyetujui, kapan; aksi scan besar di mobile; status akhir jelas |
| Scanner | Guru QR, siswa scan, satpam, pustakawan | Layar penuh, bingkai target, umpan balik getar/bunyi/warna, hasil terakhir di bawah, mode beruntun, tombol beralih ke input manual |
| Kiosk/monitor | Lobi, perpustakaan | Tanpa navigasi, font besar, kontras tinggi, refresh otomatis, token tampilan |
| Dokumen | Surat, SP, kartu, label | Preview PDF di panel, unduh/cetak, riwayat penerbitan |

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
- Bahasa: Indonesia baku ringan, kata kerja pada tombol, tanpa tanda seru dan emoji; lihat skill `antislop-copywriting`.

## 6. Aksesibilitas

WCAG 2.2 AA: kontras 4.5:1, fokus terlihat, label terhubung, landmark, skip link, focus trap dan restore pada dialog, status disampaikan lewat `aria-live` untuk hasil scan dan simpan, ukuran teks mengikuti pengaturan sistem (mobile Dynamic Type), animasi hormat `prefers-reduced-motion`. Uji axe di CI dan uji manual VoiceOver/TalkBack untuk presensi, scan, dan izin.

## 7. Ikon

Lucide, konsisten untuk konsep yang sama di semua permukaan (contoh: `qr-code` untuk tampilkan QR, `scan-line` untuk memindai, `calendar-check` untuk presensi, `door-open` untuk izin keluar, `clock-alert` untuk terlambat, `book-open` untuk perpustakaan, `shield-alert` untuk pelanggaran). Peta ikon per konsep disimpan di `packages/ui/icons.ts` agar tidak ada dua ikon untuk satu konsep.

## 8. Yang tidak dibawa dari UI lama

Widget cuaca dan geolokasi, salam per jam, metrik dummy, `?demo` di monitor, install PWA yang tersembunyi di dropdown, tiga layar loading berurutan, alias route (`/exit-permits` merender halaman lain), label berbeda untuk route yang sama, glyph "✓" sebagai indikator.
