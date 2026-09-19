# Audit UI CRUD web — 18 September 2026

## Lingkup dan arti status

Pemeriksaan statis terhadap komponen, hook API, pemanggil hook, dan beberapa handler backend. Inventaris mencakup fungsi mutasi yang diekspor dari berkas TypeScript tingkat atas di setiap folder `apps/web/features`, lalu pencarian pemanggil komponen. Temuan kosong diperiksa ulang melalui pencarian seluruh web dan pembacaan komponen terkait. Ini bukan pengujian browser setiap halaman atau pembuktian transaksi berhasil untuk semua peran.

`Tersambung` berarti tindakan memiliki pemanggil UI ke hook API. Status itu tidak menjamin otorisasi, validasi, atau hasil penyimpanan benar. `Celah` berarti ada tindakan yang belum ditawarkan UI meskipun kemampuan API/hook tersedia. Tidak semua halaman membutuhkan empat tindakan CRUD; laporan, presensi, surat, pembayaran, dan audit mengikuti alur domain.

## Celah UI yang ditemukan

Path di bawah relatif terhadap `apps/web/features` kecuali disebut berbeda.

| Halaman                | Yang tersedia                                       | Yang belum tersedia di UI                                       | Bukti                                                                                                                                                     |
| ---------------------- | --------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kelas dan Siswa        | Daftar, tambah, edit kelas; penempatan/pindah siswa | Hapus kelas                                                     | `school/components/classes-view.tsx`, `school/api.ts`; handler `apps/api/internal/modules/academic/transport/http/class.go` memiliki DeleteClass          |
| Ekstrakurikuler        | Daftar/detail, tambah, edit; anggota dan pertemuan  | Hapus; kontrol aktif/nonaktif; pengaturan kebijakan keanggotaan | `activities/components/clubs-view.tsx` mempertahankan `initial?.is_active`; hook delete dan update policy di `activities/api.ts` tidak dipanggil komponen |
| Kegiatan Siswa         | Daftar dan tambah                                   | Edit, hapus, pengelolaan peserta                                | `activities/components/activities-calendar-view.tsx`; empat hook update/delete/participant di `activities/api.ts` tidak memiliki pemanggil UI             |
| Prestasi               | Daftar dan tambah                                   | Edit dan hapus                                                  | `activities/components/achievements-view.tsx`; update/delete di `activities/api.ts` tidak dipanggil UI                                                    |
| Katalog perpustakaan   | Daftar/detail dan tambah judul                      | Edit judul                                                      | `library/components/catalogue-view.tsx`; `useUpdateLibraryTitleMutation` di `library/api.ts` hanya didefinisikan                                          |
| Anggota perpustakaan   | Daftar/detail, registrasi, ubah status, clearance   | Edit atribut keanggotaan melalui endpoint update anggota        | `library/members-api.ts`: `useUpdateLibraryMemberMutation` tidak dipanggil komponen; perubahan status memiliki UI tersendiri                              |
| Kebijakan perpustakaan | Aturan pinjam memiliki layar tambah/daftar/hapus    | Editor kebijakan umum perpustakaan                              | `useUpdateLibraryPolicyMutation` di `library/api.ts` tidak dipanggil UI; kebijakan umum berbeda dari aturan pinjam per jenis anggota                      |
| Diskon tagihan         | Daftar, tambah, hapus                               | Edit diskon                                                     | `billing/components/fee-type-discounts-dialog.tsx`; `useUpdateDiscountMutation` tidak dipanggil UI                                                        |
| Peringatan dini        | Daftar dan detail risiko siswa                      | Editor kebijakan perhitungan                                    | `analytics/api.ts`: `useUpdateEarlyWarningPolicyMutation` tidak dipanggil UI                                                                              |

Jangan menyambungkan tombol hapus sebelum memeriksa konsekuensi relasi, batas akses, dan apakah arsip/nonaktif lebih tepat. Ketiadaan editor pengaturan dapat menjadi keputusan produk; perlu dibedakan dari kelalaian implementasi.

## Inventaris tindakan yang memiliki sambungan komponen

| Area                                  | Tindakan yang ditemukan                                                                  | Batas kesimpulan                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Struktur Sekolah                      | Tingkat kelas, peminatan, ruang: tambah/edit/hapus dan daftar                            | Tersambung                                                                  |
| Pembelajaran                          | Mapel, penawaran mapel, periode dan template jam: tambah/edit/hapus dan daftar           | Tersambung                                                                  |
| Tahun ajaran / semester               | Tambah/edit, aktivasi; arsip tahun; hapus semester                                       | Mengikuti siklus tahun ajaran                                               |
| Penugasan                             | Sinkronisasi mengajar, tambah/akhiri tugas; edit/hapus jenis tugas dan izin              | Bukan CRUD seragam                                                          |
| Pengguna                              | Tambah/edit, arsip/pulihkan, reset sandi, impor; tautan anak                             | Arsip menggantikan hapus                                                    |
| Kalender akademik                     | Tambah/edit/hapus                                                                        | Berbeda dari Kegiatan Siswa yang masih memiliki celah                       |
| Tahun baru / kenaikan kelas           | Preview dan commit                                                                       | Operasi massal                                                              |
| Jadwal                                | Tambah, edit melalui replace, hapus, impor, bersihkan                                    | Ada risiko pada implementasi replace, lihat bawah                           |
| Guru pengganti                        | Ajukan, respons, batalkan                                                                | Workflow                                                                    |
| Presensi siswa                        | Buka sesi, simpan/koreksi dan jurnal                                                     | Tidak memerlukan hapus bebas                                                |
| Jurnal                                | Daftar, simpan baru/edit melalui upsert, hapus                                           | Ada masalah ekspor dan pagination                                           |
| Kelola nilai                          | Komponen tambah/edit/hapus, simpan skor, override rapor, publikasi, rentang, TP, bintang | Tersambung; perlu tes aturan penilaian                                      |
| Nilai Saya                            | Baca hasil publikasi                                                                     | Read-only sesuai tujuan                                                     |
| Perizinan                             | Pengajuan, review, scan tahap/gerbang, token, pembatalan izin keluar, bukti, surat       | Tidak sama dengan CRUD master data                                          |
| Kedisiplinan                          | Katalog tambah/edit/hapus, catat/batalkan pelanggaran, terbitkan/unduh SP, kebijakan     | Pembatalan dan penerbitan sesuai domain                                     |
| Konseling                             | Tambah/edit/hapus, lampiran dan laporan                                                  | Hak baca/ubah harus tetap dibatasi                                          |
| Pengumuman                            | Tambah/edit/hapus, transisi status, tanda baca                                           | Tersambung                                                                  |
| Mentoring                             | Kelompok dan catatan tambah/edit/hapus, anggota, rangkuman, batas kelompok               | Tersambung                                                                  |
| Supervisi                             | Tambah/edit siklus, jadwalkan/selesaikan observasi, tanggapan                            | Workflow; bukan bukti seluruh operasi backend terjangkau                    |
| Presensi pegawai                      | Jadwal, scan, manual, koreksi, impor                                                     | Workflow                                                                    |
| Tagihan                               | Jenis biaya tambah/edit/hapus, preview/generate, pembayaran, void, kuitansi              | Edit diskon belum tersambung                                                |
| Kunjungan                             | Check-in/out, tamu terencana/batal, insiden tambah/edit/tutup, rekap                     | Workflow                                                                    |
| Sirkulasi perpustakaan                | Pinjam/kembali, perpanjang, hilang, pengingat, peminjaman kelas                          | Tersambung                                                                  |
| Perpustakaan Saya                     | Reservasi dan batalkan reservasi sendiri                                                 | Hook reservasi staf yang tidak dipakai bukan berarti semua reservasi hilang |
| Stok opname                           | Mulai, scan, tutup                                                                       | Workflow                                                                    |
| Master perpustakaan                   | Jenis bahan, sumber akuisisi, mitra, jenis anggota: tambah/edit/hapus                    | Tidak menyimpulkan seluruh master perpustakaan lengkap                      |
| Impor / kunjungan perpustakaan        | Preview/commit, catat kunjungan, token kiosk, baca di tempat                             | Tersambung                                                                  |
| Denda perpustakaan                    | Catat dan selesaikan                                                                     | Tidak memerlukan hapus transaksi bebas                                      |
| Laporan                               | Ekspor, jadwal laporan tambah/edit/hapus dan aktif/nonaktif                              | Read-only/penjadwalan                                                       |
| Peran dan akses                       | Tambah/hapus peran, ganti izin                                                           | Perlu evaluasi terpisah untuk rename peran                                  |
| Pengaturan                            | Sesi, branding/aset, notifikasi, SSO, workflow                                           | Editor konfigurasi                                                          |
| Dokumen                               | Tambah/edit template, jadikan default                                                    | Tidak menyatakan hapus template tersedia                                    |
| Integrasi                             | Buat/cabut API key, webhook tambah/edit/hapus, retry delivery                            | Tersambung                                                                  |
| WhatsApp                              | Konfigurasi provider, template tambah/edit/hapus/preview, kirim ulang                    | Tersambung                                                                  |
| Akun                                  | Profil/avatar, cabut sesi, MFA, passkey daftar/rename/hapus                              | Tersambung                                                                  |
| Platform                              | Buat tenant, suspend/resume, domain, flag, ekspor                                        | Workflow admin platform                                                     |
| Dashboard, audit, monitor, notifikasi | Tampilan pemantauan; notifikasi memiliki tanda baca                                      | CRUD umum tidak menjadi kriteria                                            |

## Tindakan tersedia tetapi belum layak dianggap selesai

1. **Prioritas tinggi: edit jadwal.** `apps/web/features/schedule/api.ts`, `useReplaceScheduleBlockMutation`, melakukan DELETE per jadwal kemudian POST pengganti dalam beberapa request. Jika POST gagal, jadwal lama sudah terhapus. Migrasi `0032_attendance_sessions.up.sql` memakai `schedule_id ... on delete cascade`; handler penghapusan tidak memeriksa keberadaan presensi. Perubahan jadwal yang sudah dipakai berisiko menghapus sesi presensi. Perlu pembaruan atomik dan perlindungan riwayat, bukan sekadar menambah tombol.
2. **Ekspor DOCX jurnal.** Tombol memanggil endpoint, tetapi `apps/api/internal/modules/scheduling/transport/http/journal.go` mengembalikan 501 untuk format DOCX.
3. **Pagination jurnal.** `journal/api.ts` tidak mengirim limit/offset; service membatasi default 50. `journal/components/journal-view.tsx` memakai data lokal dan tidak menghubungkan pergantian halaman ke server. Perlu pengambilan halaman selanjutnya untuk membaca seluruh data.
4. **Input siswa pada Prestasi.** Form masih meminta ID siswa sebagai teks dan tabel menampilkan `student_user_id`. Meski tombol tambah ada, alur pengguna belum nyaman; perlu pemilih siswa dan nama yang terbaca.

## Mengapa angka coverage lama tidak cukup

`scripts/api-coverage.mjs` mencari stem URL sebelum parameter path. Ia tidak memeriksa metode HTTP, keterpakaian hook, keberadaan tombol, maupun hasil request. GET satu resource bisa membuat operasi PUT/DELETE pada resource yang sama terlihat terjangkau. Hasil 576/576 bukan bukti kelengkapan CRUD UI.

## Urutan tindak lanjut

1. Amankan pengubahan jadwal dan riwayat presensi.
2. Lengkapi UI Prestasi dan Kegiatan, termasuk pemilih siswa/peserta.
3. Lengkapi edit katalog, atribut anggota perpustakaan, dan diskon.
4. Tinjau aturan penghapusan kelas serta nonaktif/hapus ekstrakurikuler sebelum menambah kontrol.
5. Putuskan editor kebijakan mana yang perlu terlihat untuk admin sekolah.
6. Uji tambah → baca ulang → ubah → baca ulang → hapus/arsip/batalkan dengan akun sesuai peran dan data uji. Audit ini belum menjalankan langkah tersebut.
