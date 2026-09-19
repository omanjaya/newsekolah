# 15. Paritas dengan SION

Catatan kerja untuk menyamakan logika bisnis newsekolah dengan SION, aplikasi asal yang kodenya ada di `reference/sion-rebuild-go`. Dokumen ini menjawab satu pertanyaan: sampai mana pekerjaan ini, dan apa yang tersisa. Perbarui setiap kali ada bagian yang selesai.

Posisi terakhir: 19 September 2026. Di luar paritas, sesi 19 September mengaudit dan memperbaiki performa web; hasil terukur dan statusnya ada di [dokumen 16](16-audit-performa-web.md).

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
| Ekspor DOCX jurnal kelas                              | Masih mengembalikan 501; perender dokumen hanya membuat PDF                                                 |
| Kop surat bergambar pada laporan bulanan perpustakaan | Baru nama sekolah dalam teks                                                                                |
| Barcode gambar pada kartu anggota perpustakaan        | Nomor anggota tercetak sebagai teks; label eksemplar sudah memakai Code 128                                 |
| Heartbeat presence pengguna online                    | Hanya dikirim saat tersambung, belum berkala selama koneksi hidup                                           |
| Cetak kartu anggota perpustakaan secara massal        | API hanya punya endpoint satu kartu per anggota                                                             |
| Import user untuk memperbarui user yang sudah ada     | Baru mendukung pembuatan user baru                                                                          |
| Validasi skema OpenAPI di middleware                  | Tidak ada. Batas panjang field harus ditegakkan manual per modul, dan baru sebagian modul yang melakukannya |

### 3. Risiko terbuka

- **Repo belum punya remote git.** Seluruh commit hanya ada di satu mesin, tanpa cadangan. Pasang remote dan push sebelum pekerjaan berikutnya.
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
