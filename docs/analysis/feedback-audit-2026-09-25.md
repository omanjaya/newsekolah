# Audit umpan balik aksi, 25 September 2026

Keluhan pemilik: "aksi berhasil atau gagal sering tidak ada umpan balik sama sekali." Sesi ini mengaudit setiap `useMutation` (dan panggilan `fetch`/POST/PUT/PATCH/DELETE mentah, termasuk upload dan ekspor) di `apps/web` dan `apps/mobile`, memasang jaring pengaman sistemik lewat `MutationCache` react-query di kedua aplikasi, lalu menerapkan perbaikan tepat sasaran. Metodologi: skrip statis (grep + parser regex ringan atas AST tekstual, bukan analisis semantik penuh) mengekstrak setiap definisi `useMutation` dan menandai apakah pemanggilnya sudah menunjukkan `toast.success`/`toast.error`/pesan error inline (`apiErrorMessage`), lalu setiap temuan "tanpa umpan balik" diverifikasi manual satu per satu (lihat tabel di bawah).

## Ringkasan angka

| Area                      | Total mutation                                                          | Sudah ada umpan balik (langsung atau lewat komponen bersama) | Benar-benar tanpa umpan balik (celah nyata)        | Berisiko duplikat toast setelah `MutationCache` dipasang |
| ------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------- |
| Web (`apps/web/features`) | 312 hook `useMutation`                                                  | 306                                                          | 3 (lihat "Celah nyata")                            | 258 (opt-out `errorToast: false` diterapkan)             |
| Mobile (`apps/mobile`)    | 28 hook `useMutation` + 3 hook bersama (`@newsekolah/api-client/react`) | ~19                                                          | 2 celah nyata + 2 aksi destruktif tanpa konfirmasi | 3 (auth)                                                 |

Temuan utama yang mengubah rencana kerja: **mayoritas mutation di web sudah punya penanganan error manual** (`try/catch` + `toast.error(apiErrorMessage(...))` atau pesan inline `role="alert"`) -- investasi sebelumnya sudah cukup baik. Risiko sistemik yang sebenarnya bukan "tidak ada umpan balik", tetapi **umpan balik ganda**: begitu `MutationCache` default dipasang, 258 mutation di web (dan beberapa di mobile) akan menampilkan toast generik kedua di atas toast/pesan yang sudah mereka tampilkan sendiri, kalau tidak di-opt-out.

## Celah nyata yang diperbaiki

| Aplikasi | Mutation                                                          | Sebelum                                               | Sesudah                                                                            |
| -------- | ----------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Mobile   | `useRespondSubstitution` (terima/tolak permintaan guru pengganti) | Tidak ada apa pun saat berhasil                       | `meta.successMessage` = "Tanggapan tersimpan"                                      |
| Mobile   | `useCancelSubstitution`                                           | Tidak ada apa pun saat berhasil                       | `meta.successMessage` = "Permintaan dibatalkan"                                    |
| Mobile   | Mengakhiri sesi login lain (`ProfileScreen`, `useRevokeSession`)  | Tidak ada konfirmasi, tidak ada umpan balik sukses    | `Alert.alert` konfirmasi dulu (menyamai `ConfirmDialog` di web), lalu toast sukses |
| Mobile   | Hapus catatan jurnal (`useDeleteJournal`)                         | Tombol destruktif langsung menghapus tanpa konfirmasi | `Alert.alert` konfirmasi dulu                                                      |
| Web      | `useIssueLibraryKioskTokenMutation` (token QR kios perpustakaan)  | Tidak ada penanganan error sama sekali                | Sekarang tertangkap oleh default `MutationCache` (toast error tervermah)           |

Yang lain dari 16 kandidat "tanpa umpan balik" awal ternyata _negatif palsu_ skrip: sudah tertangani lewat komponen bersama yang tidak dibaca skrip (lihat "Pola tersembunyi" di bawah), atau memang sengaja senyap (mark-as-read notifikasi/pengumuman -- aksi pasif, bukan aksi utama pengguna) dan sekarang tetap mendapat jaring pengaman error dari `MutationCache` tanpa perubahan kode. Tiga hook (`useCreateReservationMutation`, `useCancelReservationMutation` di `library/api.ts`, `useSeedSampleDataMutation` di `onboarding/api.ts`) terdefinisi tapi tidak dipanggil dari layar mana pun -- dibiarkan apa adanya, dicatat sebagai potensi kode mati untuk sesi lain.

## Pola tersembunyi yang ditemukan (komponen bersama menyerap error)

Skrip awal hanya memeriksa file yang sama dengan pemanggilan hook. Tiga komponen bersama ternyata menyerap error/sukses satu tingkat lebih jauh, membuat hook yang memakainya salah tampil sebagai "tanpa umpan balik":

- `MfaCodeForm` (`features/security/components/mfa-code-form.tsx`): menampilkan error `ApiError` inline (`form.setError("root")`); `security-view.tsx` menoast sukses sendiri. Mempengaruhi `useConfirmMfaEnrolmentMutation`, `useDisableMfaMutation`, `useRegenerateMfaRecoveryCodesMutation`.
- `ReportExportDialog` (`components/report-export-dialog.tsx`): loading state dan `toast.error` sendiri di sekitar prop `onExport`. Mempengaruhi `useExportDailyRecapMutation`/`useExportMonthlyRecapMutation` (visitors) -- satu-satunya alur ekspor di aplikasi yang lewat `useMutation` sungguhan; ekspor lain (presensi, jurnal, rapor, dll.) memanggil helper unduh langsung di luar react-query sehingga tidak berisiko duplikat.
- `MasterEntryTab` (`features/library/components/master-entry-tab.tsx`): tabel CRUD generik yang menoast sukses/error sendiri untuk mutation create/update/remove yang diberikan lewat props. Mempengaruhi 9 hook (sumber akuisisi, kategori koleksi, lokasi perpustakaan).

Ketiganya diperbaiki dengan `meta: { errorToast: false }` pada definisi hook, bukan menyentuh komponen bersama itu sendiri.

## Perbaikan sistemik

### 1. `MutationCache` per aplikasi

- Web: `apps/web/lib/query/mutation-cache.ts`, dipasang di `apps/web/lib/query/query-provider.tsx`.
- Mobile: `apps/mobile/src/lib/api/mutation-cache.ts`, dipasang di `apps/mobile/src/app/_layout.tsx`.
- Kontrak `meta` yang sama di kedua aplikasi (`apps/web/lib/query/mutation-meta.ts`, `apps/mobile/src/lib/api/mutation-meta.ts` -- deklarasi `Register["mutationMeta"]` terpisah karena masing-masing adalah program TypeScript sendiri):
  - `onError` default: toast error dengan pesan tervermah dari `@newsekolah/i18n`'s `apiErrorMessageKey` (baru, `packages/i18n/src/api-error.ts`) -- memetakan `ApiError.code` ke katalog `errors.*` yang sudah ada, dan sekarang **juga** memetakan kegagalan jaringan mentah (`fetch` gagal sebelum sempat dapat respons -- offline, DNS, timeout `AbortController`) ke `errors.NETWORK` ("Tidak dapat terhubung ke server, periksa koneksi") alih-alih jatuh ke pesan generik seperti sebelumnya.
  - Opt-out: `meta: { errorToast: false }` -- dipakai mutation yang pemanggilnya (langsung atau lewat komponen bersama) sudah menampilkan error sendiri.
  - `onSuccess` default: senyap kecuali `meta: { successMessage: "..." }` diisi -- kebalikan dari error secara sengaja: mutation latar belakang yang senyap saat sukses tidak masalah, senyap saat gagal (yang sedang ditunggu pengguna) itu masalahnya.
  - Ditekan ~2 detik setelah sesi berakhir paksa (`auth-redirect-flag.ts` di kedua aplikasi): saat token kedaluwarsa, beberapa mutation yang sedang berjalan bisa gagal dengan 401 yang sama di tick yang sama tepat saat halaman pindah ke `/login` -- tanpa ini, tiap satu akan menampilkan toast "sesi berakhir" sendiri-sendiri.
- Form autentikasi (login, passkey, Google, lupa/reset sandi, ubah sandi) di kedua aplikasi semuanya menampilkan error inline di field, bukan toast, secara sengaja -- semua di-opt-out (`meta: { errorToast: false }`) termasuk tiga hook bersama di `@newsekolah/api-client/react` (`useLogin`, `useRevokeSession`, `useChangePassword`), yang sekarang menerima parameter `meta` opsional supaya tiap aplikasi bisa memutuskan sendiri (paket ini sendiri tidak punya i18n atau tahu strategi toast aplikasi yang memakainya).

### 2. Desain toast

- Web (`packages/ui/src/components/toast.tsx`): ikon Lucide per varian (`CheckCircle2`/`AlertCircle`/`Info`), warna token `status-present`/`status-absent` yang sama dipakai `Button` varian `danger` dan `StatusBadge`, tombol tutup, durasi error 8 detik (sukses tetap default sonner, otomatis hilang). Toast error sekarang juga menggemakan teksnya ke region `role="alert" aria-live="assertive"` terpisah (`sr-only`) karena region bawaan sonner cuma `aria-live="polite"` untuk semua jenis toast.
- Mobile (`apps/mobile/src/components/ui/Toast.tsx`): pola yang sama -- ikon, deskripsi opsional, aksi (mis. "Coba lagi"), tombol tutup, `accessibilityRole="alert"` + `accessibilityLiveRegion="assertive"` untuk error, 8 detik untuk error vs 3 detik untuk sukses/info.
- `useToast()` (web) sekarang juga diekspor sebagai objek `toast` biasa (bukan hook) -- `MutationCache` berjalan di luar React sehingga tidak bisa memanggil hook sama sekali.

### 3. Pesan sukses yang ditambahkan (contoh)

"Presensi tersimpan" (mobile, `useSaveEntries` -- sudah ada di layar, dipertahankan manual karena jalur luring punya pesan berbeda), "Izin diajukan"/"Izin dibatalkan" (mobile, `useCreateExitPermit`/`useCancelExitPermit`), "Tinjauan tersimpan" (mobile, review terlambat/izin), "Jurnal tersimpan"/"Jurnal dihapus" (mobile), "Tanggapan tersimpan"/"Permintaan dibatalkan" (mobile, guru pengganti), "Sesi diakhiri" (mobile, revoke session). Web sebagian besar sudah punya pesan sukses sendiri per fitur (contoh: `schedule-form.tsx`'s `t("created")`/`t("updated")`) -- tidak diubah, hanya diverifikasi tidak akan terduplikasi oleh default baru.

## Uji

- `packages/i18n/src/api-error.test.ts` -- klasifikasi kode error dan kegagalan jaringan.
- `packages/ui/src/components/toast.test.tsx` -- ikon/warna per varian, region `role="alert"`, aksi coba lagi.
- `apps/web/lib/query/mutation-cache.test.ts`, `apps/web/lib/session/auth-redirect-flag.test.ts` -- default sukses/error, opt-out meta, penekanan saat redirect auth.
- `apps/mobile/__tests__/mutation-cache.test.ts` -- padanan mobile.

## Yang sengaja tidak disentuh

- ~32 hook di web yang pemanggilnya sudah menampilkan error _inline_ (`apiErrorMessage` + `role="alert"`, bukan toast) dibiarkan memakai default `errorToast` aktif. Ini sesuai instruksi tugas ("form yang sudah menampilkan error inline _boleh_ opt out") -- bukan wajib, dan toast tambahan di atas teks inline bukan regresi (memberi jaring pengaman kalau teks inline gagal render), hanya berpotensi terasa berlebih di beberapa layar. Dicatat sebagai kandidat pembersihan lanjutan, bukan bug.
- Tidak ditemukan panggilan `fetch()` mentah di komponen `.tsx` mana pun di luar lapisan `*/api.ts` (semua upload/ekspor lewat `useMutation` yang sudah diaudit) kecuali `school/lib/user-import.ts`'s `downloadUserImportTemplate`, yang sudah punya status loading dan `.catch` sendiri di `user-import-view.tsx`.
