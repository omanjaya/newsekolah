# Overhaul UI web: spesifikasi desain

Tanggal: 14 November 2026. Cakupan: `apps/web`, `packages/ui`, `packages/ui-tokens`, `packages/config`. Di luar cakupan: `apps/mobile`, perubahan API dan skema, fitur baru, identitas visual baru.

Dasar: audit `docs/analysis/ui-overhaul-audit-2026-11-13.md` (994 tangkapan layar, 8 area, 3 sapuan kode). Dokumen ini memuat keputusan; temuan per layar ada di audit dan dirujuk lewat id temuan.

## 1. Tujuan dan ukuran berhasil

Permintaan pemilik produk: tampilan yang sangat profesional, dengan sedikit animasi yang juga profesional. Identitas "Hijau Segar" (`docs/07-ui-ux.md` bagian 0, `docs/design-reference-hijau-segar.html`) dipertahankan.

Overhaul dianggap berhasil bila:

1. Setiap layar memakai satu kerangka halaman, satu skala tipografi, satu bahasa permukaan (kartu, daftar, form), dan satu gaya tab.
2. Layar utama tiap peran menjawab "apa yang saya kerjakan sekarang" di layar pertama, di HP 390 px maupun desktop 1440 px.
3. Di HP, dialog tampil sebagai lembar bawah dengan aksi yang selalu terlihat, dan tidak ada label terpotong di navigasi.
4. Mode gelap dan terang sama rapinya; kontras kontrol memenuhi WCAG AA (batas kontrol minimal 3:1).
5. Angka dasar audit turun ke nol atau mendekati nol dan dijaga lint: ukuran font literal (1.608), kartu buatan tangan (155), judul tanpa `font-heading` (145), label form tulis tangan (496), token status dipakai sebagai warna semantik (188).
6. `pnpm typecheck && pnpm lint && pnpm test` lulus, dan suite e2e yang ada tetap lulus.

## 2. Prinsip desain

- **Tenang dan rapi.** Latar hangat, permukaan putih, satu aksen. Warna aksen hanya untuk aksi utama, keadaan aktif, dan kartu "sekarang". Warna kategori untuk ikon dalam lingkaran lembut. Warna semantik (`success`, `warning`, `danger`, `info`) untuk status umum; token `status-*` hanya untuk presensi.
- **Hierarki lewat tipografi dan ruang, bukan garis.** Judul Manrope, isi Plus Jakarta Sans, angka tabular. Sekat antarbagian memakai jarak dan judul bagian; garis hanya di dalam daftar dan tabel.
- **Tugas dulu, statistik belakangan.** Isi kerja (tabel nilai, daftar siswa, kolom pindai) berada di layar pertama. Statistik diringkas jadi satu baris atau dipindah ke samping.
- **Satu pola untuk satu kebutuhan.** Komponen bersama di `packages/ui` dipakai apa adanya; layar fitur tidak merakit kartu, label, tab, atau badge sendiri.
- **HP adalah warga kelas satu.** Aksi utama dalam jangkauan ibu jari, target sentuh 44 px, lembar bawah menggantikan modal tengah.
- **Gerak seperlunya.** Lihat bagian 4.

## 3. Fondasi token

Sumber tunggal tetap `packages/ui-tokens/tokens.json`, dibangkitkan ke CSS variable dan dipetakan di `packages/config/tailwind/preset.css`. Nilai warna dasar tidak berubah. Yang ditambah:

| Kelompok   | Token baru                                                                         | Catatan                                                                  |
| ---------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Permukaan  | `surface-raised`, `surface-sunken`, `surface-overlay`, `scrim`                     | `sunken` untuk sel isian dan trek tab; `raised` untuk popover dan lembar |
| Batas      | `border-strong`                                                                    | Batas kontrol form, kontras minimal 3:1 terhadap permukaan               |
| Keadaan    | `state-hover`, `state-pressed`, `state-selected`, `focus-ring`                     | Lapisan keadaan netral, berlaku di terang dan gelap                      |
| Semantik   | `success`, `warning`, `danger`, `info` masing-masing dengan `-soft` dan `-soft-fg` | Dipakai sebagai kelas, bukan lagi alias yang jarang terpakai             |
| Elevasi    | `shadow-0` sampai `shadow-3` dengan varian gelap                                   | `card` = 1, `float` = 3 tetap ada sebagai alias                          |
| Radius     | `xl` 24 px                                                                         | Kartu hero dan lembar bawah                                              |
| Tata letak | lebar kontainer `narrow` 720, `default` 1200, `wide` 1440; breakpoint bernama      | Dipakai `PageShell`                                                      |
| Gerak      | lihat bagian 4                                                                     |                                                                          |

Aksen mode gelap mengikuti token (`#2FD6A0`); turunan aksen tenant di `apps/web/lib/tenant/accent.ts` disesuaikan supaya aksen bawaan tidak kusam (temuan shell).

### Peran tipografi

Ukuran font literal `text-[Npx]` dilarang di `apps/web` dan `packages/ui`. Yang dipakai adalah utilitas peran yang dibangkitkan dari token:

| Peran      | Ukuran / tinggi baris | Bobot | Font              | Pemakaian                               |
| ---------- | --------------------- | ----- | ----------------- | --------------------------------------- |
| `display`  | 28 / 34, -0.02em      | 700   | Manrope           | Judul halaman, sapaan beranda           |
| `title-lg` | 22 / 28, -0.01em      | 700   | Manrope           | Judul kartu hero, angka besar           |
| `title`    | 18 / 24               | 700   | Manrope           | Judul dialog, judul kartu utama         |
| `heading`  | 16 / 22               | 700   | Manrope           | Judul bagian, judul kartu               |
| `body`     | 14 / 20               | 400   | Plus Jakarta Sans | Teks isi, sel tabel                     |
| `body-sm`  | 13 / 18               | 400   | Plus Jakarta Sans | Teks sekunder, deskripsi                |
| `label`    | 13 / 18               | 600   | Plus Jakarta Sans | Label field, tombol, tab                |
| `caption`  | 12 / 16               | 500   | Plus Jakarta Sans | Keterangan, kepala kolom tabel, eyebrow |

Di HP, `display` turun ke 24 / 30. Bila artboard acuan menunjukkan nilai lain untuk komponen tertentu, artboard yang diikuti dan tabel ini diperbarui.

## 4. Sistem gerak

Tujuannya memberi kesan halus dan responsif, bukan menarik perhatian. Semua gerak ditulis dengan CSS (keyframes dan utilitas di `packages/ui/src/styles.css`); tidak ada pustaka animasi baru.

**Token**

| Token              | Nilai                            | Pemakaian                                          |
| ------------------ | -------------------------------- | -------------------------------------------------- |
| `duration-instant` | 80 ms                            | Umpan balik tekan                                  |
| `duration-fast`    | 120 ms                           | Hover, fokus, perubahan warna, keluar              |
| `duration-base`    | 200 ms                           | Masuk elemen kecil, indikator tab, popover, dialog |
| `duration-slow`    | 320 ms                           | Lembar bawah, lebar progres, hitung naik angka     |
| `ease-standard`    | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Perpindahan dan perubahan keadaan                  |
| `ease-enter`       | `cubic-bezier(0.16, 1, 0.3, 1)`  | Elemen masuk                                       |
| `ease-exit`        | `cubic-bezier(0.4, 0, 1, 1)`     | Elemen keluar                                      |
| `motion-rise`      | 8 px                             | Jarak naik saat masuk                              |

**Kosakata yang diizinkan** (di luar daftar ini tidak ada animasi):

1. **Keadaan.** Warna, latar, batas, dan bayangan berubah dalam 120 ms pada semua elemen interaktif.
2. **Tekan.** `Button`, kartu yang bisa diklik, dan item tab bawah mengecil ke 0,98 dalam 80 ms. Tautan teks dan baris tabel tidak.
3. **Masuk konten.** Isi halaman memudar dan naik 8 px dalam 200 ms sekali per navigasi, pada pembungkus `PageShell`, bukan per anak. Ubin dan kartu beranda masuk berurutan dengan jeda 40 ms, paling banyak 6 langkah, hanya pada muat pertama.
4. **Lapisan.** Dialog: pudar dan skala 0,97 ke 1 dalam 200 ms, keluar 120 ms. Lembar bawah: geser dari bawah 320 ms, keluar 200 ms. Popover, menu, tooltip: pudar dan geser 4 px dari arah jangkarnya dalam 120 sampai 160 ms. Scrim memudar 200 ms.
5. **Indikator.** Pil aktif `Tabs` dan `SegmentedControl` bergeser ke item baru dalam 200 ms. Penanda aktif sidebar, ibu jari `Switch`, lebar `Progress` dan meter (320 ms) ikut beranimasi.
6. **Umpan balik.** Toast masuk dengan geser dan pudar 200 ms, keluar 120 ms. `StickySaveBar` naik 200 ms saat ada perubahan. Skeleton berkilau pelan (1,5 detik, linear) lalu berganti ke isi dengan pudar 120 ms. Angka pada ubin statistik beranda menghitung naik sekali dalam 320 ms.
7. **Tata letak.** Lebar sidebar saat diciutkan atau dilebarkan (200 ms) dan buka-tutup grup navigasi (200 ms, lewat `grid-template-rows`).

**Aturan**

- Hanya `opacity`, `transform`, dan warna yang dianimasikan, kecuali dua kasus tata letak di butir 7.
- Tidak ada gerak lebih dari 320 ms, tidak ada pantulan, pegas, atau lewat batas.
- Tidak ada yang berulang kecuali skeleton, spinner, dan titik "sedang berlangsung" (denyut 2 detik).
- Animasi tidak pernah menunda interaksi: elemen bisa diklik sejak bingkai pertama.
- `prefers-reduced-motion: reduce` mematikan semua transform dan hitung naik; yang tersisa hanya pudar singkat.
- Urutan berjenjang diatur lewat CSS variable `--stagger` pada elemen; ini satu-satunya `style` inline yang diizinkan untuk gerak.

## 5. Primitif `packages/ui`

Tiap komponen baru atau yang diubah wajib punya story (terang, gelap, lebar HP) dan uji. Label bawaan lewat `UiLabels`, tidak ditanam di komponen.

**Perbaikan cacat (dikerjakan pertama)**

- `Button`: `disabled || loading`, `type="button"` bawaan, umpan balik tekan.
- Cincin fokus pada pil filter `DataTable`; `Checkbox` indeterminate terlihat; `aria-sort` di kepala kolom.
- Batas kontrol memakai `border-strong`; hover memakai `state-hover`.
- Urutan z-index: dropdown di atas elemen sticky. Keyframes dialog yang hilang dilengkapi.
- `Combobox` disamakan dengan `Select` (radius, tinggi, daftar berbatas tinggi).
- `TabsList` tidak boleh melebarkan halaman di HP.

**Permukaan dan konten**

- `Card` diperluas: `padding`, `tone` (default, sunken, accent-soft), `interactive`, header dengan slot aksi.
- `SectionHeader` (judul bagian, deskripsi, aksi) dan `List` / `ListRow` (avatar atau ikon, judul, meta, aksi) menggantikan `<h2>` mentah dan daftar `divide-y`.
- `PageHeader`: judul `display`, eyebrow, deskripsi, aksi, breadcrumb; di HP aksi kedua dan seterusnya masuk menu.
- `HeroCard`, `Stat` dan `StatTile` (digabung jadi satu: ikon dalam lingkaran 38 px berwarna kategori, angka Manrope, label muted, bisa diklik, varian ringkas satu baris), `Avatar` sampai 64 px.
- `Badge` tunggal dengan `tone`, `appearance`, `size`; `StatusBadge` dan `SemanticStatusBadge` merender lewat `Badge`.
- `EmptyState` varian `inline` dan dua preset (kosong awal dengan aksi tambah, kosong karena filter dengan aksi reset). `Alert` varian `success` dan `danger`. Preset `Skeleton` (daftar, kartu, form, detail).
- `StatePage` untuk 404, galat, tanpa akses, modul nonaktif, dan offline.

**Lapisan, navigasi, umpan balik**

- `Dialog` otomatis menjadi lembar bawah di bawah 640 px, punya `size` (sm, md, lg) dan footer lengket. `Sheet` mendapat `side="right"` untuk laci desktop. Tidak ada perubahan di pemanggil.
- `Tabs`: satu baris yang bisa digulir, hitungan per tab, indikator bergeser, varian `pill` dan `underline`. `NavTabs` berbasis tautan untuk sub-navigasi halaman. `SegmentedControl` untuk filter dan mode.
- `Toast` dibuat ulang sesuai artboard: radius 14, ikon dalam lingkaran lembut 32 px, judul `label`, di atas pada HP.
- `IconButton` bulat dengan tooltip otomatis; `Switch` dan `Stepper` dibentuk ulang (Stepper menampilkan aktor dan waktu, varian ringkas).

**Form dan data**

- `Field` (label, petunjuk, galat, wajib/opsional) yang bekerja dengan dan tanpa react-hook-form; `FormSection`, `FormActions`. `Input` mendapat `size` dan adornment.
- `RadioGroup`, `NumberInput`, `DatePicker`, `DateRangePicker`, `TimePicker`, dan `Calendar` bulan sebagai dasar pemilih tanggal dan kalender akademik. Dibangun di atas `Popover` yang ada tanpa dependensi baru kecuali benar-benar perlu.
- `DataTable`: prop `error` dan `onRetry` (gagal muat tidak lagi tampil sebagai kosong), footer paginasi tunggal dengan jumlah data, toolbar dan kartu HP yang lebih padat, `EmptyState` tanpa bingkai di dalam tabel.
- `Scanner` tunggal dengan dua varian (`action` untuk halaman biasa, `kiosk` untuk layar penuh) di atas `BarcodeScannerField`: kamera lebih dulu, bingkai bidik, hasil terakhir, input manual sebagai cadangan.

## 6. Kerangka halaman dan shell

**`PageShell`** (di `packages/ui`) adalah satu-satunya akar halaman di route group `(app)`:

- Slot: `breadcrumb`, `header` (`PageHeader`), `nav` (`NavTabs`, selalu di bawah header, tidak tampil bila hanya satu item), `toolbar`, isi.
- Varian: `default` (kontainer 1200, gulir halaman), `fit` (setinggi viewport, gulir internal untuk tabel dan grid), `narrow` (720, form dan pengaturan), `wide` (dasbor dan grid lebar).
- Padding halaman: 16 px di HP, 24 px di desktop; jarak antarbagian 24 px.
- Mengisi judul tab peramban dari judul halaman dan memberi animasi masuk konten.

**Sidebar desktop.** Baris grup berikon setara tautan, anak grup tanpa ikon kembar, urutan Beranda, Perlu tindakan, Pindai sesuai `docs/17-penyederhanaan-menu.md`, penanda aktif yang benar untuk rute bersarang, mode rail dengan flyout tetap ada.

**Header.** Pencarian, notifikasi, akun. Pengalih tema pindah ke menu akun.

**Kerangka HP** (mengikuti artboard): header ringkas (merek, cari, notifikasi), tab bawah lima slot berlabel pendek dengan Menu di kanan, tombol aksi cepat mengambang di atas bilah, dan notifikasi, pencarian, serta menu akun sebagai lembar bawah. Pilihan tab mengikuti tugas tiap peran.

**Palet perintah.** Pencocokan pada label dan kata kunci dengan peringkat awalan, panel lebih tinggi, layar penuh di HP, "Terakhir dibuka" di keadaan kosong.

**Autentikasi dan publik.** Satu `AuthCard` untuk empat halaman autentikasi dengan logo, nama, dan tagline sekolah; panel masuk tidak berbalik terang di mode gelap. Layout `(public)` bermerek sekolah untuk OPAC dan verifikasi dokumen.

**Kios.** Route group `(kiosk)` tanpa shell untuk monitor kehadiran dan dua kios perpustakaan: huruf besar, kontras tinggi, jam dan merek sekolah.

## 7. Layar utama yang didesain ulang

Vonis lengkap per rute ada di audit. Layar berikut mendapat desain ulang struktur; layar lain cukup mengikuti templat.

| Area                                  | Layar                                                                  | Arah desain                                                                                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Beranda                               | `/dashboard` semua peran                                               | Satu templat: hero "sekarang" dengan satu aksi utama untuk setiap peran (termasuk keadaan tenang), baris statistik ringkas, antrean tugas, pengumuman; tata letak utama dan samping di desktop |
| Beranda                               | `/scan`, `/classroom-entry`                                            | `Scanner` yang mengutamakan kamera; menjadi tujuan tombol hero siswa, piket, satpam                                                                                                            |
| Beranda                               | `/monitor`, `/profile`                                                 | Monitor sebagai kios; profil dengan header identitas dan tab                                                                                                                                   |
| Akademik                              | `/grading`                                                             | Tabel nilai sebagai isi pertama, satu strip ringkasan menggantikan 7 ubin, status terbit satu tempat                                                                                           |
| Akademik                              | `/attendance`, `/attendance/[sessionId]`, `/schedule`                  | Diet header di HP: siswa atau pelajaran pertama terlihat tanpa menggulir                                                                                                                       |
| Akademik                              | `/journal`, `/homeroom`, `/my-grades`                                  | Jurnal: satu pola tunggakan, tabel tidak kolaps. Wali kelas: hero "perlu perhatian". Nilai saya: nilai besar dengan progres KKM                                                                |
| Kesiswaan                             | `/leave-requests`, `/exit-permits`, `/late-arrivals`, `/my-discipline` | Ruang kerja per peran: siswa mendapat kartu status dengan `Stepper` dan satu tombol pindai besar; tiap rute satu judul                                                                         |
| Kesiswaan                             | `/duty`, `/discipline/violations`                                      | Piket: QR besar lebih dulu, mode sebagai `SegmentedControl`, antrean dan riwayat di halaman yang sama. Pelanggaran: form dan daftar yang rapi di HP                                            |
| Perpustakaan                          | `/library/desk`, dua kios                                              | Meja sirkulasi pindai dulu; kios tanpa shell                                                                                                                                                   |
| Perpustakaan                          | detail judul, detail anggota, `/library/settings`, `/library/me`       | Halaman detail sejati; satu hub pengaturan; kartu status di HP untuk siswa                                                                                                                     |
| Data sekolah                          | `/school/classes`, `/school/calendar`, `/students/[studentId]`         | Roster sebagai tabel dengan tautan profil; `Calendar` bersama; halaman detail siswa                                                                                                            |
| Data sekolah                          | tahun ajaran baru, kenaikan kelas, impor                               | Pola Wizard bernomor dengan `Stepper`; alur impor seragam                                                                                                                                      |
| Kepegawaian, administrasi, pengaturan | sesuai vonis audit                                                     | Satu tata letak pengaturan untuk semua sub-halaman; layar lain mengikuti templat                                                                                                               |

## 8. Penyeragaman layar lain

Dikerjakan dengan codemod, satu pola per commit, lalu lint untuk pola itu diaktifkan supaya tidak masuk lagi:

1. Ukuran font literal ke utilitas peran.
2. Kartu buatan tangan ke `Card`; `<h2>` mentah ke `SectionHeader` atau `CardTitle`.
3. Label tulis tangan ke `Field`; kotak galat ke `Alert`.
4. Token `status-*` di luar presensi ke warna semantik.
5. Akar halaman ke `PageShell`; sub-navigasi ke `NavTabs` di bawah header.
6. Tombol, tabel, dan input mentah ke komponen bersama; teks kosong ke `EmptyState`.
7. Tanggal lewat pembantu yang terikat zona waktu sekolah; `input type="date"` ke `DatePicker`.

Lint yang ditambahkan di `packages/config/eslint`: larangan kelas palet Tailwind dan warna arbitrer (sudah nol pelanggaran), `text-[Npx]`, radius lama pada permukaan, elemen mentah (`button`, `select`, `textarea`, `table`, `label`, `h1`-`h6`) di `apps/web/features` dan `apps/web/app`, `window.confirm`. Aturan yang masih punya pelanggaran dipasang sebagai ratchet (batas maksimum yang diturunkan), lalu jadi error.

## 9. Urutan kerja

Coding dikerjakan agen (Opus 5.5 untuk pekerjaan desain, Sonnet untuk migrasi mekanis), paling banyak tiga agen bersamaan. Sesi utama menggabungkan, menjalankan gerbang uji, memotret ulang layar, dan meninjau hasilnya.

| Gelombang | Isi                                                                                                                                                   | Paralel                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1         | Token, peran tipografi, sistem gerak, preset Tailwind, lint tahap nol, perbaikan cacat primitif                                                       | 1 agen                    |
| 2         | Primitif: permukaan dan konten; lapisan, navigasi, umpan balik; form dan data                                                                         | 3 agen, berkas terpisah   |
| 3         | `PageShell` dan halaman status; shell aplikasi, kerangka HP, palet, autentikasi dan publik                                                            | 2 agen                    |
| 4         | Codemod mekanis lintas aplikasi (tipografi, warna semantik, kartu, judul, label)                                                                      | 1 agen, lalu lint ratchet |
| 5         | Per area: desain ulang layar utama dan penyeragaman layar lain di area itu                                                                            | 8 area, 3 sekaligus       |
| 6         | Potret ulang semua layar, tinjauan visual sebelum dan sesudah, tinjauan kode, perbaikan, gerbang uji penuh, pembaruan `docs/05`, `docs/07`, `docs/15` | bertahap                  |

Tiap gelombang berakhir dengan: gabung ke cabang kerja, `pnpm typecheck && pnpm lint && pnpm test`, potret ulang layar yang terdampak di 1440 px dan 390 px (terang dan gelap), dan perbaikan regresi sebelum gelombang berikutnya.

## 10. Risiko

- **Perubahan primitif menggeser semua layar.** Diterima dan diinginkan; regresi ditangkap lewat potret ulang sebelum dan sesudah.
- **Agen paralel menyentuh berkas yang sama.** Tiap agen mendapat daftar berkas miliknya; berkas bersama (`index.ts`, `styles.css`, katalog pesan) digabung oleh sesi utama.
- **Uji komponen yang mengunci kelas lama.** Uji diperbarui bersama komponennya; uji perilaku tidak boleh dihapus.
- **Layar dinamis tanpa data seed** (detail supervisi, mentoring, stock opname) tidak terpotret; ditinjau lewat kode dan, bila perlu, data sementara di database dev.
