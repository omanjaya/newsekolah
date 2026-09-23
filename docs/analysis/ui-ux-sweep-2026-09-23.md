# Sapuan UI/UX per grup fitur dan cakupan endpoint, 23 September 2026

Permintaan: UI/UX yang baik di ponsel dan desktop untuk setiap grup fitur, dan setiap endpoint API punya layar.

## Cara kerja

- Cakupan endpoint dihitung dari `openapi/openapi.yaml` (576 operasi) dibandingkan dengan pemanggilan `client.GET/POST/...` dan URL `fetch` di `apps/web`.
- Setiap grup fitur dikerjakan satu agen di worktree sendiri, dengan server `next dev` per agen (port 3101-3108, diizinkan lewat `APP_ORIGINS` di compose dev) dan pemeriksaan Playwright di 390x844 dan 1280x800 untuk peran admin, guru, gurubk, siswa, ortu.
- Setelah digabung, sapuan otomatis semua rute statis per peran mengukur overflow horizontal, error konsol dan halaman, serta kontrol di bawah 32 px di ponsel.

## Cakupan endpoint

Sebelum: sekitar 25 operasi tanpa layar. Sesudah: tersisa tiga, semuanya disengaja.

| Operasi                                                 | Status                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/academic/enrollments/import/{preview,commit}` | Sudah dipakai lewat URL template di `features/academic/lib/enrollment-import.ts`                                    |
| `DELETE /v1/grading/grade-ranges/{rangeId}`             | Tidak dibuat: editor rentang nilai memakai simpan-semua (`PUT`); dua cara edit untuk daftar yang sama membingungkan |
| `GET/POST /v1/whatsapp/webhook`                         | Dipanggil Meta, bukan pengguna                                                                                      |

Layar baru: kategori koleksi dan lokasi rak, hapus judul dan eksemplar, ubah status dan riwayat eksemplar, tambah eksemplar massal, riwayat perpanjangan, progres/hasil/XLSX stock opname, detail judul OPAC publik, tandai siswa keluar, detail tagihan, riwayat konseling per siswa, jenis tugas tambahan dan status penugasannya, scan QR masuk kelas untuk siswa (`/classroom-entry`), presensi kerja mandiri guru dan pegawai (`/check-in`), halaman detail izin (`/leave-requests/[instanceId]`), dan notifikasi realtime lewat `/ws/me`.

## Perbaikan lintas aplikasi

- Tombol `danger` bersama tidak punya label terlihat (teks sewarna latar). Label kini `text-bg`: kontras 6,1:1 tema terang, 5,2:1 tema gelap, tidak bergantung warna aksen tenant.
- `/ws/me` dan `/ws/monitor` selalu 500 karena pembungkus cookie tidak meneruskan `http.Hijacker`. Hook web kini menunggu token terbaru sebelum menyambung.
- Delapan halaman yang hanya memanggil `redirect()` memicu crash router dev ("Rendered more hooks"); kini redirect HTTP di `next.config.ts`.
- Baris tabel di ponsel: tombol aksi di samping judul kartu, 44 px. Checkbox dan switch 44 px di ponsel.
- Satu item navigasi aktif (pencocokan terpanjang) di sidebar, flyout, menu, dan tab bar.
- Tanggal default dan tampilan tanggal memakai zona waktu sekolah, bukan UTC.
- `GET /v1/me` membawa `current_class` untuk siswa; jadwal siswa tidak lagi menebak kelas.
- Duplikat jenis tugas menjadi 409; 404 `late-arrivals/current` diperlakukan sebagai kosong di web dan mobile.

## Terbuka

- Guru belum punya `view_supervision`, jadi "Supervisi saya" belum bisa dibuka guru.
- Data jadwal impor menempatkan pelajaran melintasi baris istirahat; grid kini menampilkannya, tetapi datanya perlu diperiksa.
- Siswa melihat jenis notifikasi khusus guru; perlu keputusan jenis per peran.
- Nama mapel untuk orang tua di `/children` perlu respons nilai anak yang membawa nama mapel.
- Kolom "Jenjang" di `/setup` belum terisi karena jenjang sekolah tidak tersedia di web.
- `/library/copies` tidak punya item sidebar sendiri, sehingga "Dasbor" yang tersorot.
- Kamera scan QR tidak tersedia di iOS Safari (tanpa BarcodeDetector); siswa iPhone memakai input kode.
- Data uji di database dev: jenis biaya "SPP Bulanan" dan tagihan 2026-09, satu siklus supervisi, dua sesi stock opname, satu eksemplar tambahan, status BGXI096 "Diperbaiki".
- Aplikasi native (`apps/mobile`) belum masuk sapuan ini.
