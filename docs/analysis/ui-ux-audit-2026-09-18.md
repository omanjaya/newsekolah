# Audit UI/UX newsekolah — 18 September 2026

## Kesimpulan

**Status terbaru:** implementasi atas 14 temuan audit selesai. Rincian penyelesaian, 213 test otomatis, serta batas verifikasi perangkat/pengguna tercatat pada bagian “Penutupan implementasi” di akhir dokumen.

Fondasi visual sudah sesuai konteks sekolah: tenang, konsisten, dominan netral, dengan hierarki judul dan aksi yang cukup jelas. Penyempurnaan terbesar ada pada keandalan interaksi, penggunaan di ponsel, dan informasi yang membantu pengguna mengambil tindakan. Pertahankan identitas visual yang ada; prioritaskan masalah fungsional sebelum penambahan dekorasi.

## Cakupan dan batas pemeriksaan

- Inventaris menemukan 108 berkas halaman web dan 46 berkas TSX di direktori route mobile, termasuk layout. Angka ini bukan jumlah layar yang diuji langsung.
- Pemeriksaan langsung di aplikasi lokal menggunakan sesi admin yang sudah tersedia: dashboard, kelas/siswa, daftar dan dialog pengguna, presensi, izin terencana, pencarian navigasi, dan meja sirkulasi perpustakaan.
- Tampilan desktop diperiksa pada 1280 × 720; web mobile pada 390 × 844. Tema aktif saat pemeriksaan adalah gelap. Override ukuran browser dikembalikan setelah pemeriksaan.
- Telaah kode mencakup shell/navigasi, komponen UI bersama, autentikasi, dashboard, presensi, penilaian, perizinan, master data, perpustakaan, onboarding, serta sampel komponen dan alur aplikasi native.
- Tidak melakukan penyimpanan data sekolah, pengiriman pengingat, penerbitan nilai, atau perubahan akun. Formulir dibuka tanpa disubmit.
- Belum melakukan pengujian semua kombinasi peran, tema terang secara visual, perangkat iOS/Android asli, kamera, pembaca layar, maupun kegagalan jaringan yang disimulasikan. Temuan kode dibedakan dari temuan yang terlihat langsung.
- Ini audit heuristik dan implementasi, bukan hasil riset pengguna atau sertifikasi aksesibilitas.

## Yang sudah baik

1. Design tokens, komponen bersama, dan pola halaman sudah tersedia. Dasar untuk perbaikan lintas modul kuat.
2. Navigasi terpusat dan disaring menurut izin/profil. Sidebar berkelompok dan pencarian halaman membantu aplikasi dengan banyak modul.
3. Skip link, label sejumlah kontrol, dialog Radix, toast, skeleton, dan teks pendamping status sudah digunakan.
4. Beberapa tabel berubah menjadi kartu di ponsel; input dan tombol dasar umumnya sudah memakai tinggi 44 px pada layar kecil.
5. Presensi mempunyai default hadir, filter ketidakhadiran, ringkasan status, dan alasan siswa terkunci.
6. Penilaian mempunyai konfirmasi publikasi, label input per siswa, dan navigasi keyboard vertikal.
7. Perpustakaan memisahkan pinjam/kembali dan menyediakan pencarian anggota serta scanner. Import mempunyai tahap preview sebelum commit.

## Temuan prioritas

P1 berarti menghambat pekerjaan atau berpotensi menyesatkan pengguna. P2 berarti mengurangi kemudahan, konsistensi, atau efisiensi. Prioritas ini untuk urutan perbaikan UI/UX, bukan klasifikasi keamanan.

### 1. P1 — Halaman kelas meluber di ponsel

**Bukti langsung:** pada lebar 390 px, `document.documentElement.scrollWidth` mencapai 498 px. Panel kelas sekitar 482,5 px; tombol di kanan keluar viewport. Label kelas juga terpecah menjadi dua baris seperti `X-` dan `10`.

**Lokasi:** `apps/web/features/school/components/classes-view.tsx:77`, `class-panels.tsx:94`.

**Dampak:** operator harus menggeser halaman menyamping untuk mencapai aksi; daftar kelas sulit dipindai.

**Perbaikan:** gunakan track grid yang bisa menyusut, `min-w-0` pada panel, dan batasi overflow di kontainer yang tepat. Tombol kelas harus `shrink-0` dan `whitespace-nowrap`. Untuk puluhan kelas, gunakan pemilih kelas yang dapat dicari dan filter tingkat pada mobile.

**Kriteria selesai:** pada 360/390/430 px tidak ada scroll horizontal di halaman; nama, pemilih kelas, dan aksi utama tetap terlihat.

### 2. P1 — Pencarian tabel terlihat aktif tetapi tidak bekerja

**Bukti langsung:** di `/library/desk`, memasukkan `zzzauditnomatch` tetap menampilkan 165 baris tabel setelah pembacaan ulang. **Bukti kode:** `desk-overdue-table.tsx:162` memberikan callback pencarian kosong. Penelusuran menemukan 50 pemakaian `onGlobalFilterChange={() => undefined}` di fitur web; semua perlu ditinjau, bukan diasumsikan sudah diuji satu per satu.

**Lokasi:** `apps/web/features/library/components/desk-overdue-table.tsx:153`, `apps/web/features/onboarding/components/onboarding-wizard.tsx:213`, komponen `packages/ui/src/components/data-table/data-table.tsx`.

**Dampak:** pengguna mengira data sudah difilter dan dapat mengambil tindakan pada baris yang keliru.

**Perbaikan:** buat mode tabel eksplisit untuk data lokal, pagination server, dan pagination cursor. Jika kemampuan pencarian tidak disediakan, jangan tampilkan field pencarian. Jika ditampilkan, sambungkan ke filter lokal atau query server.

**Kriteria selesai:** query tanpa kecocokan menampilkan state hasil kosong; menghapus query memulihkan hasil; pagination di-reset saat filter berubah.

### 3. P1 — Pagination ganda memberi informasi bertentangan

**Bukti langsung:** daftar pengguna menampilkan “Halaman 1 dari 1” dengan panah nonaktif, tetapi juga tombol “Berikutnya” yang aktif di bawahnya.

**Lokasi:** `apps/web/features/school/components/users-view.tsx:275`. Tabel menerima `rowCount={items.length}`, indeks halaman selalu 0, dan callback kosong, sedangkan halaman sebenarnya menggunakan `next_cursor`.

**Perbaikan:** gunakan satu kontrol pagination cursor. Tampilkan rentang/jumlah yang benar-benar diketahui, bukan total halaman rekaan. Pertimbangkan kontrol di atas daftar panjang mobile agar pengguna tidak harus melewati 50 kartu.

**Kriteria selesai:** hanya ada satu sumber navigasi halaman dan indikatornya cocok dengan data yang dimuat.

### 4. P1 — Error dapat berubah menjadi loading tanpa akhir atau data kosong

**Bukti kode:** `SessionView` mengembalikan skeleton saat `isLoading || !data`, sebelum memeriksa `error`. Ketika request awal gagal tanpa cache, cabang error tidak tercapai. Pola serupa muncul di sejumlah detail/pengaturan. Daftar pengguna dan beranda orang tua native juga mengubah data yang tidak tersedia menjadi array kosong tanpa terlebih dahulu membedakan kegagalan.

**Lokasi:** `apps/web/features/attendance/components/session-view.tsx:55`, `apps/web/features/school/components/users-view.tsx:67`, `apps/mobile/src/components/screens/ParentHome.tsx:43`.

**Dampak:** pengguna menunggu tanpa kepastian atau menerima kesan “tidak ada siswa/anak/data” ketika sebenarnya koneksi bermasalah.

**Perbaikan:** pisahkan loading, error, sukses-kosong, dan sukses-berisi. Berikan tombol coba lagi, pertahankan data cache jika tersedia, dan jelaskan ketika data lama sedang ditampilkan.

**Kriteria selesai:** kegagalan awal dan kegagalan refresh menghasilkan pesan berbeda dari empty state; retry dapat memulihkan layar.

### 5. P1 — Izin ditolak/kedaluwarsa ditampilkan seolah semua tahap selesai

**Bukti kode:** semua status selain `in_progress` memakai `currentIndex = stages.length`. Komponen Stepper memberi centang pada seluruh tahap yang indeksnya lebih kecil, termasuk tahap yang belum dijalani.

**Lokasi:** `apps/web/features/permits/components/workflow-stepper.tsx:21`, `packages/ui/src/components/stepper.tsx:25`.

**Dampak:** badge “Ditolak” atau “Kedaluwarsa” dapat bertentangan dengan rangkaian centang yang menyiratkan seluruh persetujuan berhasil.

**Perbaikan:** modelkan status per tahap: selesai, aktif, ditolak, dibatalkan, dilewati, atau belum dijalani. Gunakan riwayat tahap aktual dan tampilkan alasan serta langkah berikutnya.

**Kriteria selesai:** kasus ditolak di tengah proses tidak memberi centang pada tahap sesudahnya.

### 6. P1 — Identitas anggota menjadi UUID dan pinjaman sulit dibedakan

**Bukti langsung:** beberapa baris keterlambatan perpustakaan menampilkan UUID sebagai anggota, bahkan beberapa baris dengan identitas sama. Tabel tidak menampilkan judul buku atau barcode eksemplar, tetapi mempunyai tombol perpanjang, kembali, dan tandai hilang per pinjaman.

**Lokasi:** `apps/web/features/library/components/desk-overdue-table.tsx:47`.

**Dampak:** pustakawan sulit memastikan pinjaman mana yang sedang diproses, terutama ketika seorang anggota meminjam lebih dari satu buku.

**Perbaikan:** sertakan nama anggota, nomor anggota, judul buku, barcode eksemplar, dan lama keterlambatan dari data yang sesuai. Jangan bergantung pada lookup direktori yang tidak mencakup seluruh anggota. Gunakan pesan identitas belum tersedia jika lookup gagal; UUID hanya untuk detail dukungan.

**Kriteria selesai:** setiap aksi jelas terkait dengan satu anggota dan satu eksemplar.

### 7. P1 — Edit presensi/nilai belum terlindungi dari perpindahan halaman

**Bukti kode:** roster, jurnal, dan nilai yang diedit disimpan di state komponen. Tidak ditemukan perlindungan keluar halaman atau penyimpanan draf di alur yang ditelaah.

**Lokasi:** `apps/web/features/attendance/components/session-view.tsx:91`, `apps/web/features/grading/components/gradebook-table.tsx:49`.

**Dampak:** pekerjaan panjang berpotensi hilang setelah navigasi atau refresh. Penyimpanan nilai per kolom juga memerlukan indikator agar guru tahu kolom mana yang belum tersimpan.

**Perbaikan:** tampilkan jumlah perubahan belum tersimpan, status proses simpan, perlindungan navigasi, dan draf yang dipisahkan menurut akun/sekolah/sesi. Pastikan kebijakan penyimpanan lokal sesuai sensitivitas data; jangan sekadar menaruh seluruh data siswa di localStorage.

**Kriteria selesai:** pengguna dapat memahami apa yang sudah tersimpan, membatalkan keluar, dan memulihkan pekerjaan sesuai kebijakan draf.

### 8. P2 — Kontras tombol berubah ketika warna sekolah diterapkan

**Bukti langsung:** tombol “Kembalikan” dirender dengan teks `rgb(255,255,255)` di latar `rgb(98,136,188)`; rasio hitung sekitar **3,64:1**, di bawah target teks 4,5:1 dalam `DESIGN.md`.

**Lokasi:** `apps/web/lib/tenant/tenant-provider.tsx:47`, `apps/web/lib/tenant/accent.ts`, `packages/ui/src/components/button.tsx`. Adaptasi accent gelap mempertimbangkan accent terhadap surface, sedangkan foreground tombol tetap putih.

**Perbaikan:** pisahkan accent untuk teks/link dari warna latar tombol, atau turunkan foreground yang sesuai untuk setiap accent. Validasi pasangan warna saat branding dipilih, termasuk kedua tema. Aplikasi native juga memakai teks putih tetap pada tombol primary.

**Kriteria selesai:** uji pasangan warna aktual hasil branding, bukan hanya tokens default.

### 9. P2 — Navigasi mobile kurang membantu penemuan fitur per peran

**Bukti langsung:** header dan tengah tab bar sama-sama membuka pencarian. Menu lengkap desktop menghilang pada mobile. Pencarian menampilkan daftar panjang tanpa pengelompokan konteks; ada label berulang seperti “Notifikasi”.

**Lokasi:** `apps/web/components/mobile-tab-bar.tsx`, `header.tsx`, `command-palette-provider.tsx`.

**Perbaikan desain:** tambahkan “Menu” berkelompok yang dapat ditelusuri, plus fitur terakhir/favorit. Tetapkan pintasan berdasarkan pekerjaan: presensi untuk guru, pindai untuk satpam/siswa, anak untuk orang tua, master data untuk operator. Pertahankan pencarian sebagai cara cepat.

**Kriteria selesai:** pengguna baru dapat menemukan modul tanpa harus menebak kata pencarian; label hasil ambigu mempunyai kategori penjelas.

### 10. P2 — Kontrol tabel belum konsisten antara desktop dan mobile

**Bukti langsung:** menu kolom pengguna menampilkan `name`, `profile_kind`, `roles`, `status`, dan `actions`.

**Bukti kode:** kartu mobile membuang kolom `select`; aksi massal yang bergantung pada seleksi tidak mempunyai kontrol pemilihan di kartu. Tombol kepadatan masih ditampilkan di mobile meski tinggi kartu tidak mengikuti density tabel.

**Lokasi:** `packages/ui/src/components/data-table/data-table-toolbar.tsx:110`, `data-table-cards.tsx:56`; contoh pemakai seleksi adalah `title-copies-view.tsx` dan `copies-browser-view.tsx`.

**Perbaikan:** gunakan label kolom terjemahan, tampilkan checkbox/select-all pada kartu bila seleksi didukung, dan sembunyikan kontrol yang tidak berdampak pada mode aktif.

### 11. P2 — Pemilihan kelas dan identifikasi siswa masih lambat

**Bukti langsung:** kelas diurutkan `X-1, X-10, X-11, X-12, X-2...`; banyak nama siswa terpotong pada layout dua kolom. Daftar siswa kelas tidak memiliki pencarian pada tampilan utama.

**Lokasi:** `apps/web/features/school/components/classes-view.tsx`, `class-panels.tsx:94`.

**Perbaikan:** gunakan urutan alami berdasarkan tingkat dan nomor, pencarian kelas/siswa, nama lengkap yang dapat dibuka/dibaca, dan NIS sebagai pembeda. Simpan kelas/tab terpilih di URL agar kembali dari halaman lain tidak mengulang pencarian konteks.

### 12. P2 — Posisi tombol simpan perlu mengikuti shell secara konsisten

**Bukti kode:** bar presensi menggunakan `md:left-64` (16rem), sedangkan sidebar mempunyai lebar 15rem atau 3,75rem. Pada mobile bar memakai `bottom-16`, sementara tab bar menambahkan safe-area. Bar simpan nilai menggunakan `sticky bottom-0`, sehingga perlu diuji terhadap tab bar tetap.

**Lokasi:** `apps/web/features/attendance/components/session-view.tsx:343`, `apps/web/components/sidebar.tsx:20`, `apps/web/features/grading/components/gradebook-table.tsx:348`.

**Perbaikan:** sediakan satu komponen action bar yang memahami lebar sidebar, tinggi navigasi bawah, dan safe-area. Hindari offset per halaman.

**Kriteria selesai:** tombol simpan terlihat ketika sidebar dibuka/diciutkan, keyboard ponsel terbuka, dan pada perangkat dengan safe-area. Kasus ini masih memerlukan verifikasi perangkat nyata.

### 13. P2 — Aksesibilitas interaksi belum merata

**Bukti kode:** tombol tutup dialog adalah ikon 16px dengan padding 4px (sekitar 24px), lebih kecil dari target sentuh 44px dalam pedoman proyek. Radio status presensi menggunakan button ber-role radio tanpa pengelolaan fokus dan tombol panah. Tabel mengelola navigasi j/k pada tbody, tetapi belum menyampaikan baris aktif dengan pola fokus yang kuat.

**Lokasi:** `packages/ui/src/components/dialog.tsx`, `apps/web/features/attendance/components/session-view.tsx`, `packages/ui/src/components/data-table/data-table.tsx:112`.

**Perbaikan:** samakan target sentuh komponen modal, gunakan radio group dengan perilaku keyboard lengkap, dan uji focus/restore serta operasi tabel dengan keyboard dan pembaca layar.

**Native:** label Input saat ini berupa Text terpisah; audit hubungan accessibility label, error saat submit tanpa blur, ukuran teks sistem, dan sheet saat keyboard terbuka. Temuan native ini berdasarkan kode, bukan hasil VoiceOver/TalkBack.

### 14. P2 — Dashboard belum selalu memberi tindakan utama yang tepat

**Bukti langsung:** dashboard admin menyediakan antrean, jumlah akun, dan grafik login. Ini rapi, tetapi pekerjaan operasional seperti melengkapi data dan meninjau presensi belum menjadi pintasan utama yang konsisten.

**Bukti kode:** dashboard web terutama bercabang untuk pengelola presensi dan admin; belum ada ringkasan anak khusus orang tua. Beranda orang tua native menampilkan daftar anak, tetapi status hari ini masih memerlukan pembukaan detail. Tile dashboard web juga mengubah data query yang belum tersedia menjadi 0, yang dapat menghasilkan pesan “tidak ada yang menunggu” sebelum data selesai atau saat gagal.

**Lokasi:** `apps/web/features/dashboard/components/dashboard-view.tsx`, `action-tiles.tsx`, `apps/mobile/src/components/screens/ParentHome.tsx`.

**Perbaikan desain:** tampilkan satu tugas utama sesuai peran, kemudian antrean prioritas dan ringkasan. Admin: kelengkapan data dan operasional hari ini; guru: sesi berjalan; orang tua: status anak; satpam: pindai; pustakawan: pinjam/kembali. Grafik login cocok di ringkasan administrasi lanjutan. Jangan tampilkan angka nol sebelum status query diketahui.

## Penyempurnaan visual lanjutan

- Pertahankan warna netral, garis pembatas, dan satu aksen sekolah.
- Kurangi pemotongan label navigasi panjang: sederhanakan istilah dan manfaatkan kategori, dengan label lengkap tetap tersedia.
- Buat hierarki aksi konsisten: satu primary action per konteks; tindakan sekunder dan berisiko mempunyai posisi yang mudah dipahami.
- Untuk daftar mobile, utamakan identitas dan status; detail pendukung dapat dibuka agar kartu tidak terlalu tinggi.
- Samakan judul menu dengan judul halaman. Contoh “Guru dan Pegawai” membuka halaman “Guru, pegawai, dan siswa”; pilih nama dan ruang lingkup yang tidak mengejutkan pengguna.
- Form panjang di mobile layak memakai sheet atau layar penuh dengan aksi tetap terlihat. Ini juga mendekatkan implementasi web ke pedoman proyek.
- Autentikasi sudah memiliki autocomplete dan beberapa metode masuk; tambahkan opsi tampil/sembunyikan password dan fokus yang jelas ketika OTP diminta. Telaah ini berdasarkan kode, sesi aktif tidak dilogout untuk pengujian.

## Urutan implementasi yang disarankan

### Tahap 1 — Keandalan yang terlihat pengguna

Perbaiki overflow kelas, kontrak pencarian/pagination tabel, error vs empty vs loading, identitas pinjaman, indikator workflow, serta perlindungan edit presensi/nilai. Kerjakan pola tabel dan state bersama lebih dulu agar perbaikan bisa diterapkan konsisten lintas modul.

### Tahap 2 — Komponen dan pola lintas aplikasi

Perbaiki warna branding/foreground, action bar, dialog mobile, checkbox kartu, label kolom, radio keyboard, dan penyimpanan filter/tab di URL. Uji komponen dengan konten panjang dan data besar.

### Tahap 3 — Optimasi per persona

Susun beranda, pintasan, dan menu mobile menurut tugas harian. Validasi dengan guru, operator, orang tua, dan petugas gerbang/perpustakaan sebelum memperluas perubahan ke semua peran.

## Verifikasi dan skenario penerimaan

Baseline `pnpm --filter @newsekolah/ui test`: **6 test file, 35 test lulus**. Ada peringatan environment tentang `HTMLCanvasElement.getContext`; hasil ini tidak membuktikan kontras visual atau semua alur aplikasi lolos. E2E yang tersedia saat audit mencakup login/logout/pergantian password wajib; perlu cakupan alur operasional.

Skenario regresi paling bernilai setelah perbaikan:

1. Pencarian cocok/tidak cocok dan reset filter untuk mode lokal, server, dan cursor.
2. Kelas dengan nama panjang, banyak kelas, layar 360–430px, dan zoom browser.
3. Request gagal tanpa cache, gagal saat refresh, empty state, lalu retry berhasil.
4. Izin ditolak/dibatalkan/kedaluwarsa pada tahap awal dan tengah.
5. Edit nilai/presensi lalu navigasi, refresh, atau koneksi terputus; tidak ada indikasi simpan palsu.
6. Pengoperasian dialog, status presensi, dan seleksi tabel memakai keyboard serta pembaca layar.
7. Warna tenant terang/gelap, foreground tombol, focus ring, dan label status.
8. Satu anggota dengan beberapa pinjaman: aksi selalu dapat dibedakan berdasarkan eksemplar.
9. Mobile native: izin kamera ditolak, input manual, keyboard di scanner/sheet, font sistem besar, dan pemulihan offline.

Target presensi kurang dari 30 detik untuk 36 siswa sudah tertulis dalam pedoman proyek, tetapi belum terukur dalam audit ini. Jadikan target itu uji tugas nyata, bersama keberhasilan menemukan siswa, menyelesaikan izin, dan memproses peminjaman tanpa bantuan.

## Implementasi prioritas tinggi — 18 September 2026

Dilaksanakan dengan satu koordinator dan tiga worker dengan ruang lingkup terpisah (tabel, alur form, dan responsivitas). Perubahan lokal belum di-commit atau di-deploy.

- Kelas: grid dan daftar siswa tidak lagi memperlebar halaman mobile, nama panjang dapat membungkus, urutan kelas numerik, pencarian siswa, serta error/retry dan hasil pencarian kosong.
- Tabel: kontrak eksplisit `local`, `server`, dan `cursor`; migrasi konsumen pencarian no-op, paginasi pengguna tunggal, pemilihan kartu mobile, serta pesan hasil pencarian kosong dan tombol reset. Tabel tanpa accessor pencarian tidak menampilkan kontrol pencarian yang tidak berfungsi.
- Alur: status izin berhenti pada tahap penolakan/pembatalan/kedaluwarsa; edit presensi/nilai memiliki konfirmasi sebelum meninggalkan halaman, termasuk command palette dan perubahan kelas/mata pelajaran/tab. Simpan nilai mempertahankan edit baru yang terjadi selama request berjalan serta nilai yang tidak ikut dikirim.
- Perpustakaan: API pinjaman terlambat menyediakan nama/nomor anggota, judul, dan barcode; UI menampilkan identitas pinjaman yang dapat dibedakan dan dicari.
- Kegagalan request: komponen error/retry diterapkan pada detail dan pengaturan yang diperbaiki, dashboard tidak menampilkan angka nol palsu saat loading/error, dan beranda orang tua native membedakan error dari daftar anak kosong.

Verifikasi otomatis: `pnpm typecheck` dan `pnpm lint` lulus (lint masih memiliki warning, tanpa error); seluruh `pnpm test` lulus (157 test: web 44, UI 38, mobile 32, paket lain 43); seluruh test Go `go test ./...` lulus. Test baru mencakup tabel produksi untuk pencarian pinjaman, mode cursor, reset pencarian kosong, workflow stopped, dan pembatalan navigasi.

Verifikasi browser: halaman kelas dengan 36 siswa pada viewport 390px memiliki lebar dokumen 390px; pencarian barcode pinjaman menghasilkan satu baris; pencarian tidak cocok menampilkan pesan yang tepat dan reset mengembalikan daftar. Pemeriksaan browser tambahan halaman pengguna terhenti karena server development restart saat mendekati batas memori; perilaku cursor tercakup test komponen.

Batas cakupan: belum merupakan E2E semua peran atau pengujian perangkat native. Proteksi Back/Forward menggunakan Navigation API bila tersedia; browser tanpa API tersebut tetap mendapat proteksi link, command palette, perubahan konteks nilai, dan reload, tetapi traversal SPA belum dijamin. P2 visual, aksesibilitas menyeluruh, penyimpanan filter di URL, dan optimasi persona tetap menjadi tindak lanjut audit.

## Lanjutan komponen dan interaksi — 18 September 2026

Perubahan berikut melanjutkan tahap pertama; temuan awal di atas dipertahankan sebagai bukti sebelum perbaikan.

- Warna tenant web: accent tema terang disesuaikan terhadap latar aktual, tema gelap memakai variant terbaca, dan foreground tombol dipilih hitam/putih berdasarkan kontras. Hover primary tidak lagi mengurangi opacity seluruh tombol. Penggantian tenant membersihkan warna lama.
- Warna native: variant tema terang/gelap dan foreground primary dihitung dari warna tenant; loading indicator menerima warna hex native. Uji menghitung rasio warna hasil pembulatan terhadap background/surface dan foreground, termasuk hitam, putih, kuning, merah, hijau, serta warna kasus audit.
- Menu mobile: tombol Menu membuka daftar seluruh tujuan yang sudah disaring berdasarkan akses, dikelompokkan sesuai navigasi. Pencarian tetap tersedia di header dan hasilnya memiliki kategori. Target hasil pencarian mobile diperbesar; dialog pencarian dibatasi tinggi viewport.
- Tabel: label menu kolom memakai judul terjemahan, tetap terbaca ketika kolom disembunyikan, dan kolom aksi/seleksi tidak ditawarkan sebagai kolom data. Kepadatan hanya tampil di desktop; kartu mobile memiliki pilih semua dan seleksi per baris. Shortcut j/k tidak menangkap input di kontrol dalam tabel.
- Dialog/sheet: tombol tutup 44px, closeLabel dapat diterjemahkan, body panjang memiliki scroll sendiri, dan footer prop berada di luar area scroll. Form yang menempatkan tombol di dalam body tetap mengikuti struktur form aslinya.
- Presensi: radio status memakai satu titik Tab dan mendukung panah, Home, serta End. Bar simpan mengikuti lebar sidebar aktual dan tinggi tab mobile beserta safe-area. Ruang bawah konten diperbaiki; bar simpan nilai tidak lagi berada di balik tab mobile.
- Kelas: pilihan kelas dan tab siswa/guru tersimpan sebagai parameter URL; parameter lain dan hash dipertahankan. Reload serta Back/Forward mempertahankan konteks yang sesuai.
- Dashboard: pintasan kerja untuk sirkulasi, petugas pindai, dan halaman anak mengikuti izin/profil. Jalur presensi guru yang sudah tersedia dipertahankan tanpa menambah kartu duplikat. Belum menambahkan ringkasan status anak atau merombak dashboard seluruh peran.
- Input native: label tersedia bagi pembaca layar dan error dari pemanggil langsung tampil, termasuk saat validasi submit sebelum blur.

Bukti browser: pada 390×844 menu dapat ditelusuri per kategori; dokumen tetap selebar 390px; pilihan X-2/tab guru bertahan saat reload lalu kembali ke tab siswa ketika Back; dialog kelas menampilkan kontrol tutup 44×44px. Tombol dengan background `rgb(98,136,188)` kini memakai foreground hitam. Menu kolom pengguna memakai Nama/Jenis/Peran/Status dan tetap memakai label Jenis saat disembunyikan, lalu berhasil ditampilkan kembali. Pemeriksaan dilakukan tanpa menyimpan atau menghapus data sekolah.

Verifikasi akhir tahap ini: `pnpm typecheck`, `pnpm lint`, dan `pnpm test` lulus; lint tanpa error dengan warning yang masih ada. Total 185 test lulus (web 58, UI 42, mobile 42, paket lain 43). `git diff --check` bersih. Tidak ada perubahan Go pada tahap ini; hasil test Go tahap pertama tetap dicatat terpisah.

Sisa pekerjaan yang belum boleh dianggap selesai: pengujian perangkat iOS/Android nyata (keyboard, safe-area, font besar, offline, VoiceOver/TalkBack), uji tugas semua peran, pengukuran target waktu presensi, persistensi filter lintas seluruh modul, favorit/riwayat menu, ringkasan anak di beranda, serta audit aksesibilitas menyeluruh termasuk pengumuman fokus baris tabel. Label close default komponen lama masih Bahasa Indonesia; pemanggil dapat memasok closeLabel sesuai locale.

## Penutupan implementasi — 18 September 2026

Bagian ini menggantikan daftar pekerjaan kode tersisa pada catatan tahap sebelumnya. Temuan 1–14 di atas adalah kondisi awal, bukan daftar bug yang masih terbuka. Perubahan tetap lokal, belum di-commit atau di-deploy.

| Temuan                   | Hasil implementasi                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Overflow kelas       | Layout responsif; diperiksa pada 360, 390, dan 430px.                                                                                                            |
| 2 — Pencarian tabel      | Mode data eksplisit dan pencarian lokal berfungsi; konsumen memakai kontrak yang sesuai.                                                                         |
| 3 — Pagination ganda     | Cursor memakai satu kontrol navigasi; tabel lokal menangani perubahan jumlah data.                                                                               |
| 4 — Error/loading/empty  | Error dan retry eksplisit pada layar yang ditemukan bermasalah, termasuk detail tenant, pengaturan nilai, rekap tamu, dan dashboard perpustakaan.                |
| 5 — Workflow berhenti    | Penolakan, pembatalan, dan kedaluwarsa tidak tampil sebagai keberhasilan semua tahap.                                                                            |
| 6 — Identitas pinjaman   | Nama anggota, judul, dan barcode tersedia dari API sampai tabel dan pencarian.                                                                                   |
| 7 — Edit belum tersimpan | Guard presensi/nilai dan perlindungan edit saat simpan; batas traversal browser lama tetap berlaku.                                                              |
| 8 — Kontras warna        | Perhitungan warna foreground/background web dan native diuji otomatis.                                                                                           |
| 9 — Navigasi per peran   | Tab harian berdasarkan izin/profil, kategori menu, favorit dan riwayat per akun.                                                                                 |
| 10 — Kontrol tabel       | Seleksi mobile, label kolom, fokus baris keyboard, dan pemulihan state lokal.                                                                                    |
| 11 — Memilih kelas/siswa | Pencarian kelas, filter tingkat, urutan numerik, pencarian siswa, serta konteks kelas/tab di URL.                                                                |
| 12 — Tombol simpan       | Posisi mengikuti sidebar, tab mobile, dan safe-area.                                                                                                             |
| 13 — Aksesibilitas       | Radio keyboard, fokus tabel, label pilihan/seleksi/tutup, target sentuh, error input native, dan login password/OTP diperbaiki. Belum sertifikasi aksesibilitas. |
| 14 — Dashboard persona   | Pintasan tugas sesuai akses dan ringkasan presensi setiap anak pada web/native, dengan tanggal mengikuti zona waktu sekolah.                                     |

Tambahan lintas modul:

- Tab pada 19 view serta filter tanggal pada 8 view memakai parameter URL yang divalidasi. Parameter lain dan hash dipertahankan; perubahan identik tidak menambah history.
- State pencarian, urutan, dan halaman tabel lokal dipulihkan ketika kembali ke route. Filter manual utama pada pengguna, katalog, anggota, eksemplar, notifikasi, wali kelas, audit, ruang, jurusan, tahun ajaran, dan risiko kedisiplinan disimpan dalam memori selama sesi. Pergantian akun/sekolah/tahun ajaran menghapus konteks sebelumnya; filter tidak ditulis ke localStorage.
- Favorit/riwayat menyimpan key navigasi yang diizinkan, bukan URL detail atau nama siswa, dan dipisahkan per akun/sekolah.
- Label tutup dialog/sheet serta seleksi tabel mengikuti locale aplikasi. Shared Select meneruskan id dan label aksesibilitas ke tombol yang benar; opsi semua tingkat menggunakan nilai nonkosong yang diterima Radix.
- Login memiliki tampil/sembunyikan password dan perpindahan fokus OTP. Native scanner mempertahankan input manual saat izin kamera tidak tersedia.

Bukti browser tambahan: pencarian kelas X-12 mempersempit daftar; reset mengembalikan daftar; filter Kelas X menampilkan kelas tingkat X; opsi semua tingkat dapat dibuka tanpa error. Menu mobile menampilkan kategori dan kontrol favorit. Tidak ada overflow dokumen pada 360px dan 430px. Pemeriksaan tidak menyimpan data sekolah.

Validasi fisik/riset yang tetap diperlukan: perangkat iOS/Android nyata (kamera, keyboard, font besar, offline, VoiceOver/TalkBack), uji tugas dengan seluruh persona, tema terang secara visual, dan pengukuran target presensi 36 siswa dalam 30 detik. Ini membutuhkan perangkat/pengguna uji, bukan pekerjaan kode yang dapat dinyatakan terbukti dari unit test. Paket mobile belum memiliki renderer pengujian komponen native; perilaku Input/Sheet diperiksa dari sumber dan typecheck, bukan diklaim sebagai uji interaksi native.

Hasil pemeriksaan akhir: seluruh workspace `pnpm typecheck`, `pnpm lint`, dan `pnpm test` lulus; lint masih mencatat warning tanpa error. Setelah penambahan empat regresi provider, suite web diulang dan lulus 77 test. Total akhir 213 test JavaScript/TypeScript: web 77, UI 51, mobile 42, paket lainnya 43. Regresi mencakup pemulihan route, pergantian identitas, fallback object stabil, functional update berurutan, navigasi per akun, label Select, dan interaksi login. Pemeriksaan typecheck/lint terarah diulang pada perubahan terakhir. `git diff --check` bersih; hasil Go tahap pertama tetap berlaku karena tahap lanjutan tidak mengubah Go.
