# DESIGN.md

Arah desain untuk platform sekolah (kode: newsekolah). File ini dibaca oleh skill antislop sebagai sumber arah; antislop menyaring slop, file ini yang menentukan karakter.

## Identitas

Produk: sistem informasi sekolah untuk operasional harian (presensi, izin, disiplin, nilai, perpustakaan) yang dipakai siswa, guru, staf, orang tua, dan pimpinan, di web dan aplikasi mobile, oleh banyak sekolah dengan branding masing-masing.

Kepribadian: tenang, tertib, dapat dipercaya, cepat. Seperti buku induk yang rapi, bukan aplikasi media sosial. Pengguna utamanya sedang terburu-buru (guru sebelum jam pelajaran, satpam di gerbang, siswa di lorong), jadi kejelasan mengalahkan kemeriahan.

Bukan: startup gradien ungu, dashboard "AI", kartu-kartu melayang dengan bayangan lembut di mana-mana, ikon berwarna-warni, ilustrasi orang abstrak, emoji.

## Warna

- Netral hangat sebagai dasar: latar `#F7F6F3` (terang) / `#141414` (gelap), permukaan `#FFFFFF` / `#1C1C1C`, teks `#1A1A1A` / `#ECECEC`, garis `#E3E1DC` / `#2A2A2A`.
- Satu warna aksen per sekolah (dari branding tenant; default biru tua `#1F3A5F`). Aksen dipakai hanya untuk tindakan utama, tautan, dan fokus. Tidak ada gradien.
- Warna status tetap lintas sekolah, dipilih agar bisa dibedakan penyandang buta warna dan selalu disertai label teks atau ikon: Hadir `#2F6B3A`, Sakit `#8A6D1F`, Izin `#3F5F8A`, Dispensasi `#6B4A8A`, Alfa `#A3382F`, Terlambat `#B5651D`.
- Kontras minimum 4.5:1 untuk teks, 3:1 untuk ikon dan garis komponen (diperiksa `contrast-check.py` dari antislop-human).

## Tipografi

- Satu keluarga huruf: Inter (web dan Android), SF Pro (iOS) lewat font sistem. Tidak ada display font.
- Skala: 12 / 13 / 14 (dasar) / 16 / 20 / 24 / 32. Angka tabel memakai `font-variant-numeric: tabular-nums`.
- Judul halaman 24 medium, judul kartu 16 medium, label 13 medium huruf normal (bukan kapital semua).

## Bentuk dan ruang

- Radius: 4 (input, chip), 8 (kartu, dialog), 999 hanya untuk avatar. Tidak ada tombol pil.
- Bayangan: hanya pada elemen melayang (menu, dialog, popover), satu tingkat `0 8px 24px rgba(0,0,0,.12)`. Kartu di halaman dipisahkan garis, bukan bayangan.
- Spasi kelipatan 4; konten maksimal 1280 px; tabel boleh lebih lebar dengan gulir horizontal di dalam kontainer.
- Kepadatan: tinggi baris tabel 40 px default, mode padat 32 px untuk operator TU.

## Ikon

- Lucide, ukuran 16 (inline) dan 20 (tombol, navigasi), stroke 1.75, warna mengikuti teks. Tidak ada ikon berwarna, tidak ada ikon dalam lingkaran berwarna sebagai hiasan.
- Setiap ikon tanpa teks wajib `aria-label`.

## Gerak

- Durasi 120 ms (hover, fokus), 200 ms (buka menu, dialog), easing `cubic-bezier(.2,.8,.2,1)`. Tidak ada animasi masuk halaman, tidak ada parallax, tidak ada skeleton berkilau lebih dari 1 detik.
- Hormati `prefers-reduced-motion`.

## Copy

- Bahasa Indonesia baku tetapi ringan; kata kerja di tombol ("Simpan presensi", bukan "Submit"); tidak ada tanda seru, tidak ada "Yuk", tidak ada emoji.
- Pesan error: apa yang terjadi, lalu apa yang bisa dilakukan. Maksimal dua kalimat.
- Angka penting ditampilkan sebagai angka, bukan kalimat.

## Dial antislop

ENERGY 2 / RHYTHM 2 / MOTION 1. Halaman publik (OPAC, halaman verifikasi surat, halaman login) boleh ENERGY 3 dengan foto sekolah dari branding tenant.
