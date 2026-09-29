# Simulasi waktu untuk testing

Superadmin dapat mengatur tanggal dan jam melalui **Simulasi waktu untuk pengujian** di bagian atas aplikasi. Gunakan sekolah testing karena penyimpanan data tetap berjalan seperti biasa.

1. Masuk sebagai superadmin, buka **Simulasi waktu untuk pengujian**.
2. Pilih tanggal dan jam dalam zona waktu sekolah.
3. Pilih **Bekukan** untuk mempertahankan waktu pilihan, atau **Berjalan** agar waktu maju normal dari titik tersebut.
4. Terapkan simulasi. Banner menampilkan waktu yang sedang digunakan.
5. Gunakan tombol tambah 15 menit, 1 jam, atau 1 hari untuk berpindah skenario.
6. Untuk menguji peran guru/pegawai, aktifkan simulasi sebelum masuk sebagai pengguna tersebut melalui impersonation.
7. Kembalikan ke waktu asli setelah selesai.

## Cakupan

- Jadwal hari ini dan batas waktu edit jadwal guru.
- Daftar sesi absensi siswa, filter tanggal/bulan, dan batas waktu simpan/koreksi.
- Scan masuk/pulang pegawai dan perhitungan keterlambatan, mengikuti zona waktu sekolah.
- Tanggal pada dashboard dan tampilan terkait yang memakai sumber waktu simulasi.

Simulasi disimpan per tab browser dan terikat ke sekolah serta akun superadmin asal. Request pengguna lain tetap memakai waktu asli. Autentikasi, kedaluwarsa token, izin berdasarkan penugasan, pencatatan audit/database, serta pekerjaan latar belakang tetap memakai waktu asli. Tahun ajaran aktif tetap mengikuti pengaturan sekolah. Tampilan monitor melalui WebSocket tidak memakai header simulasi.

## Cakupan web (apps/web)

Setiap keputusan "waktu sekarang" di web (bukan waktu server yang sekadar ditampilkan) mengikuti `businessNow()` dari `apps/web/lib/simulation/clock.ts`, direfresh lewat `useSimulation()`/`useBusinessNow()` atau lewat invalidasi query otomatis saat simulasi berubah (`simulation-sync.tsx`).

Mengikuti jam simulasi:

- Tenggat "hari ini"/bulan berjalan: `lib/tenant-date.ts` dan `features/attendance/api.ts`'s `todayInZone`/`thisMonthInZone`/`nowTimeInZone`, dipakai luas (jadwal, absensi, cuti, kalender, laporan).
- Dashboard: sapaan dan tanggal header (`dashboard-view.tsx`), blok guru (`home/blocks/teacher.tsx`, sesi berjalan/berikutnya), blok siswa (`home/blocks/student.tsx`, jadwal hari ini dan jam berjalan).
- Absensi: kalender "hari ini" (`attendance-calendar.tsx`), editor sesi dan draf autosimpan (`session-editor.tsx`, `lib/attendance-draft.ts`), tampilan cek-masuk mandiri staf (`self-check-in-view.tsx`).
- Jadwal: grid mingguan dan hari yang sedang berjalan (`schedule-view.tsx`, `schedule-week-grid.tsx`).
- Jurnal: panel hari ini dan default tanggal pelajaran (`journal-today-panel.tsx`, `journal-form.tsx`, `lib/journal-draft.ts`).
- Formulir dan draf lain yang defaultnya "hari ini"/"sekarang": presensi kepegawaian dan kelas (`school/components/*`), kedisiplinan (`counseling-form.tsx`, `violation-record-form.tsx`, `lib/counseling-draft.ts`, `lib/warning-letter-number.ts`), penilaian (`lib/gradebook-draft.ts`, `lib/use-gradebook-save.ts`), ekstrakurikuler (`achievements-view.tsx`, `club-detail-view.tsx`), kalender sekolah (`calendar-view.tsx`), mutasi kelas/kenaikan (`promotion-view.tsx`), bimbingan (`mentor-meeting-note-form.tsx`), supervisi (`complete-observation-form.tsx`, `lib/observation-draft.ts`), insiden pengunjung (`incident-form.tsx`, `incident-log-view.tsx`), perizinan keluar (`exit-permit-panels.tsx`'s catatan waktu lolos gerbang), tagihan (`features/billing/api.ts`'s `currentPeriod`).
- Perpustakaan: jatuh tempo dan status terlambat (`lib/due-date.ts` lewat pemanggilnya, bukan helper itu sendiri), laporan dan filter tanggal (`library-reports-view.tsx`, `visits-view.tsx`), profil peminjaman sendiri dan anggota (`my-library-view.tsx`, `member-detail-view.tsx`), struk cetak sirkulasi (`desk-receipt-dialog.tsx`).
- Label hari relatif ("hari ini"/"kemarin") pada notifikasi dan pengumuman (`lib/use-day-label.ts`).

Tetap memakai waktu asli (`new Date()`/`Date.now()`) secara sengaja:

- Kedaluwarsa API key integrasi (`integrations/components/api-keys-panel.tsx`) -- itu adalah kedaluwarsa token autentikasi, bukan keputusan bisnis.
- Penjadwalan ulang dan status koneksi WebSocket (`lib/realtime/live-socket-provider.tsx`) dan jendela peredam toast sesi berakhir (`lib/session/auth-redirect-flag.ts`).
- Kunci `React key`/urutan daftar yang murni lokal dan sekali pakai (mis. `Date.now()` pada kunci event di `exit-permit-panels.tsx` dan `stocktake-session-view.tsx`).
- Implementasi jam simulasi itu sendiri (`lib/simulation/clock.ts`), yang memang membaca jam asli sebagai sumber "waktu berjalan".

**Kembali ke waktu asli hanya menghentikan simulasi. Data absensi/jadwal yang disimpan selama testing tetap tersimpan.** Mode ini bukan database sementara atau mekanisme undo. Modul di luar cakupan di atas belum mendukung simulasi waktu secara menyeluruh.

## Implementasi

Browser mengirim `X-Simulation-Time` berisi waktu efektif dalam RFC3339 pada request yang mendukung simulasi. Backend mewajibkan sesi login interaktif dan memeriksa izin `platform_superadmin` pada pelaku asli, termasuk saat impersonation. Header yang tidak valid atau tanpa izin ditolak.

Middleware memasang waktu pada context request; service bisnis mengambilnya lewat `clock.Now(ctx, fallback)`. Jam proses, database, dan `clock.Real` tidak diubah. Jangan mengganti jam autentikasi atau audit dengan helper simulasi.

Pengujian mencakup isolasi request, penolakan pengguna tanpa izin, impersonation, pergantian tanggal WITA, scan masuk/pulang, batas koreksi, dan batas edit jadwal.
