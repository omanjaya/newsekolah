# Beranda web per peran (Hijau Segar) -- design

Tanggal: 2026-09-26. Status: disetujui user di sesi brainstorming. Sub-proyek pertama dari redesain layar web per peran (lihat `docs/15-paritas-sion.md`, "Pembaruan 26 September").

## Tujuan

Ganti `apps/web/features/dashboard/components/dashboard-view.tsx` (satu tampilan berbasis izin, tata letak polos) dengan beranda yang disusun dari blok per peran dalam gaya Hijau Segar, memenuhi prinsip `docs/07-ui-ux.md` bagian 1: layar pertama menjawab "apa yang harus saya lakukan sekarang" tanpa scroll.

## Keputusan

- **Layout A** (dipilih lewat mockup): header sapaan, hero "sekarang" selebar konten, baris 4 stat tile, lalu grid dua kolom `xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]`: blok kerja di kiri, kolom samping (pengumuman, aktivitas) di kanan. Di bawah `xl` satu kolom. Border kartu tetap memakai token yang ada (`border-border`); tidak ada perubahan token.
- **Satu beranda gabungan** untuk pengguna multi-peran: blok setiap peran yang dimiliki ditumpuk; hero diambil dari peran paling mendesak.
- **Tanpa backend baru**. Data yang belum ada endpoint-nya dihitung di klien dari hook yang ada, atau diganti angka yang tersedia.

## Persona dan isi

Setiap persona menyumbang: kandidat hero (opsional, dengan prioritas), stat tile (0-4), blok kiri, blok kanan. Tile digabung lalu dipotong ke 4 teratas menurut prioritas persona.

| Persona (penentu)                                                  | Hero                                                                                         | Stat tile                                                                             | Blok                                                                                          |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Guru (`manage_attendance`)                                         | Sesi yang sedang berjalan atau berikutnya hari ini + tombol "Isi presensi" bila belum submit | sesi belum submit                                                                     | Kiri: "Mengajar hari ini" (daftar sesi, jam, kelas, mapel, status submit)                     |
| Wali kelas (duty `homeroom`)                                       | Bila tidak ada sesi: antrean izin kelas binaan                                               | izin kelas binaan menunggu, % hadir kelas hari ini                                    | Kiri: "Wali kelas {kelas}" (antrean izin + rekap status hadir)                                |
| Siswa (`profile_kind === "student"`)                               | Pelajaran berikutnya hari ini (mapel, jam, guru) + "Lihat jadwal"                            | % kehadiran bulan ini, izin diproses, buku dipinjam, nilai baru                       | Kiri: "Jadwal hari ini" (linimasa), "Izin saya"; kanan: "Perpustakaan" (jatuh tempo terdekat) |
| Admin/TU + kepala sekolah (role `admin`/`super_admin`/`principal`) | "X dari Y sesi sudah dipresensi" + "Lihat monitor"                                           | sesi dipresensi, izin menunggu (cuti+keluar+terlambat), pengguna aktif, sedang online | Kiri: "Antrean sekolah"; kanan: "Aktivitas login" (grafik 24 jam yang ada), "Siswa berisiko"  |
| Pustakawan (`manage_library_circulation`)                          | Meja sirkulasi: pinjam/kembali/terlambat hari ini + "Buka meja sirkulasi"                    | terlambat                                                                             | Kanan: "Perpustakaan" (terlambat terlama)                                                     |
| Guru piket (`issue_scan_tokens` / duty `picket`)                   | Antrean terlambat bila ada + "Buka pemindai"                                                 | terlambat menunggu, izin keluar menunggu                                              | Kiri: "Piket" (antrean terlambat dan izin keluar)                                             |
| BK (duty counselor / `issue_leave_letters`)                        | Antrean izin tahap BK bila ada                                                               | izin tahap BK, kandidat SP                                                            | Kiri: "BK" (antrean izin + kandidat SP)                                                       |
| Semua                                                              | --                                                                                           | notifikasi belum dibaca (pengisi bila tile < 4)                                       | Kanan: "Pengumuman" (`AnnouncementFeed limit={3} compact`)                                    |

**Urutan prioritas hero:** sesi mengajar berjalan dan belum submit > pelajaran berikutnya siswa > antrean izin (wali/BK) > antrean piket > meja sirkulasi > ringkasan sekolah (admin) > sesi mengajar berikutnya > hero sapaan netral tanpa aksi.

Persona di luar tabel (satpam, orang tua, operator platform) mendapat header, tile notifikasi, dan pengumuman, sama seperti sekarang.

## Sumber data (hook yang sudah ada)

- Guru: `attendance/api.ts` `useTodaySessionsQuery`; jam dari `reference/api.ts` `useAllPeriodsQuery`; nama dari `useClassesQuery`/`useSubjectsQuery` + `useLookup`. Sesi berjalan/berikutnya dihitung di klien dari jam sekarang di zona waktu tenant.
- Wali kelas: `me.duties` slug `homeroom` (`scope_id`, `scope_label`); `useHomeroomAttendanceQuery` (rate = hadir / total dari `status_counts`); `permits/api.ts` `useLeaveReviewQueueQuery`.
- Siswa: `schedule/api.ts` `useSchedulesQuery` (kelas `me.current_class`, hari ini) + jam pelajaran + `useTeachersQuery`; `useMyCalendarQuery(bulan ini)` untuk % hadir (hari berstatus hadir/terlambat dibagi hari yang punya status); `useMyLeaveRequestsQuery`; `useMyGradesQuery`; `library/me-api.ts` `useMyLibraryProfileQuery`.
- Admin/kepala sekolah: `dashboard/api.ts` `useAdminDashboardQuery` (+ `useAdminDashboardLive`); `analytics/api.ts` `useAtRiskStudentsQuery`.
- Pustakawan: `library/dashboard-api.ts` `useLibraryDashboardQuery`.
- Piket: `useLateArrivalQueueQuery`, `useExitPermitReviewQueueQuery`.
- BK: `useLeaveReviewQueueQuery`, `discipline/api.ts` `useSPCandidatesQuery`.
- Notifikasi: `useUnreadCountQuery`.

Setiap query hanya aktif bila persona terkait aktif (parameter `enabled`), agar tidak ada 403 di layar pertama.

## Arsitektur kode

- `apps/web/features/dashboard/home/personas.ts` -- fungsi murni `resolvePersonas(me, can)` mengembalikan daftar persona aktif; `pickHero(candidates)` memilih hero menurut prioritas; `mergeTiles(tiles)` mengambil 4 teratas. Diuji unit (`personas.test.ts`, `hero.test.ts`).
- `apps/web/features/dashboard/home/blocks/<persona>.tsx` -- per persona satu hook `use<Persona>Block()` yang mengembalikan `{ hero?, tiles, left, right, isLoading, isError, refetch }` dan komponen bloknya. Blok tidak tahu persona lain.
- `apps/web/features/dashboard/components/dashboard-view.tsx` -- hanya menyusun: header, `HeroCard`, `StatTileRow`, dua kolom. Error/loading per blok (satu blok gagal tidak menjatuhkan halaman; pakai `QueryError` di blok itu).
- Komponen bersama baru di `packages/ui` (dipakai ulang layar lain): `HeroCard` (latar `accent-soft`, label kecil, judul Manrope, meta, aksi utama, chip waktu opsional) dan `StatTile` (ikon Lucide dalam lingkaran lembut warna kategori, angka Manrope, label, tautan opsional). `Stat` yang ada tetap. Keduanya dengan story Storybook.
- Kode lama yang tergantikan (`action-tiles.tsx`, `daily-task-shortcut.tsx`, `section-card.tsx`, `today-sessions-card.tsx`, `admin-dashboard-panel.tsx`) dihapus atau diserap ke blok; test lama dipindah ke blok yang menggantikannya.
- Teks lewat i18n (`apps/web/messages/features/dashboard*.{id,en}.json`), Bahasa Indonesia default. Tanpa emoji; ikon Lucide.

## Backend

Tidak ada perubahan. `isAdminCaller` (`apps/api/internal/modules/analytics/transport/http/dashboard.go`) sudah mengizinkan role `principal` (Kepala Sekolah) selain `admin`/`super_admin`.

## Error, loading, kosong

- Loading: skeleton seukuran hero, 4 tile, dua kolom.
- Error per blok: `QueryError` dengan retry di dalam blok; hero jatuh ke kandidat berikutnya bila sumbernya gagal.
- Kosong: blok tanpa isi menampilkan kalimat singkat (misal "Tidak ada sesi hari ini"), bukan disembunyikan, kecuali blok persona yang tidak aktif.

## Testing

- Unit: `resolvePersonas`, `pickHero`, `mergeTiles`, hitung sesi berjalan/berikutnya, pelajaran berikutnya siswa, % hadir dari kalender.
- Komponen: tiap blok dengan data tiruan (pola `admin-dashboard-panel.test.tsx`); `HeroCard`/`StatTile` di `packages/ui`.
- Pemeriksaan visual di browser dengan akun seed `guru`, `siswa`, `admin`, `kepsek`, `pustakawan`, `gurupiket`, `gurubk` (password `Password123!`), tanpa scroll untuk hero + tile di 1440x900.
- Validasi akhir: `pnpm typecheck && pnpm lint && pnpm test`, `go test ./...`.

## Di luar cakupan

Endpoint baru "jadwal saya hari ini", persentase hadir siswa se-sekolah, perubahan token border, redesain layar lain, mobile.
