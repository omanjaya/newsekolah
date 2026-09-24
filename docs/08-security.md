# 08. Security

Dokumen ini menetapkan kontrol keamanan yang wajib ada sejak sprint pertama. Setiap butir memetakan ke temuan pada aplikasi lama (lihat 01-analisis-aplikasi-lama.md bagian keamanan) supaya tidak terulang.

## 1. Model ancaman

Aktor: siswa (paling banyak, paling kreatif), guru, staf, orang tua, operator sekolah, operator platform, penyerang eksternal. Aset: data pribadi anak (UU PDP), nilai, catatan konseling BK, foto, kredensial, dokumen resmi (surat izin, SP). Dampak terbesar: kebocoran catatan konseling, manipulasi presensi dan nilai, akses lintas sekolah pada SaaS.

## 2. Autentikasi

| Kontrol                   | Ketentuan                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password                  | Argon2id (m=64MB, t=3, p=2), minimal 8 karakter, cek terhadap daftar bocor (k-anonymity HIBP) opsional                                                                                      |
| Sesi                      | Access token JWT 15 menit (ES256, `kid` untuk rotasi kunci) + refresh token acak 256-bit, disimpan hash SHA-256 di tabel `sessions` dengan `device_id`, `user_agent`, `ip`, `last_seen_at`  |
| Rotasi refresh            | Setiap refresh menerbitkan token baru dan mencabut yang lama; penggunaan ulang token lama mencabut seluruh keluarga sesi (deteksi pencurian)                                                |
| Penyimpanan web           | Cookie `httpOnly; Secure; SameSite=Lax; Path=/` untuk refresh (lihat catatan Path di bawah), access token di memori saja untuk client-side. Tidak ada token di `localStorage`               |
| Penyimpanan mobile        | `expo-secure-store` (Keychain / Keystore); biometrik hanya membuka SecureStore, bukan skema "token biometrik" terpisah                                                                      |
| Logout dan ganti password | Mencabut sesi di server; perubahan password mencabut semua sesi kecuali yang sedang dipakai                                                                                                 |
| Rate limit                | Login 5 percobaan / 15 menit per akun dan 20 / 15 menit per IP (Redis); respons waktu konstan untuk username tidak ditemukan                                                                |
| Reset password            | Token sekali pakai 30 menit lewat email/WhatsApp OTP; tidak pernah mengembalikan password plaintext; admin reset menghasilkan tautan set-password, bukan password                           |
| 2FA                       | TOTP wajib untuk role operator platform dan admin sekolah; opsional guru                                                                                                                    |
| SSO                       | OIDC Google Workspace for Education per tenant (opsional), pemetaan email ke user yang sudah ada, tidak auto-provision                                                                      |
| Impersonasi               | Hanya admin dengan permission khusus, sesi impersonasi terpisah 30 menit dengan `actor_user_id`, tercatat di audit log, ditandai di UI, dapat dihentikan dan pencabutannya efektif seketika |
| Perangkat                 | Daftar sesi aktif di halaman profil, pengguna bisa mencabut sesi lain                                                                                                                       |

Catatan Path refresh cookie: awalnya `Path=/api/v1/auth` (sempit, hanya dikirim ke endpoint refresh). Diperlebar ke `Path=/` supaya `apps/web/middleware.ts` bisa membacanya pada navigasi dokumen biasa (mis. `/dashboard`) untuk menjalankan refresh terikat TTL di server (lihat "Server-side access cookie" di bawah) -- Cookie Path hanya mendukung satu prefix, jadi tidak bisa sekaligus sempit ke `/v1/auth` dan mencakup seluruh grup rute `(app)`. Ini tidak melemahkan apa pun yang sebelumnya dilindungi Path sempit: cookie tetap `httpOnly` (tidak pernah terbaca JS terlepas dari Path) dan `SameSite=Lax` (tidak pernah terkirim cross-site terlepas dari Path); perlindungan CSRF endpoint refresh berasal dari `SameSite=Lax` + pengecekan header `Origin` (`OriginAllowed`), bukan dari Path. Migrasi: sesi lama masih menyimpan cookie ber-`Path=/v1/auth`; begitu rotasi menerbitkan cookie ber-`Path=/`, browser menyimpan keduanya dan mengirim yang lama lebih dulu (path lebih panjang), sehingga refresh berikutnya membaca nilai basi dan deteksi reuse mencabut seluruh keluarga sesi. Middleware `LegacyRefreshCookieCleanup` (`platform/httpx/cookie.go`, terdaftar di router) menutup celah ini: setiap respons yang menerbitkan refresh cookie ber-`Path=/` juga mengirim penghapus untuk path lama, jadi keadaan dua-cookie tidak pernah terbentuk. Boleh dihapus setelah semua sesi pra-pelebaran kedaluwarsa (satu TTL refresh token sejak rilis).

Server-side access cookie (middleware-managed, bukan refresh per navigasi): `apps/web/middleware.ts`, hanya untuk navigasi dokumen GET sungguhan ke rute `(app)` (menyaring RSC/prefetch lewat header `Sec-Fetch-Dest`/`Next-Router-Prefetch`), memeriksa cookie `httpOnly; SameSite=Lax; Path=/` bernama `sat` yang diterbitkannya sendiri. Bila tidak ada dan cookie `refresh_token` ada, middleware memanggil `POST /v1/auth/refresh` sekali (tidak pernah retry -- retry dengan cookie yang sama adalah reuse yang dideteksi sebagai pencurian), merelai `Set-Cookie` refresh yang dirotasi API apa adanya, dan menerbitkan `sat` dengan `maxAge` = TTL access token dikurangi margin aman 45 detik. Ini membatasi frekuensi refresh ke sekali per TTL (bukan setiap navigasi) dan mempersempit celah race dua tab ke sekitar batas TTL tersebut (risiko residual yang diterima, bukan dihilangkan). `sat` tidak pernah dikirim ke JS klien (httpOnly); `GET /v1/me` yang di-prefetch server (`lib/session/dehydrate-app-query-client.server.ts`) membacanya lewat `next/headers`, bukan dari cookie refresh.

## 3. Otorisasi

- **RBAC + scope.** Permission katalog statis di kode (`authz/permissions.go`), role per tenant memetakan ke permission. Scope dinamis (kelas binaan, jadwal yang diampu, gerbang yang dijaga) dievaluasi di service lewat `authz.Scope`.
- Setiap operasi OpenAPI wajib mendeklarasikan `x-permission`; CI gagal bila ada operasi tanpa deklarasi, kecuali yang ditandai `x-public: true` dengan alasan. Ini menutup lubang "master data tanpa permission check" pada kode lama.
- Cek otorisasi di dua tempat: middleware (permission) dan service (scope terhadap objek). Handler tidak pernah memeriksa role secara literal.
- Object-level authorization diuji otomatis: test matriks role x endpoint x objek milik tenant/kelas lain harus mengembalikan 403/404.
- Endpoint publik (verifikasi surat, OPAC, monitor TV) memakai token tampilan atau kode verifikasi HMAC, bukan tanpa auth sama sekali; monitor menampilkan data yang sudah dianonimkan sesuai setting sekolah.

## 4. Isolasi tenant

- `tenant_id` di setiap tabel operasional; RLS policy `USING (tenant_id = current_setting('app.tenant_id')::uuid)`; role DB aplikasi tidak `BYPASSRLS`.
- Resolusi tenant hanya dari host yang terdaftar (subdomain atau custom domain terverifikasi) atau dari klaim `tid` di token untuk mobile. Header bebas seperti `X-Tenant` tidak diterima tanpa token yang cocok, kecuali daftar rute pra-auth di bawah.
- Kunci cache Redis, nama objek S3, dan job River selalu diawali `tenant_id`.

### Pengecualian header `X-Tenant` pra-auth

`internal/platform/tenant/tenant.go` (`resolveMulti`) mencoba resolusi tenant dalam urutan: (1) host request lewat `Loader.GetByDomain` (custom domain terverifikasi), (2) slug dari subdomain `*.${BASE_DOMAIN}` lewat `Loader.GetBySlug`, lalu baru (3), hanya bila keduanya gagal dan path request diawali salah satu prefix di `headerAllowedPrefixes`, header `X-Tenant` (berisi slug) dipakai lewat `Loader.GetBySlug` juga. Di luar mode multi-tenant (mode `single`) header ini tidak pernah dibaca -- tenant tunggal di-resolve dari `Loader.GetSingle` untuk setiap request.

Prefix yang diizinkan saat ini (persis seperti di kode, jangan tambah tanpa memperbarui bagian ini):

| Prefix                | Alasan                                                                                                                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/v1/auth/login`      | Sebelum login berhasil, klien (khususnya mobile/web tanpa subdomain, mis. custom domain yang belum diarahkan atau app native yang belum tahu subdomain sekolahnya) belum punya token dengan klaim `tid`, sehingga satu-satunya cara memberi tahu API sekolah mana yang dituju adalah header eksplisit. |
| `/v1/tenant/branding` | Layar login menampilkan logo/nama/warna sekolah sebelum otentikasi; endpoint ini publik dan hanya mengembalikan data tampilan, bukan data pengguna.                                                                                                                                                    |
| `/v1/tenants/lookup`  | Dipakai klien untuk menerjemahkan input pengguna (mis. kode sekolah) menjadi slug/host tenant sebelum request lain dikirim; juga publik dan tanpa data pengguna.                                                                                                                                       |

Ini bukan pelemahan isolasi tenant: ketiga endpoint tersebut sudah didesain publik (`x-public: true` di OpenAPI, `security: []`, lihat bagian 3) dan tidak pernah mengembalikan data milik pengguna yang sudah diotentikasi -- header hanya memilih _tenant mana_ yang dilayani operasi publik itu, ia tidak pernah dipakai untuk keputusan otorisasi atau untuk menimpa `tid` dari token yang sudah tervalidasi (baris `authenticate()` di `internal/platform/auth/middleware.go` menolak request bila `tid` token tidak sama dengan tenant yang sudah diresolusi dari host). Header ini juga hanya fallback urutan terakhir -- host dan subdomain terdaftar tetap diutamakan -- sehingga rute yang sama tetap resolve dengan benar lewat host tanpa header sama sekali begitu klien tahu subdomainnya.

- Test integrasi: dua tenant di satu DB, setiap endpoint daftar dan detail dipastikan tidak bocor.
- Ekspor dan hapus data per tenant (offboarding) sebagai fitur, bukan skrip manual.

## 5. Data pribadi dan UU PDP

- Klasifikasi data: publik (nama sekolah), internal (jadwal), rahasia (NIK, alamat, kontak orang tua), sangat rahasia (catatan konseling, kesehatan). Kolom sangat rahasia dienkripsi di aplikasi (AES-256-GCM, kunci per tenant di KMS atau file kunci terpisah), hanya modul discipline yang punya akses dekripsi.
- Catatan konseling hanya bisa dibaca oleh BK yang menangani dan kepala sekolah bila diaktifkan; wali kelas melihat ringkasan tanpa isi.
- Minimisasi: tidak menyimpan data yang tidak dipakai fitur. Foto bukti izin dihapus otomatis setelah retensi (default 1 tahun ajaran + 1).
- Log aplikasi tidak memuat PII (nama, NIK, token); hanya ID.
- Persetujuan orang tua untuk akun siswa di bawah umur dicatat saat onboarding.
- Dokumen kebijakan privasi dan DPA template disediakan untuk sekolah (lihat roadmap).

## 6. File dan unggahan

- Semua unggahan ke object storage privat; akses lewat URL bertanda tangan berumur pendek (5 menit) yang diterbitkan setelah cek otorisasi. Tidak ada direktori `/uploads` publik.
- Validasi tipe lewat sniffing konten, bukan ekstensi; gambar di-decode ulang dan di-strip metadata EXIF (lokasi) sebelum disimpan; batas ukuran per jenis (avatar 2 MB, bukti 6 MB, import 10 MB).
- Nama objek acak (UUID), tidak menyertakan user ID atau nama.
- Pemindaian malware (ClamAV) untuk lampiran dokumen bila diaktifkan.

## 7. Keamanan HTTP dan aplikasi

- `http.Server` dengan `ReadHeaderTimeout 5s`, `ReadTimeout 15s`, `WriteTimeout 30s`, `IdleTimeout 60s`; batas body 1 MB default, per-route lebih besar untuk upload.
- Header: `Content-Security-Policy` ketat (nonce untuk script, `connect-src` hanya origin API dan WS sendiri), `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (kamera hanya untuk route scanner).
- CORS hanya untuk origin tenant terdaftar; mobile memakai bearer sehingga tidak butuh CORS.
- CSRF: cookie refresh `SameSite=Lax` + header `Origin` dicek pada endpoint refresh; API mutasi memakai bearer dari memori.
- Validasi input di dua lapis: skema OpenAPI (bentuk) dan domain (aturan). Semua query parameter bertipe.
- Injeksi SQL tidak mungkin lewat sqlc (parameter terikat); `gosec` di CI.
- Token QR dan gate: hash di DB, TTL pendek (30 detik untuk kelas, sampai akhir periode untuk gerbang), `purpose` terikat, konsumsi atomik dengan `UPDATE ... WHERE consumed_at IS NULL RETURNING`, job pembersihan.
- Nomor dokumen (surat izin, SP) dari sequence per tenant per tahun di DB, bukan `COUNT(*)+1`.
- Idempotency-Key untuk POST dari mobile (jaringan sekolah tidak stabil) disimpan 24 jam di Redis.

## 8. Rahasia dan konfigurasi

- Tidak ada nilai default untuk `JWT_SIGNING_KEY`, `DB_PASSWORD`, `APP_ORIGINS`, `S3_SECRET`; proses gagal start bila kosong.
- Kunci JWT ES256 dirotasi tiap 90 hari, JWKS internal dengan dua kunci aktif.
- Rahasia lewat env atau file (`*_FILE`) untuk Docker secrets; tidak pernah di repo. `gitleaks` di CI.
- Seeder demo hanya berjalan dengan flag eksplisit dan menolak berjalan bila `APP_ENV=production`.

## 9. Audit dan pemantauan

- Tabel `audit_logs` (append-only, partisi per bulan): siapa, sebagai siapa (impersonasi), tenant, aksi, objek, sebelum/sesudah (jsonb), IP, user agent. Semua mutasi pada data sensitif dan semua aksi admin tercatat.
- Peristiwa keamanan (login gagal beruntun, refresh token reuse, perubahan permission, ekspor data massal) memicu notifikasi ke admin sekolah.
- Sentry untuk error; alert Prometheus untuk lonjakan 401/403/5xx per tenant.
- Backup terenkripsi harian (pgBackRest ke S3) dengan uji restore bulanan otomatis; retensi 30 hari harian, 12 bulan bulanan.

## 10. Proses

- `security-review` pada setiap PR yang menyentuh auth, authz, upload, atau migrasi (skill tersedia di sesi Claude Code).
- Dependabot/Renovate mingguan; `govulncheck` dan `pnpm audit` di CI dengan gagal pada severity tinggi.
- Pengujian penetrasi internal sebelum onboarding sekolah ketiga; halaman `security.txt` dan alur pelaporan.
- Checklist rilis: header keamanan lolos Mozilla Observatory grade A, tidak ada endpoint tanpa `x-permission`, test isolasi tenant hijau.
