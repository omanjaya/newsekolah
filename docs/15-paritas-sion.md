# 15. Paritas dengan SION

Catatan kerja untuk menyamakan logika bisnis newsekolah dengan SION, aplikasi asal yang kodenya ada di `reference/sion-rebuild-go`. Dokumen ini menjawab satu pertanyaan: sampai mana pekerjaan ini, dan apa yang tersisa. Perbarui setiap kali ada bagian yang selesai.

Posisi terakhir: 23 September 2026. Sesi paralel 23 September menyapu UI/UX per grup fitur di ponsel (390 px) dan desktop (1280 px) untuk lima peran, serta menutup endpoint API yang belum punya layar; hasil, daftar layar baru, perbaikan lintas aplikasi, dan hal yang masih terbuka ada di [sapuan UI/UX](analysis/ui-ux-sweep-2026-09-23.md). Sesi 23 September diawali audit statis pra-deploy VPS (keamanan backend, keamanan web dan infra, sidebar dan RBAC per peran, kelengkapan fitur), dilanjutkan checklist keamanan 19 poin dan perbaikannya: API dan worker tersambung sebagai `app_rw` sehingga RLS berlaku, izin platform dicabut dari admin sekolah, cache sesi dibersihkan saat logout, token reset lama dibatalkan, sanitasi HTML klien dan penolakan SVG berbahaya, audit log di BK/keuangan/nilai/dokumen, gosec di CI, dan `compose.vps.yml` masuk repo. Menjalankan API sebagai `app_rw` membuka tiga kelas bug RLS yang selama ini tersembunyi (GUC kosong, fungsi DDL, use case di luar transaksi tenant) yang semuanya sudah diperbaiki; test integrasi kini berjalan sebagai `app_rw`. Temuan, matriks peran x menu, checklist 19 poin, dan langkah deploy ada di [audit pra-deploy](analysis/audit-pra-deploy-2026-09-23.md). Dua item ledger di bawah sudah selesai dan ditandai di sesi itu: ekspor DOCX jurnal kelas dan remote git. Sesi 20 September Di luar paritas, sesi 19 September mengaudit dan memperbaiki performa web; hasil terukur dan statusnya ada di [dokumen 16](16-audit-performa-web.md). Sesi 20 September merapikan layar "Kelas dan siswa": layout setinggi viewport tanpa scroll halaman di desktop (scroll hanya di daftar kelas dan roster), navigasi kelas dikelompokkan per tingkat dalam kartu, header kelas memakai avatar wali kelas plus badge jumlah siswa, tab membawa jumlah, roster satu kolom bergaris dengan avatar inisial dan NIS, dan komponen bersama baru `SearchInput` di `packages/ui`. Perlakuan yang sama lalu diterapkan ke seluruh grup Data Sekolah: `DataTable` bersama mendapat mode `fillHeight` (tabel mengisi tinggi layar, baris scroll internal di bawah header sticky; toolbar-nya kini memakai `SearchInput`), halaman pengguna mendapat avatar di kolom nama, halaman Pembelajaran dan Penugasan beserta sub-tabnya ikut viewport-fit, dan label grup diseragamkan menjadi "Data Sekolah" (sidebar sebelumnya menulis "Master Data" sementara eyebrow halaman menulis "Data Sekolah"). Penyempurnaan lanjutan: tab Tugas Tambahan tadinya menampilkan UUID mentah karena lookup memakai direktori campuran berlimit 500 — kini nama diresolve dari direktori guru dan pegawai, dengan avatar dan hitungan penugasan aktif; baris tab Mengajar memakai badge kelas dan aksi yang muncul saat hover; judul yang menduplikasi label tab di semua sub-view dibuang (rute lama tinggal redirect). Grup Akademik menyusul: kalender akademik jadi viewport-fit (satu bulan selalu utuh tanpa scroll halaman), kenaikan kelas mendapat empty state pengarah dan tabel rencana ber-`fillHeight`, jurnal mengajar ikut viewport-fit, kotak cari gradebook memakai `SearchInput`, eyebrow lima halaman diseragamkan ke "Akademik" (tadinya campuran "Data Sekolah"/"Kelas"/"Presensi"), dan judul halaman plus label sidebar yang Title Case dirapikan ke sentence case (id dan en) sesuai DESIGN.md. Grup Perpustakaan menyusul: katalog dan anggota viewport-fit (aksi katalog jadi ikon, kolom nama anggota ber-avatar), empat tab master data dan jenis anggota mengganti tombol "Ubah"/"Hapus" merah dengan ikon Pencil/Trash2 plus tabel ber-`fillHeight`, laporan peminjaman menerjemahkan status pinjaman yang tadinya tampil mentah ("active"/"returned" kini "Dipinjam"/"Dikembalikan"), dan kata "Edit" yang bocor di copy Indonesia diganti "Ubah" (judul, keanggotaan, diskon). Grup Kesiswaan menyusul: buku poin pelanggaran tadinya menampilkan "Siswa tidak diketahui" untuk sebagian besar baris karena lookup direktori mentok di batas API 500 — batas `/v1/directory/users` dinaikkan ke 5000 (OpenAPI + regen Go dan TS, test Go penuh lulus) dan frontend memakainya, sehingga semua nama siswa terpetakan; halaman pelanggaran, surat peringatan, konseling, dan peringatan dini viewport-fit dengan avatar di kolom siswa; eyebrow halaman izin diseragamkan ke "Kesiswaan" dan judul Title Case dirapikan. Sapuan terakhir menutup sisa grup: Tamu & insiden (tamu dijadwalkan dan log insiden viewport-fit, kartu angka rekap memakai Stat/StatGrid), Kegiatan (ekstrakurikuler, kalender kegiatan, prestasi — plus avatar siswa di prestasi), Keuangan (empat tab pembayaran SPP dengan angka uang tabular), Kelompok mentoring, Siklus supervisi, dan Pengumuman; label grup izin di Peran dan akses yang tampil slug Inggris mentah kini berbahasa Indonesia (12 kunci baru), dan sisa judul Title Case dirapikan (Tamu & insiden, Presensi pegawai, Pusat laporan, OPAC, Konsol platform, Sesi & login). Deskripsi izin masih bahasa Inggris karena datang dari katalog backend; diterjemahkan di tugas terpisah. Sekalian memperbaiki bug lama `Avatar`: palet inisialnya memakai `text-status-*-fg` di atas `bg-status-*` yang warnanya sama persis (token `-fg` adalah warna status sebagai teks di permukaan, bukan teks di atas warna status), sehingga inisial tak terlihat; kini latarnya tint 15% dengan teks warna status.

## Catatan tentang baseline perbandingan

Perbandingan fitur di dokumen ini dan di [Lampiran D](analysis/parity-sion-before.md) memakai kode Go di `reference/sion-rebuild-go` sebagai baseline. Basis data sungguhan yang dipakai sekolah hari ini bukan aplikasi Go itu, melainkan aplikasi Laravel/PHP dari lini yang sama dengan skema yang berbeda di banyak tempat. [Lampiran E](analysis/parity-sion-laravel.md) membaca skema produksi itu langsung, tabel demi tabel, dan menemukan beberapa modul yang aktif dipakai sekolah (koperasi/POS, HBG, diagnostik siswa, izin berkala berkonsen) tanpa padanan sama sekali di newsekolah, serta beberapa modul yang sudah dibangun newsekolah tanpa bukti pemakaian di data produksi. Lampiran D tetap berlaku sebagai catatan asal-usul aturan bisnis; Lampiran E adalah sumber untuk pertanyaan "modul apa yang belum dibangun".

## Ringkasan

Logika backend sudah setara atau lebih baik dari SION di semua modul, dan sudah diverifikasi terhadap database Postgres sungguhan. Setiap operasi API kini punya layar yang memanggilnya, dan tiap layar baru sudah dibuka di aplikasi yang berjalan. Yang tersisa adalah mencoba alur panjang sampai tuntas dengan data dan peran yang tepat.

| Bagian                                  | Status                                 |
| --------------------------------------- | -------------------------------------- |
| Perbandingan fitur SION dan newsekolah  | Selesai, 72 fitur                      |
| Perbaikan logika backend di semua modul | Selesai                                |
| Review independen atas perbaikan        | Selesai, 27 temuan, semua diperbaiki   |
| Verifikasi dengan database sungguhan    | Selesai                                |
| Layar presensi disambungkan ke API baru | Selesai                                |
| Layar untuk fitur backend baru lainnya  | Sebagian, 46 operasi belum terjangkau  |
| Uji menyeluruh di browser               | Sebagian, tiap layar baru sudah dibuka |

## Bagaimana pekerjaan ini berjalan

1. **Perbandingan.** Tiap aturan bisnis di handler SION dicari padanannya di kode baru dan diberi status per fitur. Hasil lengkapnya ada di [Lampiran D](analysis/parity-sion-before.md). Dari 72 fitur, saat itu 18 lebih baik, 2 sama, 39 sebagian, dan 13 hilang. Sebelas dari yang hilang ada di perpustakaan.
2. **Perbaikan per modul.** Delapan pengerjaan paralel menutup celah di identitas, akademik, presensi, perizinan, kesiswaan, penilaian, notifikasi, dan perpustakaan.
3. **Review.** Lima review independen memeriksa ulang klaim setiap perbaikan terhadap kode, bukan terhadap pesan commit. Review menemukan 27 masalah baru atau klaim yang tidak sepenuhnya benar.
4. **Verifikasi dengan database.** Seluruh pengerjaan sebelumnya hanya menjalankan test dengan `-short`, sehingga tidak satu pun test integrasi pernah dieksekusi. Menjalankan migrasi, seed, dan test penuh terhadap Postgres menemukan masalah yang tidak tertangkap test unit, termasuk seed yang gagal total dan bug SQL laten pada penyimpanan nilai rapor.
5. **Perbaikan temuan review**, lalu layar presensi disambungkan ke API baru.
6. **Pembangunan layar** untuk kemampuan backend yang belum punya antarmuka, dalam tiga kelompok paralel: perpustakaan, kesiswaan bersama penilaian dan perizinan, serta identitas bersama pengaturan dan dashboard.

Dampak di kode, dihitung dari commit `cb4a908`:

| Ukuran       | Nilai                     |
| ------------ | ------------------------- |
| Commit       | 122                       |
| Migrasi baru | 18, dari 0074 sampai 0106 |
| Operasi API  | 449 menjadi 576           |
| Rute web     | 102 halaman               |

## Yang terverifikasi

- Seluruh 64 migrasi apply bersih di Postgres 17. Delapan belas migrasi baru juga berhasil di-rollback berurutan lalu di-apply ulang.
- `go run ./cmd/seed` selesai di database bersih dan tetap idempoten saat dijalankan dua kali.
- `go test ./...` tanpa `-short` lulus, termasuk test integrasi berbasis testcontainers.
- `pnpm --filter web typecheck` bersih dan `pnpm --filter web lint` tanpa error.
- Layar presensi dilihat langsung dari aplikasi yang berjalan: tampilan guru pada hari sekolah dan tampilan admin yang tidak mengajar.
- `pnpm api:coverage` melaporkan 576 dari 576 operasi punya pemanggil, jadi tidak ada lagi kemampuan API yang tidak bisa dijangkau pengguna.
- Seluruh layar baru dibuka satu per satu di aplikasi yang berjalan pada 16 September 2026. Semuanya tampil tanpa error, dan lima cacat yang ditemukan sudah diperbaiki: halaman impor koleksi gagal 500 karena dependensi belum terpasang di container, satu tombol menampilkan kunci terjemahan mentah, tiga label jenis kunjungan hilang, judul histogram masih menulis UTC, dan komponen kartu membungkus tombol di dalam tombol sehingga memicu galat hydration.
- `cmd/seed` sekarang juga mengisi perpustakaan: jenis bahan, kategori, lokasi, sumber akuisisi, dua jenis anggota (siswa dan guru), siswa dan guru contoh terdaftar sebagai anggota, empat judul dengan 6 eksemplar, satu peminjaman masih berjalan, satu sudah dikembalikan, dan dua kunjungan. Diverifikasi idempoten tiga kali berturut-turut terhadap Postgres sekali pakai (jumlah baris sama persis di setiap run), dan terhadap dev stack: dashboard melaporkan 10 judul, 13 eksemplar, 2 anggota, 2 sedang dipinjam, dan preview impor koleksi dengan kode `BK` menghasilkan status `new_title`. Ditemukan bug laten di `library/service/members.go`: nomor anggota hasil generate bentrok antar jenis anggota karena urutannya dihitung per jenis padahal formatnya (`PS-YYYY-99999`) berlaku satu tenant; seeder menghindarinya dengan nomor anggota eksplisit, perbaikan modulnya sendiri belum dikerjakan.

## Keputusan yang diambil

Keputusan ini sengaja. Jangan diubah balik tanpa membaca alasannya.

| Keputusan                                                                                           | Alasan                                                                                                                                           |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Guru pemilik jadwal boleh menyimpan presensi setelah jam pelajaran berakhir, sampai tenggat koreksi | Aturan SION. Kode baru sempat melarangnya, sehingga guru yang lupa mengisi tidak bisa memperbaiki                                                |
| Presensi bukan data yang dibuat atau dihapus bebas                                                  | Catatan lahir dari jadwal dan dikoreksi lewat mode koreksi. Tombol hapus akan merusak rekap dan jejak audit                                      |
| Kenaikan nilai rapor dipakai penuh sesuai rentang, dengan batas 0 sampai 10                         | Aturan SION. Kode baru sempat memotongnya diam-diam ke batas skala                                                                               |
| Guru mana pun yang membuka alur terlambat boleh menyelesaikannya                                    | Aturan SION. Gerbang review sempat meminta izin yang hanya dimiliki guru piket                                                                   |
| Bukti izin wajib diperiksa saat review dan penerbitan, bukan saat pengajuan                         | Unggah bukti berjalan dua langkah setelah pengajuan dibuat. Surat tetap tidak bisa terbit tanpa bukti                                            |
| Surat peringatan harus terbit berurutan level                                                       | Lebih ketat dari SION, yang mengizinkan SP2 terbit sebelum SP1                                                                                   |
| Catatan konseling secara bawaan hanya bisa dibaca penulisnya                                        | Lebih ketat dari SION demi privasi. Penulis bisa membagikannya ke tim BK                                                                         |
| Jadwal di tahun ajaran terarsip tetap boleh dihapus                                                 | Data lama yang salah impor harus tetap bisa dibersihkan                                                                                          |
| Hari libur perpustakaan dibaca dari kalender akademik                                               | Menghindari dua sumber hari libur yang bisa berbeda                                                                                              |
| Import user hanya membuat user baru, maksimal 5000 baris, semua atau tidak sama sekali              | Menghindari import setengah jadi                                                                                                                 |
| Logout menghapus semua perangkat push milik user                                                    | Skema tidak mengaitkan sesi dengan perangkat. Perilaku ini sama dengan SION                                                                      |
| Berkas XLSX import dibaca di browser memakai `exceljs`, bukan `xlsx`                                | Endpoint import menerima baris JSON, jadi parsing harus di klien. `xlsx@0.18.5` punya dua kerentanan tingkat tinggi tanpa versi perbaikan di npm |
| Pembuatan tenant berjalan dalam satu transaksi                                                      | Tanpa itu, tenant bisa tercipta tanpa tugas wali kelas dan tidak bisa menunjuk wali kelas                                                        |

## Yang tersisa

Diurutkan dari yang paling berdampak bagi pengguna.

### 1. Uji di browser

Setiap layar baru sudah dibuka sekali dan hasilnya tercatat di bagian "Yang terverifikasi". Yang belum dicoba adalah alurnya sampai tuntas, dengan data dan peran yang tepat:

- Perpustakaan: anggota, denda, import koleksi, label batch, kunjungan dan kiosk, lookup ISBN, ekspor.
- Kesiswaan: kandidat surat peringatan, pencatatan pelanggaran banyak sekaligus, lampiran dan topik konseling, laporan PDF siswa.
- Perizinan dan penilaian: antrean izin keluar, pemetaan TP, penyunting rentang nilai, rincian bintang siswa.
- Identitas: dashboard admin, import user, pengaturan sesi, branding dan logo, profil.
- Presensi: popover pelanggaran per sesi, rincian laporan harian, roster wali kelas, detail kalender siswa.

Uji ini butuh akun dengan peran wali kelas, guru BK, pustakawan, dan admin. Data demo perpustakaan (anggota, katalog, peminjaman, kunjungan) kini tersedia lewat `cmd/seed`; modul lain masih menyediakan sebagian, jadi siapkan penugasan tugas tambahan lebih dulu.

Satu hal yang paling perlu dibuktikan di browser: pembacaan berkas XLSX untuk import koleksi dan import user berjalan di sisi klien memakai `exceljs`, dan itu belum pernah dijalankan sungguhan.

### 2. Pekerjaan yang ditunda

| Item                                                  | Keadaan sekarang                                                                                            |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Laporan PDF izin keluar                               | Baru tersedia dalam XLSX                                                                                    |
| ~~Ekspor DOCX jurnal kelas~~                          | Selesai. `scheduling/service/journal_docx.go` merender DOCX asli; dicatat di audit 23 September             |
| Kop surat bergambar pada laporan bulanan perpustakaan | Baru nama sekolah dalam teks                                                                                |
| Barcode gambar pada kartu anggota perpustakaan        | Nomor anggota tercetak sebagai teks; label eksemplar sudah memakai Code 128                                 |
| Heartbeat presence pengguna online                    | Hanya dikirim saat tersambung, belum berkala selama koneksi hidup                                           |
| Cetak kartu anggota perpustakaan secara massal        | API hanya punya endpoint satu kartu per anggota                                                             |
| Import user untuk memperbarui user yang sudah ada     | Baru mendukung pembuatan user baru                                                                          |
| Validasi skema OpenAPI di middleware                  | Tidak ada. Batas panjang field harus ditegakkan manual per modul, dan baru sebagian modul yang melakukannya |

### 3. Risiko terbuka

- ~~**Repo belum punya remote git.**~~ Sudah ada `origin` di GitHub (`omanjaya/newsekolah`).
- **Deploy VPS berikutnya butuh langkah manual.** Kode sudah memakai `app_rw` dan `compose.vps.yml`, tetapi `.env` di VPS harus diisi `APP_DB_PASSWORD` (migrate menolak jalan tanpanya), `DATA_ENCRYPTION_KEY`, dan `TRUSTED_PROXIES=127.0.0.1/32`, lalu `update.sh` dijalankan dengan `COMPOSE_EXTRA_FILES=infra/docker/compose.vps.yml`. Rincian di [audit pra-deploy](analysis/audit-pra-deploy-2026-09-23.md) dan `infra/README.md`.
- ~~**Aksen tenant tidak mengikuti mode gelap.**~~ Sudah diperbaiki. `TenantProvider` kini menulis dua variabel, `--tenant-accent` dan `--tenant-accent-dark`; yang kedua diturunkan oleh `apps/web/lib/tenant/accent.ts` dengan menaikkan lightness sampai menembus 4,5:1 di atas permukaan gelap `#1C1C1C`, sambil menahan saturasi agar tidak menyala. `app/globals.css` memilih salah satunya per tema. Aksen bawaan `#1F3A5F` naik dari 1,48:1 menjadi 4,68:1 (turunannya `#6288BC`). Uji ada di `accent.test.ts`; kaskadenya diverifikasi di browser untuk tiga jalur: sistem terang, sistem gelap, dan `data-theme="dark"` eksplisit.

## Cara memeriksa ulang

Menjalankan migrasi dan seed terhadap Postgres sekali pakai:

```bash
docker run -d --name nsk-check -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=newsekolah -p 55433:5432 postgres:17-alpine
```

```bash
cd apps/api && DATABASE_URL='postgres://postgres:pw@localhost:55433/newsekolah?sslmode=disable' JWT_SIGNING_KEY="$(openssl rand -hex 32)" DOCUMENT_SIGNING_KEY="$(openssl rand -hex 32)" SEED_DEMO=true go run ./cmd/migrate up && go run ./cmd/seed
```

Mencari kemampuan API yang belum punya layar:

```bash
pnpm api:coverage
```

Test penuh, termasuk test integrasi. Butuh Docker aktif, dan jangan pakai `-short`:

```bash
cd apps/api && go test ./...
```

Data demo hanya membuat jadwal Senin sampai Jumat. Layar presensi yang kosong di hari Sabtu atau Minggu adalah perilaku yang benar.
