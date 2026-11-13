# 07. UI/UX

Dokumen ini membahas struktur pengalaman: siapa memakai apa, navigasi, alur utama, dan standar interaksi, plus (bagian 0) arah visual yang dipakai di seluruh peran. Referensi visual mentah: `docs/design-reference-hijau-segar.html` (artboard statis, gaya inline adalah sumber kebenaran tampilan).

## 0. Arah visual: Hijau Segar

Dipilih 2026-09-25 sebagai arah untuk semua peran, menjawab kesan UI lama yang datar untuk siswa SMA. Fondasi (token, komponen `packages/ui`, shell aplikasi) sudah diterapkan; lapisan peran token, peran tipografi, dan sistem gerak ditambahkan pada gelombang 1 overhaul UI (`docs/superpowers/specs/2026-11-14-ui-overhaul-design.md`). Redesain per layar menyusul di gelombang berikutnya.

**Warna dasar.** Latar netral hangat `--color-bg` `#F7F6F2`, permukaan kartu `--color-surface` putih dengan ring 1px `--color-border` `#EAE8E1` (garis pemisah halus pakai `--color-line` `#E6E4DD`, sedikit lebih gelap dari ring). Teks `--color-fg` `#1B1D1A`, teks sekunder `--color-fg-muted` `#5E625B`. Aksen teal-hijau `--color-accent` `#0F7A5F` dengan versi lembut `--color-accent-soft` `#DDF2EA` + teks di atasnya `--color-accent-soft-fg` `#0B3B2E`, dan versi pekat untuk hover/pressed `--color-accent-strong`. Lima warna kategori (`--color-category-{green,amber,purple,blue,red}`, masing-masing punya `-soft` dan `-soft-fg`) dipakai untuk ikon dalam lingkaran lembut (kartu statistik, avatar inisial) berdasarkan topik, bukan status. Status presensi (`--color-status-*`) memetakan ke palet yang sama dan hanya dipakai untuk presensi.

**Peran token** (di atas warna dasar, nilai dasar tidak berubah):

| Kelompok   | Token dan kelas                                                                                | Pemakaian                                                                                                                                                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permukaan  | `bg-surface-raised`, `bg-surface-overlay`, `bg-surface-sunken`, `bg-scrim`                     | Raised untuk popover, menu, dan lembar bawah; overlay untuk dialog; sunken untuk sel isian, trek tab, dan trek progres; scrim di belakang dialog                                                                                                                                                   |
| Batas      | `border-border-strong`                                                                         | Batas kontrol form (Input, Select, Combobox, Textarea, Checkbox, Switch), minimal 3:1 terhadap semua permukaan                                                                                                                                                                                     |
| Keadaan    | `bg-state-hover`, `bg-state-pressed`, `bg-state-selected`, `outline-focus-ring`, `state-layer` | Lapisan tembus pandang untuk kontrol transparan (ghost, baris, item menu); kontrol berisi permukaan sendiri (tombol secondary, pil bergaris) memakai `state-layer`, yang melukis hover dan tekan di atas isiannya; selected berwarna aksen tipis; cincin fokus dan selected mengikuti aksen tenant |
| Semantik   | `success`, `warning`, `danger`, `info`, masing-masing dengan `-soft` dan `-soft-fg`            | Status umum di luar presensi; ditulis sebagai nilai nyata (bukan alias) dan diperiksa kontrasnya di setiap permukaan                                                                                                                                                                               |
| Elevasi    | `shadow-0` sampai `shadow-3` (`shadow-card` = 1, `shadow-float` = 3 tetap ada)                 | 1 kartu, 2 popover dan menu, 3 dialog dan toast; mode gelap punya bayangan sendiri yang lebih pekat                                                                                                                                                                                                |
| Radius     | `rounded-xl` 24px                                                                              | Lembar bawah; kartu hero menyusul (gelombang 2)                                                                                                                                                                                                                                                    |
| Tata letak | `max-w-narrow` 720, `max-w-default` 1200, `max-w-wide` 1440                                    | Lebar kontainer halaman                                                                                                                                                                                                                                                                            |
| Lapisan    | `z-sticky` < `z-overlay` < `z-modal` < `z-dropdown` < `z-popover` < `z-toast` < `z-tooltip`    | Menu dan popover di atas dialog, dialog di atas bilah lengket                                                                                                                                                                                                                                      |
| Skeleton   | `skeleton`                                                                                     | Isian placeholder dengan kilau pelan yang digeser lewat `transform` (tanpa beban thread utama)                                                                                                                                                                                                     |

Setiap pasangan (teks, tautan, batas kontrol, dan cincin fokus di setiap permukaan; teks di atas lapisan keadaan setelah dikomposisikan; teks pada latar lembut) diperiksa WCAG AA otomatis oleh `packages/ui-tokens/scripts/contrast-check.ts`, ditambah dua batas keterlihatan: garis pemisah (`line`, `border`) minimal 1,15:1 di surface, raised, dan overlay, dan lapisan hover atau tekan minimal 1,08:1 terhadap permukaan di bawahnya (250 pasang, `pnpm --filter @newsekolah/ui-tokens test`).

**Mode gelap** memakai charcoal hangat (`--color-bg` `#171613`, `--color-surface` `#211F1B`) dengan aksen hijau yang dicerahkan (`#2FD6A0`) supaya tetap kontras, dan setiap chip lembut jadi tint alpha-rendah dari warnanya di latar gelap. Permukaan diurutkan menurut apa yang bisa bertumpuk di atas apa, dan yang lebih tinggi lebih terang: `surface-sunken` `#121110` (lebih gelap dari latar, untuk trek dan sumur), latar, `surface`, `surface-overlay` `#282621` (dialog), lalu `surface-raised` `#2E2C27` (popover, menu, dan select, yang terbuka di atas dialog). Garis `--color-line` dan ring `--color-border` di mode gelap ditulis sebagai lapisan tembus pandang berbasis `fg` yang di `surface` melukis nilai yang disetujui (`#2B2824`, `#34312B`) hampir sama persis, sehingga tetap terlihat di permukaan raised dan overlay. Elevasi memakai bayangan gelap tersendiri; alias `shadow-card` dan `shadow-float` ditulis ulang di setiap blok tema. Mekanisme ganti tema (`data-theme`, `prefers-color-scheme`) tidak berubah.

**Aksen tenant.** Sekolah yang mengganti warna mereknya tetap menimpa `--color-accent`/`--color-accent-fg` (dan cincin fokus) lewat `--tenant-accent`/`--tenant-accent-dark` (`TenantProvider`, `lib/tenant/accent.ts`). Sekolah tanpa warna sendiri, atau yang warnanya sama dengan bawaan platform, mendapat pasangan token apa adanya (`#0F7A5F` terang, `#2FD6A0` gelap); hanya warna kustom yang diturunkan agar lolos 4,5:1 di permukaan gelap. Token turunan (`accent-soft`, `accent-strong`, warna kategori) sengaja tetap milik sistem. Panel merek halaman masuk memakai aksen terang tenant di kedua tema.

**Radius.** Kartu `--radius-lg` (20px), kontrol (tombol, input, popover) `--radius-md` (14px), lembar bawah `--radius-xl` (24px, juga untuk kartu hero saat dibentuk ulang), badge/pill/tab aktif/avatar `--radius-full`. Elemen kecil (checkbox, skeleton, item menu) tetap `--radius-xs`/`--radius-sm`.

**Tipografi.** Manrope (600/700/800) untuk judul dan angka besar, Plus Jakarta Sans (400-700) untuk teks isi, keduanya dimuat via `next/font` (self-hosted). Ukuran font literal `text-[Npx]` tidak dipakai lagi di `packages/ui` (dijaga lint); yang dipakai adalah peran tipografi, satu kelas yang mengatur ukuran, tinggi baris, bobot, tracking, dan keluarga huruf sekaligus (dibangkitkan dari `tokens.json` ke `dist/type-roles.css`):

| Peran           | Ukuran / tinggi baris          | Bobot | Font              | Pemakaian                                            |
| --------------- | ------------------------------ | ----- | ----------------- | ---------------------------------------------------- |
| `text-display`  | 28 / 32, -0.02em (HP: 24 / 28) | 700   | Manrope           | Judul halaman, sapaan beranda, judul kartu hero      |
| `text-title-lg` | 22 / 28, -0.01em               | 700   | Manrope           | Angka besar (ubin statistik)                         |
| `text-title`    | 18 / 24, -0.01em               | 700   | Manrope           | Judul dialog dan lembar bawah                        |
| `text-heading`  | 16 / 22, -0.01em               | 700   | Manrope           | Judul bagian, judul kartu, judul keadaan kosong      |
| `text-body`     | 14 / 20                        | 400   | Plus Jakarta Sans | Teks isi, isian form, nilai di kartu tabel HP        |
| `text-body-sm`  | 13 / 18                        | 400   | Plus Jakarta Sans | Teks sekunder, deskripsi, sel tabel desktop, eyebrow |
| `text-label`    | 13 / 18                        | 600   | Plus Jakarta Sans | Label field, tombol, tab, pil filter                 |
| `text-caption`  | 12 / 16                        | 500   | Plus Jakarta Sans | Keterangan, kepala kolom tabel, badge                |

Bobot, tinggi baris, atau keluarga yang ditulis setelah peran (`text-caption font-semibold`) menimpa peran itu; `cn()` di `packages/ui` mengenal semua nama ini. `display` dan `title` membagi baris secara seimbang bila terbungkus; `heading` tidak, supaya judul kartu pendek di samping tautan tidak dipecah jadi dua baris pendek.

**Gerak.** Halus dan responsif, tidak menarik perhatian; hanya CSS (`packages/ui/src/styles.css`). Durasi `duration-instant` 80 ms (tekan), `duration-fast` 120 ms (hover, fokus, keluar; bawaan setiap `transition`), `duration-base` 200 ms (masuk elemen kecil, dialog, popover), `duration-slow` 320 ms (lembar bawah, progres, hitung naik); kurva `ease-standard`, `ease-enter`, `ease-exit`, dan `ease-sheet` untuk geser sejauh tinggi elemen (lembar bawah, bilah simpan). Kosakata yang tersedia: `animate-enter` (pudar dan naik 8px, berjenjang lewat `--stagger`, 40 ms, paling banyak 6 langkah; tidak menahan `transform` setelah selesai, tetapi elemen `fixed` tetap tidak boleh berada di dalam elemen yang sedang masuk), `animate-fade-in` (isi menggantikan skeleton, 120 ms), lapisan (`animate-overlay-*` dengan scrim yang keluar bersama dialog dalam 120 ms, `animate-sheet-overlay-out` 200 ms untuk lembar, `animate-dialog-*` skala 0,97, `animate-sheet-*`, `animate-popover-*` bergeser 4px dari sisi jangkar, `animate-rise-in`; lapisan yang sedang menutup langsung meloloskan klik), toast 200/120 ms, `skeleton` dengan kilau 1,5 detik, `animate-live` untuk titik "sedang berlangsung" (2 detik), `motion-press` (tombol mengecil ke 0,98), `motion-indicator`/`motion-meter` untuk indikator dan progres, `motion-collapse`/`motion-layout` untuk sidebar dan grup navigasi, dan hook `useCountUp`. Tidak ada gerak di atas 320 ms, pantulan, atau perulangan lain. Di bawah `prefers-reduced-motion: reduce` semua transform, geser, dan hitung naik mati; yang tersisa hanya pudar singkat (maksimal 120 ms).

**Pagar lint** (`packages/config/eslint/design-system-patterns.js`): kelas palet Tailwind (`text-red-500`), warna tetap (`bg-white`), dan warna literal di nilai arbitrer ditolak di seluruh repo; ukuran font literal ditolak di `packages/ui` dan menyusul di `apps/web` setelah migrasinya.

**Komponen bersama** (`packages/ui`) yang sudah dipetakan ke token ini: `Button` (varian primary/secondary/ghost/danger, tinggi sentuh 44px, `type="button"` bawaan, umpan balik tekan), `Card` (`CardHeader`/`Title`/`Description`/`Content`/`Footer`), `Badge`, `Input`/`Select`/`Combobox`/`Textarea` (satu set keadaan batas di `field-styles.ts`: `border-strong`, hover satu tingkat lebih gelap, aksen saat fokus dengan cincin menempel, `danger` lewat `aria-invalid` yang tidak kalah oleh hover), `Tabs` (pill aktif, selalu satu baris yang menggulir di dalam treknya di HP), `Avatar`, `Stat`/`StatGrid`, `DataTable` (kontainer kartu, hover baris, seleksi lembut, `aria-sort`), `Dialog`/`Sheet`, `EmptyState`, dan story "Foundations" di Storybook untuk semua fondasi di atas.

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
