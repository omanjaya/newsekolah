# 10. Mobile Strategy (iOS dan Android)

## 1. Keputusan

**Expo (React Native) untuk iOS dan Android**, dalam monorepo yang sama dengan web. Aplikasi SwiftUI `nouschool` yang sudah ada menjadi referensi UX (alur login, scanner, linimasa) dan sumber DTO untuk memverifikasi kontrak API, bukan basis kode yang dilanjutkan.

| Opsi | Kelebihan | Kekurangan | Keputusan |
|---|---|---|---|
| Expo / React Native | Satu codebase iOS + Android, berbagi tipe, schema, dan hook dengan web; OTA update; ekosistem kamera/push matang | Performa kamera sedikit di bawah VisionKit; butuh disiplin agar tidak "web di dalam app" | Dipilih |
| Native SwiftUI + Kotlin Compose | Kualitas platform terbaik, VisionKit, widget | Dua codebase tambahan, tim kecil, tiga kali kerja tiap fitur | Ditolak untuk saat ini |
| Flutter | Satu codebase, performa baik | Bahasa berbeda (Dart), tidak bisa berbagi kode dengan web TypeScript | Ditolak |
| Capacitor membungkus PWA | Paling cepat | Ditolak review App Store bila hanya web; pengalaman scanner dan offline lemah | Ditolak |

Jika suatu hari dibutuhkan fitur khusus (mis. Live Activity status izin keluar), Expo mendukung modul native lewat Expo Modules (Swift/Kotlin) tanpa meninggalkan RN.

## 2. Prasyarat di backend (masuk sprint awal, bukan setelah web selesai)

1. Refresh token dan pencabutan sesi (lihat 08-security.md).
2. Kode error stabil di semua respons.
3. Push multi-platform: tabel `push_devices (platform: web|ios|android, token, ...)`, satu job pengirim dengan adapter Web Push, APNs, FCM v1.
4. Header `X-Client: mobile/ios/1.4.0` untuk pemeriksaan versi minimum dan pesan "perbarui aplikasi".
5. Idempotency-Key untuk POST.
6. Endpoint ringkas untuk layar utama mobile (`GET /me/home`) yang menggabungkan jadwal hari ini, izin aktif, notifikasi belum dibaca, agar layar pertama satu request.
7. Endpoint delta sync (`?updated_since=`) untuk data yang di-cache offline: jadwal, daftar siswa kelas yang diampu, katalog pelanggaran.

## 3. Arsitektur aplikasi

```
apps/mobile/
  app/
    (auth)/login, server-setup, forgot
    (student)/  home, attendance, permits, grades, library, notifications, profile
    (teacher)/  home (jadwal hari ini), attendance/[session], journal, qr, substitutions, notifications
    (staff)/    gate-scan, late-arrivals, library-desk, opname
    (shared)/   scanner, announcements/[id], settings
  features/  <- hook dari packages (useTodaySchedule, useSubmitAttendance, ...)
  lib/
    auth/        SecureStore, refresh interceptor, biometric unlock
    push/        registrasi token, deep link dari notifikasi
    offline/     antrean mutasi (SQLite via expo-sqlite), sinkronisasi saat online
    scanner/     expo-camera barcode: qr, code39, code128, ean13; mode beruntun untuk opname
    tenant/      pemilihan sekolah (subdomain) saat login pertama, tersimpan di SecureStore
```

- Navigasi per peran: setelah login, `roles[]` menentukan grup tab; pengguna multi-peran punya pengalih peran di profil.
- Branding sekolah (logo, warna aksen, nama) diambil dari `GET /tenant/branding` dan diterapkan runtime; satu binary untuk semua sekolah. Distribusi white-label per sekolah (ikon dan nama app berbeda) dimungkinkan lewat EAS build profile bila sekolah membayar untuk itu.
- Offline: presensi guru bisa diisi tanpa jaringan dan dikirim saat online dengan Idempotency-Key; scanner opname mengantre hasil scan.
- Push: deep link `nouschool://permits/{id}`; notifikasi kategori (izin, presensi, pengumuman, perpustakaan) dapat diatur per pengguna.
- Keamanan: sertifikat pinning opsional per tenant untuk self-host; jailbreak/root tidak diblokir, hanya dicatat.

## 4. Fitur v1 mobile per peran

| Peran | Fitur |
|---|---|
| Siswa | Beranda hari ini, kalender presensi + detail sesi, scan QR masuk kelas / terlambat / tahap izin keluar, ajukan izin terencana dengan foto, QR gerbang, nilai dan bintang, perpustakaan saya, notifikasi, profil dan sesi aktif |
| Guru | Jadwal hari ini dan pekan ini, presensi cepat (grid H/S/I/D/A dengan gesture), tampilkan QR kelas, jurnal kelas, permintaan pengganti, kelas binaan (wali), notifikasi |
| Guru piket / BK / Kepala | Antrean persetujuan izin keluar, terlambat, izin terencana; SP; konseling (ringkasan) |
| Keamanan | Scan gerbang, riwayat hari ini |
| Pustakawan | Sirkulasi berbasis scan, opname beruntun, kunjungan |
| Orang tua (v1.1) | Presensi anak, izin, pengumuman, nilai bila diaktifkan sekolah |

## 5. Rilis

- iOS: TestFlight internal per sprint; App Store dengan akun developer Nouma. Android: internal testing track lalu produksi.
- EAS Update channel `preview` dan `production`; hanya JS yang berubah lewat OTA, perubahan native lewat rilis store.
- Maestro untuk uji alur utama (login, presensi, scan) di CI pada simulator.
- Kebijakan privasi store menyebut kamera (scan), notifikasi, dan penyimpanan lokal; tidak ada iklan atau pelacak pihak ketiga selain Sentry.
