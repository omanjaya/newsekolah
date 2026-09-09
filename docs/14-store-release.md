# 14. Store Release Preparation (Mobile)

Status per Fase 4 (`docs/12-roadmap.md`): persiapan rilis selesai, submit ke
App Store dan Play Store belum dilakukan dan tidak termasuk cakupan dokumen
ini -- lihat "Yang belum" di bagian akhir.

## Identitas aplikasi

- Nama tampilan sementara: **SION** (`ios.infoPlist.CFBundleDisplayName`,
  lihat catatan di `docs/12-roadmap.md` soal nama produk).
- Bundle identifier / package name, sama di kedua platform:
  `id.newsekolah.mobile` (`apps/mobile/app.config.ts`).
- Versi awal: `0.1.0`; `runtimeVersion.policy: "appVersion"` sehingga
  pembaruan native menaikkan versi, pembaruan JS-only lewat EAS Update
  memakai channel yang sama.

## Ikon dan splash

- `assets/images/icon.png` (1024x1024, dengan alpha): dipakai untuk ikon
  Android (adaptive icon foreground) dan gambar splash di kedua platform.
- `assets/images/icon-ios.png` (1024x1024, tanpa alpha, di atas warna aksen
  `#1F3A5F`): App Store menolak ikon dengan kanal alpha, jadi iOS memakai
  salinan yang sudah diratakan ini lewat `ios.icon`, bukan `icon.png`
  langsung.
- Splash punya varian gelap (`plugins` -> `expo-splash-screen` -> `dark`)
  memakai latar `#141414` sesuai token gelap `DESIGN.md`.

## Kebijakan privasi

- Layar dalam aplikasi: `src/app/privacy.tsx`, dapat dibuka dari Profil ->
  "Kebijakan privasi". Merangkas tiga hal yang dipakai aplikasi (kamera,
  notifikasi, penyimpanan lokal untuk presensi luring) dan menaut ke
  kebijakan lengkap.
- URL kebijakan lengkap (dipakai juga saat pengisian metadata store):
  `https://newsekolah.id/privasi` (`PRIVACY_POLICY_URL` di `privacy.tsx`).
  Ganti ke domain sekolah/produk final sebelum submit.

## Izin dan alasannya

| Izin       | Platform                                                                                                                               | Alasan yang ditampilkan                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Kamera     | iOS (`NSCameraUsageDescription`), Android (`CAMERA`, lewat plugin `expo-camera`)                                                       | "Kamera dipakai untuk memindai kode QR presensi, gerbang, dan izin keluar."                                       |
| Face ID    | iOS (`NSFaceIDUsageDescription`)                                                                                                       | "Face ID dipakai untuk membuka akses tersimpan lebih cepat."                                                      |
| Notifikasi | Android 13+ (`POST_NOTIFICATIONS`, lewat plugin `expo-notifications`); iOS tidak punya string kustom, sistem menampilkan prompt bawaan | Dijelaskan di layar Kebijakan Privasi sebelum permintaan native diajukan: izin, presensi, dan pengumuman sekolah. |

Neither store lets an app supply custom copy inside the native permission
dialog itself; the in-app privacy screen is the mechanism for explaining
_why_ before that dialog appears, which is what reviewers check for.

## Profil build EAS (`eas.json`)

- `development`: dev client, distribusi internal, dipakai selama
  pengembangan lokal.
- `preview`: **internal testing** -- distribusi internal, channel
  `preview`, menunjuk ke `EXPO_PUBLIC_API_URL` staging. Ini profil yang
  dipakai untuk build TestFlight internal dan Android internal testing
  track (docs/10-mobile-strategy.md bagian 5).
- `production`: build untuk rilis toko, `autoIncrement` build number,
  channel `production`, menunjuk API produksi.

Tidak ada kredensial App Store Connect / Play Console yang disimpan di
`eas.json` (`submit.production` kosong dengan sengaja) -- itu diisi
interaktif oleh siapa pun yang benar-benar menjalankan submit, di luar
cakupan pekerjaan ini.

## Akun demo untuk reviewer

Reviewer App Store / Play Store butuh akun yang bisa langsung dipakai tanpa
mendaftar. Saat submit dilakukan nanti:

1. Jalankan seed data contoh di tenant demo (`apps/api/cmd/seed`, sudah
   idempoten -- lihat backlog teknis di `docs/12-roadmap.md`), yang mengisi
   jadwal, presensi, katalog pelanggaran, komponen penilaian, dan tautan
   orang tua contoh.
2. Siapkan satu akun per peran utama yang direview: siswa, guru, dan orang
   tua (peran piket dan satpam bisa dites lewat akun guru/staf yang sama
   karena keduanya cuma menu tambahan pada grup tab staf). Format akun
   `username` + kata sandi biasa (bukan magic link), karena reviewer login
   lewat layar login standar.
3. Cantumkan kredensial itu di catatan App Store Connect / Play Console
   ("App Review Information" / "Instructions for reviewers"), bukan di
   dalam aplikasi atau di repositori ini.

Dokumen ini sengaja tidak menuliskan kredensial nyata: pembuatan akun dan
pengisian kredensial ke konsol toko dilakukan oleh yang mengeksekusi submit,
bukan bagian dari pekerjaan ini (lihat batasan di ringkasan tugas Fase 4).

## Yang belum

- Submit sesungguhnya ke App Store Connect / Google Play Console (butuh
  akun developer dan review pihak Apple/Google) -- di luar cakupan.
- Ikon dan nama aplikasi final per identitas produk (SION masih nama
  sementara, lihat `docs/12-roadmap.md`).
- Metadata store (screenshot, deskripsi panjang/pendek, kata kunci) belum
  disiapkan; itu pekerjaan pemasaran/produk, bukan kode.
