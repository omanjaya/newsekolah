# Lampiran D. Perbandingan logika SION dan newsekolah (sebelum perbaikan)

> Dokumen ini adalah potret keadaan pada 11 September 2026, sebelum pekerjaan paritas dimulai. Hampir semua celah dan regresi yang tercatat di sini sudah diperbaiki. Status terkini ada di [15. Paritas dengan SION](../15-paritas-sion.md). Simpan dokumen ini sebagai catatan asal-usul: ia menjelaskan mengapa sebuah aturan ditambahkan, dan berguna saat seseorang bertanya apakah suatu perilaku memang meniru SION.
>
> Cara membacanya: tiap fitur mencantumkan aturan di aplikasi lama, lalu status padanannya di kode baru saat itu (SAMA, LEBIH BAIK, SEBAGIAN, HILANG, BERBEDA), lengkap dengan rujukan berkas dan baris. Nomor baris merujuk kode pada tanggal di atas dan kemungkinan sudah bergeser.

Tanggal: 2026-09-11. Sumber lama: `reference/sion-rebuild-go/backend/cmd/api` (53 file, 30.657 baris, 303 route). Sumber baru: `apps/api/internal/modules` (22 modul, 53.278 baris, 449 operasi OpenAPI). Metode: delapan pemeriksaan paralel, tiap aturan bisnis lama dicari padanannya di service/domain/queries/migrasi baru, lalu diberi verdict per fitur. Rincian per fitur dengan rujukan file:baris ada di bagian 1 sampai 8 di bawah.

## Jawaban singkat

Belum 100% sama, dan tidak seragam "lebih bagus". Fondasinya jelas lebih kuat (multi-tenant + RLS, permission per route, workflow generik, penomoran surat atomik, verifikasi dokumen, notifikasi multi-channel, jenjang/promosi/kalender akademik yang dulu tidak ada). Tetapi banyak aturan detail yang dulu ada di handler lama belum dipindahkan, dan ada beberapa regresi nyata yang bisa merusak data atau membuka data.

| Verdict    | Jumlah fitur | Arti                                               |
| ---------- | ------------ | -------------------------------------------------- |
| LEBIH BAIK | 18           | Semua aturan lama tercakup dan ada perbaikan       |
| SAMA       | 2            | Setara                                             |
| SEBAGIAN   | 39           | Inti ada, sebagian aturan lama hilang atau berubah |
| HILANG     | 13           | Tidak ada padanan (11 di antaranya perpustakaan)   |

Per kelompok:

| Kelompok                                               | Lebih baik | Sama | Sebagian | Hilang | Catatan                                                                      |
| ------------------------------------------------------ | ---------- | ---- | -------- | ------ | ---------------------------------------------------------------------------- |
| Auth, sesi, role, settings, users                      | 3          | 1    | 6        | 1      | Keamanan naik kelas, tetapi import user hilang dan beberapa guard lama lepas |
| Master data akademik                                   | 10         | 0    | 4        | 0      | Kelompok paling matang; gap hanya validasi referensi                         |
| Presensi, jurnal, pengganti                            | 1          | 0    | 5        | 1      | Ada 2 bug wiring yang membuat fitur diam-diam tidak jalan                    |
| Izin, dispensasi, terlambat                            | 0          | 0    | 3        | 0      | Mesin alur lebih baik, laporan dan beberapa aturan lama hilang               |
| Disiplin, SP, konseling                                | 3          | 1    | 3        | 0      | SP dan konseling lebih aman; dokumen cetak belum ada                         |
| Penilaian, pengumuman, notifikasi, realtime, dashboard | 2          | 0    | 4        | 0      | Penilaian punya regresi semantik kenaikan rapor                              |
| Perpustakaan: sirkulasi, anggota, OPAC                 | 0          | 0    | 9        | 6      | Tidak ada entitas anggota; sirkulasi hanya inti                              |
| Perpustakaan: katalog, eksemplar, opname, laporan      | 0          | 0    | 5        | 5      | Nomor induk, import, laporan akreditasi hilang                               |

Perpustakaan adalah satu-satunya area yang mundur jauh dari referensi: 118 route lama menjadi 29 operasi. `docs/12-roadmap.md:114` menandainya "Selesai", padahal `docs/06-database-schema.md:246-248` masih merencanakan tabel anggota, jenis anggota, aturan pinjam, denda, dan kunjungan yang belum ada di migrasi.

## Regresi yang perlu diperbaiki lebih dulu

Ini bukan "fitur belum dibuat", melainkan kode yang ada tetapi salah atau membuka celah. Rujukan relatif ke `apps/api/internal/`.

1. Siswa terlambat yang alurnya belum selesai bisa dicatat hadir. `SaveEntries` tidak memanggil Blocker; hanya roster yang ditandai. `modules/attendance/service/entries.go:102-141`.
2. Event `attendance.submitted` dan `scheduling.substitution_*` dipublikasikan sebagai struct polos, sedangkan handler notifikasi menuntut `events.Envelope` dan nama event lain. Notifikasi alfa ke orang tua dan notifikasi guru pengganti tidak pernah terkirim. `modules/notifications/service/events.go:121-125`, `modules/scheduling/service/substitution.go:41,53`, `platform/events/names.go:13-14`.
3. Override nilai rapor manual hilang begitu ada recompute. `UpsertReportScore` menulis `final_score` hitungan sambil menyimpan `manual_score`. `modules/grading/queries/reports.sql:1-8`. Rumus kenaikan juga berubah dari `previous + increase` menjadi `raw + increase` dan selalu `max(final, previous)`. `modules/grading/domain/grading.go:135-147`.
4. Hapus komponen nilai ikut menghapus semua nilai siswa lewat `on delete cascade`, tanpa guard "sudah ada nilai". `modules/grading/service/gradebook.go:122-136`, `migrations/0057_grading.up.sql:33`.
5. Endpoint detail tanpa cek kepemilikan: `GET /v1/leave-requests/{id}`, `/v1/exit-permits/{id}`, `/v1/late-arrivals/{id}` hanya `authenticated`; `GetJournal` bisa dibaca siapa pun; `members/{userId}/loans` perpustakaan bisa dibaca siswa untuk user lain karena `view_library` diberikan ke siswa. `modules/permits/transport/http/handler.go:140-146,238-244,360-366`, `modules/scheduling/service/journal.go:59-70`, `platform/authz/role_defaults.go:36`.
6. `Gradebook`, `GiveStar`, `StarLedger` tidak memeriksa penugasan guru; siapa pun dengan `manage_grades` bisa membaca dan memberi bintang di kelas mana pun. `modules/grading/service/gradebook.go:38-57`, `service/reports.go:366-426`. `MyGrades.Stars` menjumlahkan event `visible_to_student=false`. `queries/reports.sql:58-60`.
7. Import Dapodik mencari role slug `siswa`, sedangkan seed memakai `student`; commit selalu gagal. `modules/school/service/dapodik.go:31,212-222` vs `platform/authz/role_defaults.go:34`.
8. Kedaluwarsa gate token izin keluar dan `from/to` pemaksaan presensi dihitung dengan `clock.Now()` UTC, bukan zona tenant. `modules/permits/service/exitpermit.go:190,264-266`, `service/rules.go:36`.
9. Realtime multi-replika: `watchRemote` mengirim ulang pesan proses sendiri tanpa dedupe source, klien menerima dua kali. `platform/realtime/hub.go:84-107`, `redis.go:28`. WebSocket tidak memeriksa revokasi sesi. `cmd/api/ws.go:41-65`.
10. Impersonasi: `RecordImpersonationAction` tidak dipanggil dari middleware (tabel `impersonation_actions` selalu kosong) dan impersonasi bersarang tidak dicegah. `modules/identity/service/impersonation.go:43-135`.
11. Perpustakaan: eksemplar `reserved` tidak bisa dipinjam pemesannya dan tidak ada job kedaluwarsa hold, sehingga eksemplar macet sampai reservasi dibatalkan manual. `modules/library/domain/library.go:93-98`, `service/reservations.go:37-46`. Opname menghitung eksemplar `withdrawn` sebagai expected, jadi buku yang sudah hilang selalu "missing" lagi, dan Close tidak mengubah status apa pun. `queries/library.sql:50-52`, `service/stocktake.go:97`.
12. Web push menerima endpoint URL sembarang (whitelist host FCM/Mozilla/Apple/WNS lama hilang), dan perangkat push tidak dihapus saat logout. `modules/notifications/transport/http/handler.go:173-196`, `modules/identity/service/auth.go:227-231`.
13. Username tidak dinormalisasi lowercase/trim saat login dan pembuatan user. `modules/identity/queries/users.sql:1-2`, `service/auth.go:63`.
14. Sesi: `last_seen_at` tidak pernah di-touch, tidak ada job retensi, dan cache sesi 60 detik tidak diinvalidasi saat ganti/reset password. `modules/identity/queries/sessions.sql:28-29`, `service/auth.go:290`.

## Aturan lama yang hilang tanpa keputusan tertulis

Tidak ditemukan di `docs/README.md`, `docs/11-feature-recommendations.md`, atau dokumen lain yang menyatakan fitur ini sengaja dibuang.

- Auth: setting per sekolah `auth.session_days` dan `auth.single_device`; guard "guru hanya dapat permission izin lewat tugas"; aturan role utama harus role sistem.
- Users: import user massal (domain `import.go` ada, tanpa endpoint); edit detail profil sendiri; ganti username.
- Settings: endpoint tulis branding dan unggah logo/favicon; `logo_url`/`favicon_url` selalu kosong.
- QR guru: pembatasan konsumsi ke siswa, alasan masuk, nama guru, event realtime ke guru.
- Presensi: pelanggaran per sesi; guru pemilik jadwal tidak bisa simpan setelah jam berakhir (dulu boleh sampai tenggat koreksi); status `A_SEBAGIAN` di rekap; detail per sesi di kalender siswa; presence online per role.
- Jurnal: cek penugasan mengajar saat tulis; filter dan pencarian; DOCX berkop.
- Izin: bukti wajib saat mengajukan (policy `permits.evidence_required` disebut di docs/02 tetapi tidak ada); placeholder `nis/address/homeroom_name/issuer_name` dan kop surat gambar; laporan DOCX izin keluar; antrean izin keluar untuk guru/BK/security; batas satu izin keluar per hari.
- Terlambat: `violation_ids` tidak divalidasi dan tidak ditulis ke disiplin; reviewer tidak dibatasi ke guru yang QR-nya discan.
- Disiplin: validasi siswa terdaftar saat mencatat pelanggaran; notifikasi BK saat ambang tercapai; laporan individu DOCX; tanggal pertama menembus ambang; daftar kandidat SP; pola nomor SP yang bisa diatur.
- Konseling: bukti foto (tabel ada, route tidak), laporan cetak, jenis topik.
- Penilaian: flag `modules.grading_enabled` tidak ditegakkan; pemetaan TP dan format ekspor e-Rapor T/R; `final_kktp`.
- Dashboard admin: user per jenis, antrean pending, online, histogram login.
- Perpustakaan: hampir seluruh lapisan anggota, denda, aturan pinjam bertingkat, hari kerja, nomor induk, master data, import koleksi, lookup ISBN eksternal, laporan akreditasi, laporan bulanan, dashboard, saklar modul.

## Yang jelas lebih baik dari referensi

- Identitas: Argon2id, access token ES256 15 menit + refresh berputar dengan deteksi reuse, MFA, passkey, SSO, rate limit lintas instance dengan trusted proxy, audit log setiap mutasi.
- Akademik: tahun ajaran + term + kalender + hari sekolah per tahun, jenjang/jurusan, promosi idempoten, arsip alih-alih hard delete, exclusion constraint GiST untuk bentrok jadwal, satu tabel tugas tambahan untuk guru dan pegawai dengan permission turunan yang dihitung per request.
- Alur izin: token QR sekali pakai berpurpose dan berkonteks, workflow tahapan yang bisa diatur per tenant, cancel/expiry dengan jejak event, presensi dipaksa hanya pada sesi yang tercakup izin, verifikasi dokumen publik tanpa membocorkan alasan.
- Disiplin: poin di-snapshot, void beralasan, level SP berpolicy N-level, nomor surat dari sequence, PDF tersimpan dengan kode verifikasi, konseling terenkripsi dengan visibilitas berjenjang.
- Notifikasi: preferensi per jenis dan channel, quiet hours, email digest, WhatsApp, FCM, River job dalam transaksi yang sama.
- Pengumuman: draft/terjadwal/terbit/arsip, audience per role/kelas/user, sanitasi HTML.
- Fitur baru tanpa padanan lama: presensi pegawai, billing, kegiatan, mentoring, supervisi, tamu, keluarga/orang tua, integrasi, laporan terjadwal, analitik siswa berisiko.

## Urutan yang saya sarankan

1. Perbaiki 14 regresi di atas; sebagian besar kecil (pemanggilan Blocker, nama event + Envelope, slug role, cek kepemilikan, query upsert rapor).
2. Putuskan nasib perpustakaan: kembalikan model anggota/denda/nomor induk sesuai `docs/06`, atau ubah `docs/12` supaya statusnya bukan "Selesai".
3. Tutup aturan lama yang hilang di presensi, izin, dan disiplin, karena ketiganya saling bergantung (terlambat menulis pelanggaran, izin menimpa presensi, pelanggaran memicu SP).
4. Sisanya (laporan DOCX, dashboard admin, pencarian, detail tampilan) bisa dijadwalkan per modul.

---

# Bagian 1

## Perbandingan logika: AUTH, SESSIONS, IMPERSONATION, ROLES, SETTINGS, USERS, QR, RATE LIMIT, REFRESH, APNS

Catatan umum: kode lama = `reference/sion-rebuild-go/backend/cmd/api/*`, kode baru = `apps/api/internal/...`. Semua nomor baris merujuk kode baru kecuali disebut "lama".

---

### Auth (login / me / logout)

- Referensi lama (`main.go:709-826`):
  - username `ToLower+TrimSpace`; bcrypt; hanya user `status='active'` (`findUser` filter `u.status='active'`, lama 1569-1590); bcrypt dummy untuk username tak dikenal.
  - Rate limit 10/15 menit per IP dan per username (in-memory).
  - Setting `auth.session_days` (1-365, default 1) dan `auth.single_device`; single device: set `active_session_id`, hapus semua push subscription user.
  - Web: satu JWT HS256 TTL `session_days` x 24 jam, tanpa refresh. Mobile (`client` ios/android): access 1 jam + refresh token.
  - Catat `user_login_events(user_id, role_id)`, `last_login_at`.
  - Respons `{token, user}` di body; logout null-kan `active_session_id`, hapus push subscription, cabut sesi (lama 817-826).
  - `withAuth` (lama 1447-1532): HS256 saja, user harus aktif, cek `active_session_id` bila single device, cek `user_sessions` valid, touch `last_seen_at`, cek impersonasi `ended_at`, catat `user_impersonation_actions`.
- Sekarang:
  - Normalisasi username lowercase/trim: **HILANG**. `service/auth.go:63` memanggil `GetUserByUsername` dengan input mentah; `queries/users.sql:1-2` `username = $2` exact match; `transport/http/auth.go:15-38` tidak trim/lower. Username `Budi` dan `budi` dianggap beda (unik per tenant, `migrations/0002_identity.up.sql:17`).
  - Hash password: **LEBIH BAIK** Argon2id (`platform/auth/password.go:17-23`), dummy verify untuk timing (`password.go:82-96`, dipakai `auth.go:65`).
  - Hanya user aktif: **SAMA** `auth.go:75-78` via `domain.CanAuthenticate` (`domain/user.go:36-38`), plus status `invited` ditolak. Catatan: pengecekan status dilakukan **setelah** verifikasi password, jadi user nonaktif dengan password benar mendapat `ErrAccountNotActive` yang dipetakan ke `INVALID_CREDENTIALS` (`handler.go:61-62`); efek luar sama.
  - `auth.session_days` / `auth.single_device`: **HILANG**. Tidak ada di kode maupun OpenAPI (grep `single_device|session_days` kosong di `internal/`, `migrations/`, `openapi/`). Hanya disebut sebagai contoh kunci di `docs/06-database-schema.md:41`. TTL jadi konfigurasi server global `ACCESS_TOKEN_TTL=15m`, `REFRESH_TOKEN_TTL=720h` (`platform/config/config.go:184-195`), bukan per sekolah.
  - Token: **BERBEDA (desain)**. Semua client dapat access token ES256 15 menit + refresh (`platform/auth/jwt.go:63-104`); web simpan refresh di cookie httpOnly `Path=/v1/auth` (`transport/http/auth.go:46-49`, `platform/httpx/cookie.go:14-25`), mobile terima `refresh_token` di body (`auth.go:189-203`). Claims: `sub, tid, sid, roles, act` (`jwt.go:24-33`).
  - Catat login: **LEBIH BAIK** `login_attempts` untuk sukses dan gagal (`auth.go:66,71,76,94`; gagal ditulis di transaksi terpisah `170-174`), `last_login_at` (`auth.go:96`).
  - Logout: **SEBAGIAN**. Cabut sesi saat ini + invalidasi cache (`auth.go:228-232`, `transport/http/auth.go:86-100`). Push device **tidak** dihapus saat logout (tidak ada hook di `modules/notifications`; grep `Logout` kosong) -- perangkat yang sudah logout tetap menerima push sampai client memanggil unregister atau TTL 180 hari.
  - Middleware: **LEBIH BAIK**. `platform/auth/middleware.go:141-197`: tolak algoritma selain ECDSA (`jwt.go:111-116`), cocokkan tenant token vs tenant request (`156-158`), cek sesi via cache 60 detik lalu DB (`160-173`), baca `act` untuk impersonasi (`187-194`). Middleware "soft": keputusan allow/deny di `authz.Authorize` (`platform/authz/identity.go:58-89`) berdasarkan `x-permission` OpenAPI.
  - MFA TOTP saat login (`auth.go:80-92`): **TAMBAHAN**.
- Tambahan di kode baru: MFA TOTP, passkey WebAuthn, SSO Google, reset password mandiri lewat email, `must_change_password`, API key auth (`middleware.go:71-115`), `tenant_id` di setiap claim.
- Verdict: **LEBIH BAIK** secara keamanan, tetapi dua aturan lama hilang tanpa dokumentasi: normalisasi username lowercase dan pengaturan sesi per sekolah (`session_days`, `single_device`).

---

### Sessions

- Referensi lama (`sessions.go`):
  - Tabel `user_sessions(kind, user_agent, ip, expires_at, revoked_at, last_seen_at, client, device_id, device_name, refresh_token_hash)`.
  - Cache validitas in-process 30 detik; `touch last_seen_at` maks tiap 5 menit (`sessions.go:65-78, 267-278`).
  - Maintenance tiap jam: hapus baris revoked/expired > 30 hari (`323-345`).
  - `GET /api/auth/sessions` daftar sesi aktif sendiri, urut `COALESCE(last_seen_at, created_at) DESC`, tandai `current` (`auth_refresh.go:158-197`).
  - `DELETE /api/auth/sessions/{id}`: 404 bila bukan milik sendiri (`sessions.go:420-443`).
  - Revoke semua sesi saat reset password admin (lama `main.go:2419`), revoke sesi lain saat ganti password profil (`main.go:2725-2733`).
- Sekarang:
  - Tabel `sessions` dengan `family_id`, `client`, `device_id/name`, `revoked_reason`, `actor_user_id` (`migrations/0002_identity.up.sql:310-338`): **LEBIH BAIK**.
  - Cache validitas: **LEBIH BAIK** (Redis/KV 60 detik, `platform/auth/sessioncache.go:11-50`, dibagi antar instance). Invalidate eksplisit hanya pada logout, revoke sesi sendiri, stop impersonasi (`transport/http/auth.go:96,148`, `admin_users.go:138`). **SEBAGIAN**: ganti password (`service/auth.go:290`), konfirmasi reset password (`password_reset.go:122`), dan deteksi reuse refresh (`auth.go:140-142`) mencabut di DB tanpa invalidasi cache -> token lama masih diterima sampai 60 detik.
  - `last_seen_at`: **HILANG**. Query `TouchSessionLastSeen` ada (`queries/sessions.sql:28-29`) tetapi tidak pernah dipanggil (grep `TouchSessionLastSeen` hanya di SQL/gen). Daftar sesi `order by last_seen_at desc` (`sessions.sql:23-26`) jadi tidak bermakna.
  - Maintenance/retensi sesi: **HILANG**. Tidak ada job periodik untuk `sessions` (grep `delete from sessions|PruneSessions` kosong; daftar periodic job di `cmd/api/wire.go:243-267` tidak memuat identity).
  - List sesi sendiri: **SAMA** `service/auth.go:234-242`, `transport/http/auth.go:102-136` (`is_current`).
  - Revoke sesi sendiri, 404 bila bukan milik: **SAMA** `service/auth.go:247-265`, dipetakan `ErrNotFound` (`auth.go:143-145`).
  - Revoke saat reset/ganti password: **SAMA** (`auth.go:290`, `password_reset.go:122`).
  - Single device (`active_session_id`): **HILANG** (lihat Auth).
- Tambahan: `revoked_reason`, keluarga sesi, `IsSessionActive` sekali query (`queries/session_active.sql:1-4`).
- Verdict: **SEBAGIAN** -- struktur lebih baik, tetapi `last_seen_at` tidak pernah diperbarui, tidak ada pembersihan baris sesi, dan invalidasi cache tidak lengkap.

---

### Impersonasi

- Referensi lama (`impersonation.go`):
  - Hanya `super_admin`/`admin`; tidak boleh bersarang (cek `ActorID` di claims); target aktif dan bukan diri sendiri; admin tidak boleh masuk sebagai super_admin; TTL 30 menit; sesi `kind=impersonation`; audit `user_impersonation_events` (ip, ua, expires) dan `user_impersonation_actions` per request (method, path, ip) dari `withAuth`; stop = set `ended_at` + revoke sesi + cache; `withAuth` tolak bila `ended_at` terisi (`IMPERSONATION_ENDED`).
- Sekarang:
  - Siapa boleh: **BERBEDA (lebih baik)**. Permission `impersonate_users` (`openapi/modules/identity-admin.yaml:144-145`, `platform/authz/permissions_identity_admin.go:12`); default masuk ke super_admin dan admin (`authz/role_defaults.go:18-19`).
  - Tidak boleh bersarang: **HILANG**. `service/impersonation.go:43-105` dan `transport/http/admin_users.go:108-128` tidak memeriksa `ActorIDFromContext`. Saat sedang impersonasi, `UserIDFromContext` = user target; bila target punya `impersonate_users`, impersonasi bertingkat dibuat dengan `actor_user_id` = user yang sedang di-impersonasi, sehingga jejak audit kehilangan admin asli.
  - Target aktif, bukan diri sendiri: **SAMA** `domain/impersonation.go:19-30`.
  - Admin vs super_admin: **LEBIH BAIK** (tidak ada siapa pun yang boleh impersonasi super_admin, `domain/impersonation.go:23-25`).
  - TTL 30 menit: **SAMA** `service/constants.go:16`, `impersonation.go:73`; sesi impersonasi tidak bisa di-refresh (`domain/session.go:73-75`, `service/auth.go:128-130`).
  - Audit mulai/stop: **SAMA** via `audit_logs` (`impersonation.go:102,123`); `audit.Record` otomatis mencatat `act` sebagai actor (`platform/audit/audit.go:49`).
  - Catat setiap request (`impersonation_actions`): **HILANG**. `Service.RecordImpersonationAction` (`impersonation.go:131-135`) dan `InsertImpersonationActionRecord` tidak dipanggil dari middleware mana pun (grep `RecordImpersonationAction(` di `apps/api` hanya definisi; `cmd/api/authz_middleware.go` tidak menyentuh `Actor`). Tabel `impersonation_actions` (`migrations/0002:427-442`) selalu kosong.
  - Stop: **LEBIH BAIK** -- revoke sesi + invalidasi cache seketika (`impersonation.go:111-125`, `admin_users.go:130-140`), tolak bila bukan sesi impersonasi (`ErrNotImpersonating`).
  - Tanda di UI: `Me.impersonated_by` (`service/me.go:76-82`, `transport/http/handler.go:137-144`): **TAMBAHAN**.
- Verdict: **SEBAGIAN** -- pencatatan aksi per request tidak terpasang dan larangan impersonasi bersarang hilang; sisanya setara atau lebih baik.

---

### Roles dan permission

- Referensi lama (`main.go:938-1040, 1357-1406, 1671-1818`):
  - Slug `a-z0-9_` 3-50, nama >= 3; role sistem (`super_admin, admin, guru, pegawai, siswa`) tidak bisa rename/hapus; hapus ditolak bila masih dipakai; permission super_admin tidak bisa diubah; role `guru` tidak boleh diberi `review_leave_requests`/`issue_leave_letters` manual dan keduanya disembunyikan dari daftar permission guru; permission tak dikenal 400; ganti permission DELETE+INSERT dalam transaksi; urut `FIELD(...)`.
  - Multi-role (`validateUserRoles` lama 2087-2119): role utama wajib role sistem; role tambahan hanya custom; hanya super_admin boleh memberi super_admin.
  - Permission turunan tugas dihitung tiap request: guru kehilangan dua permission izin lalu mendapat kembali hanya lewat `teacher_duty_assignments`; pegawai dengan `grants_exit_security` dapat `scan_exit_permits` (`employee_duties.go:36-57`).
  - Katalog 33 permission (`internal/rbac/rbac.go:43-77`).
- Sekarang:
  - Slug: **SEBAGIAN** -- `^[a-z0-9_]{2,50}$` (`domain/role.go:5-14`), min 2 bukan 3; nama 1-150 via OpenAPI (`identity-admin.yaml:1030`), bukan >= 3. Slug dikirim client, bukan diturunkan dari nama.
  - Role sistem tidak bisa rename/hapus: **SAMA** `domain/role.go:21-38`, `service/roles_admin.go:114-161`.
  - Hapus ditolak bila dipakai: **SAMA** `roles_admin.go:148-155`.
  - Permission super_admin tetap penuh: **LEBIH BAIK** -- dipaksa `authz.Codes()` (`roles_admin.go:202-205`) alih-alih menolak.
  - Larangan permission izin untuk guru: **HILANG**. `ReplaceRolePermissions` (`roles_admin.go:183-223`) tidak punya pengecualian; `ListRoles` tidak menyembunyikan apa pun. Model baru memang "role union duty" (`platform/authz/scope.go:36-42`, `docs/06` bagian 3), tetapi guard lama yang memaksa dua permission itu hanya lewat tugas tidak ada penggantinya.
  - Permission tak dikenal: **SAMA** `roles_admin.go:184-189`.
  - Ganti permission dalam transaksi: **SAMA** (`withTx`, 192-222).
  - Urutan: **BERBEDA (kecil)** `order by is_system desc, name` (`queries/roles_admin.sql:1-2`).
  - Validasi role user: **SEBAGIAN**. Tepat satu primary dan hanya super_admin boleh memberi super_admin (`domain/user_admin.go:93-111`). Aturan "primary harus role sistem, tambahan harus custom" **HILANG**.
  - Permission turunan tugas: **LEBIH BAIK/BERBEDA** -- generik lewat `duty_types` + `duty_permissions` + `duty_assignments` dengan scope school/class/student (`queries/session_active.sql:6-18`, `service/service.go:225-249`, `authz/scope.go`), dibatasi `starts_on/ends_on`, dan tahun ajaran aktif. Tidak lagi hardcoded `grants_leave_homeroom_review`/`grants_exit_security`.
  - Katalog: **BERBEDA**. `platform/authz/permissions.go:15-115` + `init()` per modul; disinkron ke DB tiap migrate (`platform/migrator/migrator.go:64-72`) dan default role ditambah secara aditif (`78-110`). Kode perpustakaan berubah (`circulate_library` -> `manage_library_circulation`, `view_own_library_loans` hilang, `view_library` baru). `can_supervise` masih ada dan masih tidak dipakai (`permissions.go:46,99`).
  - Role sistem: 7 (`super_admin, admin, teacher, staff, student, parent, librarian`) dengan slug Inggris (`role_defaults.go:15-47`), bukan `guru/pegawai/siswa`.
- Tambahan: `view_audit_logs`, `impersonate_users`, hitung user per role, audit setiap mutasi role, katalog dikelompokkan.
- Verdict: **SEBAGIAN** -- CRUD role setara/lebih baik, tetapi guard "permission izin guru hanya dari tugas" dan aturan komposisi role (sistem vs custom) hilang.

---

### Settings dan branding

- Referensi lama (`main.go:1041-1355`): `GET /settings/branding` dan `/settings/modules` publik; `GET/PUT /settings/general` (`manage_settings`) dengan 14 kunci (nama, subtitle, logo, favicon, header surat, 2 template surat, hari aktif, session_days, single_device, deadline jadwal, correction_days, grading_enabled, token monitoring); upload logo/favicon data URI WebP dengan cek magic `RIFF..WEBP` dan batas 2 MB/512 KB/700 KB; upsert dalam satu transaksi.
- Sekarang:
  - Branding publik: **SEBAGIAN**. `GET /v1/tenant/branding` `x-public` (`openapi/modules/tenant.yaml:6-7`); `school/service/service.go:84-125` mengisi `name, short_name, tagline, accent_color` dari `tenant_settings` prefix `branding.*` dan `product_name` dari `platform_settings`. `LogoURL`/`FaviconURL` ada di domain (`school/domain/school.go:17-18`) dan dipetakan handler (`school/transport/http/handler.go:84-89`) tetapi **tidak pernah diisi** oleh service -> selalu kosong.
  - PUT pengaturan umum / upload logo & favicon: **HILANG**. Tidak ada endpoint tulis branding; `UpsertTenantSetting` hanya dipakai notifikasi (`notifications/repository/preferences.go:77`). Yang ada hanya `updateSchoolProfile` (nama, jenjang, zona waktu, locale; `tenant.yaml:70-71`).
  - Validasi WebP/data URI: **HILANG** (tidak ada upload branding).
  - `modules.grading_enabled`/`library_enabled`: **BERBEDA** -- diganti flag modul per tenant di konsol platform (`openapi/modules/platform.yaml:132-155`, `modules/platform/service/flags.go`), bukan setting sekolah.
  - `auth.session_days`, `auth.single_device`: **HILANG** (lihat Auth).
  - `school.active_until_day`, `attendance.correction_days`, `schedule.teacher_edit_deadline`, template surat: di luar grup ini (attendance/scheduling/permits/discipline); dari sisi settings umum, endpoint terpusatnya **tidak ditemukan** di OpenAPI (hanya `getNotificationSettings`, `setWhatsAppProviderConfig`, `setGoogleSSOConfig`).
- Tambahan: `tenant_settings` per tenant dengan RLS (`migrations/0001:65-81`), `accent_color`, `product_name` platform-wide.
- Verdict: **SEBAGIAN** -- pembacaan branding ada, tetapi tidak ada cara mengubah branding dari API dan logo/favicon tidak pernah terisi.

---

### Users, profil, import

- Referensi lama (`main.go:2004-2450, 2664-2890`, `user_import.go`):
  - Semua operasi di-scope tahun ajaran aktif via `academic_year_users` (user di luar tahun = 404); ID `user-<timestamp>`; list `page/page_size` (maks 100), cari `name/username/email`, filter role & status; create wajib nama/username/email/password, username & email lowercase; update bisa ganti username/email; arsip -> `status='inactive'`, tidak bisa arsip diri sendiri; restore; detail: `user_details` + salah satu student/teacher/employee dengan DELETE tiga tabel lalu INSERT, admin & pegawai ke `employee_details`; `GET details` boleh diri sendiri atau `view_users`; reset password menghasilkan 12 karakter plaintext + revoke semua sesi.
  - Profil: ganti nama/username/email/password (tanpa password lama), detail sesuai role, cek unik username/email; avatar multipart <= 2 MB, konversi `cwebp`, nama `avatar_<userID>.webp` publik.
  - Import: JSON rows (XLSX diparse di frontend), maks 5.000, template XLSX 33 kolom dengan sheet referensi, validasi unik username/email di file & DB, gender L/P, golongan darah, tanggal lahir, alias role, commit satu transaksi, role di-reset ke satu role utama.
- Sekarang:
  - Scope tahun ajaran: **HILANG (disengaja)**. Tidak ada `academic_year_users`; `user_roles.academic_year_id` ada di skema (`migrations/0002:219-230`) tetapi `AssignUserRoleRecord` tidak mengisinya (`repository/repository_users.go:206-210`).
  - ID: **LEBIH BAIK** UUID; username otomatis dari nama bila kosong (`domain/user_admin.go:41-80`, `service/users_admin_helpers.go:17-48`).
  - List: **SEBAGIAN**. Cursor pagination maks 100 (`service/users_admin_types.go:99-110`), cari `name/username/nis/nip` (`queries/users_admin.sql:16-26`) -- pencarian email hilang; filter role/status/profile_kind/include_archived.
  - Create: **LEBIH BAIK**. Password opsional -> acak + `must_change_password` (`users_admin_write.go:38-55`, `users_admin_helpers.go:75-90`), kebijakan panjang 8-128 (`domain/user.go:50-58`), cek unik username/email (`helpers.go:17-27, 58-70`). Tidak ada normalisasi lowercase/trim username & email (grep `ToLower|TrimSpace` di `admin_convert.go`, `users_admin_write.go` kosong) -- **BERBEDA**.
  - Update: **BERBEDA** -- username tidak bisa diubah (`users_admin_types.go:79-82`, `UpdateUserBasic` `users_admin.sql:55-58`); email bisa; role hanya diganti bila `roles` dikirim (`users_admin_write.go:113-124`).
  - Arsip/restore: **LEBIH BAIK** soft delete `status='inactive' + deleted_at` (`users_admin.sql:63-67`); larangan arsip diri sendiri **SAMA** (`domain/user_admin.go:117-122`).
  - Detail per jenis: **LEBIH BAIK** upsert (`users_admin_helpers.go:94-113`, `users_admin.sql:69-113`), jenis `student/teacher/staff/parent`; admin dan pegawai sama-sama `staff` (setara lama).
  - `GET details` diri sendiri: **SEBAGIAN**. `getUser` hanya `view_users` (`identity-admin.yaml:55-56`); diri sendiri lewat `GET /v1/me` yang tidak memuat NIK/alamat/NIS dst. (`service/me.go:108-118`).
  - Reset password admin: **LEBIH BAIK (per docs/08)** -- token set-password 30 menit, hash SHA-256 disimpan (`users_admin_write.go:173-197`), bukan password plaintext; sesi dicabut saat konfirmasi (`password_reset.go:122`).
  - Profil sendiri: **SEBAGIAN**. Hanya nama/email/phone/locale (`service/profile_admin.go:55-82`); ganti username **HILANG**; edit detail (NIK, alamat, data siswa/guru) oleh pemilik **HILANG**; ganti password lewat endpoint terpisah yang mewajibkan password lama dan mencabut sesi lain (`service/auth.go:269-292`) -- **LEBIH BAIK**.
  - Avatar: **LEBIH BAIK** presigned PUT ke S3, key acak per tenant, sniff tipe konten, batas 2 MB, catat `assets` (`profile_admin.go:96-168`). Konversi WebP **HILANG** (disengaja, `docs/09-tech-stack.md:105` menargetkan library Go murni, belum ada); strip EXIF (`docs/08:54`) **tidak ditemukan**.
  - Import user: **HILANG**. `domain/import.go` (ImportRow, `ValidateImportRow` 79-107) ada tetapi tidak dipakai service/transport/OpenAPI mana pun (grep `ValidateImportRow|ImportRow` hanya definisi). Tidak ada preview/commit/template. Pengganti parsial: import CSV Dapodik siswa saja (`tenant.yaml:132-155`, `school/service/dapodik.go`) -- **bug**: mencari role slug `"siswa"` (`dapodik.go:31, 212-222`) sedangkan role sistem diseed dengan slug `"student"` (`authz/role_defaults.go:34`, `cmd/seed/main.go:67`), sehingga commit gagal `role "siswa" not found` kecuali ada role custom bernama itu.
- Tambahan: audit sebelum/sesudah tiap mutasi (`users_admin.go:187-209`), `locale`, `phone` unik, direktori user, tautan orang tua-anak, MFA, passkey.
- Verdict: **SEBAGIAN** -- CRUD user lebih rapi dan aman, tetapi import user tidak ada (dan penggantinya untuk siswa memakai slug role yang salah), profil sendiri kehilangan edit detail/username, dan normalisasi username/email hilang.

---

### QR guru (masuk kelas)

- Referensi lama (`main.go:2892-2989`): hanya `guru` boleh buat; token acak 32 char, hash SHA-256, TTL 30 detik; hanya `siswa` boleh konsumsi; `reason` <= 500, default "Izin masuk kelas"; konsumsi atomik `UPDATE ... consumed_at IS NULL AND expires_at > now`, 410 bila gagal; respons `teacher_name`; WS `classroom_entry_scanned` ke guru (nama siswa, NIS, kelas, alasan). Token yang sama dipakai untuk izin keluar dan terlambat (tanpa purpose).
- Sekarang (`modules/permits`):
  - Pembuatan: **BERBEDA** -- permission `issue_scan_tokens` (`openapi/modules/permits.yaml:5-6`), default guru dan pegawai (`role_defaults.go:23,28`); 32 byte acak base64url, hash SHA-256 (`service/scantoken.go:33-62`); TTL 30 detik (`domain/scantoken.go:43-59`).
  - Purpose terikat: **LEBIH BAIK (disengaja, `docs/11-feature-recommendations.md:61`)** -- `purpose` + `context_id` dicek saat konsumsi (`service/scantoken.go:84-108`).
  - Konsumsi atomik sekali pakai: **SAMA** (`scantoken.go:90-99`, `ErrTokenNotFound` bila sudah dipakai/kedaluwarsa).
  - Hanya siswa yang boleh konsumsi: **HILANG** -- `scanClassroomEntry` `x-permission: authenticated` (`permits.yaml:34-35`), tanpa cek role/profil (`transport/http/handler.go:53-61`).
  - `reason` <= 500 / default: **HILANG** (request hanya `token`).
  - Respons nama guru + event realtime `classroom_entry_scanned` dengan NIS/kelas: **HILANG** -- respons hanya `teacher_user_id, scanned_at` (`handler.go:60`); tidak ada publikasi event.
  - Pembersihan token kedaluwarsa: **TAMBAHAN** job harian (`scantoken.go:119-138`).
- Verdict: **SEBAGIAN** -- primitif token lebih aman, tetapi alur "guru lihat siapa yang masuk" (alasan, nama, notifikasi realtime) belum ada.

---

### Rate limit

- Referensi lama (`ratelimit.go`): sliding window in-memory 10 percobaan/15 menit per IP dan per username, hanya di login; IP dari `X-Forwarded-For` tanpa trusted proxy; bcrypt dummy.
- Sekarang:
  - Login 5/15 menit per akun (per tenant) dan 20/15 menit per IP (`platform/auth/ratelimit.go:19-45`), sesuai `docs/08-security.md:19`: **BERBEDA (lebih ketat per akun, lebih longgar per IP)**.
  - Penyimpanan: **LEBIH BAIK** KVStore Redis/memori (`platform/auth/kvstore.go`), berlaku lintas instance. Model fixed-window `INCR+TTL`, bukan sliding -- **BERBEDA (kecil)**; selalu increment sehingga hammering memperpanjang blokir (`ratelimit.go:28-30`).
  - IP: **LEBIH BAIK** `RealIP` hanya percaya `X-Forwarded-For` dari `TRUSTED_PROXIES` (`platform/httpx/middleware.go:15-60`, `router.go:28`, `config.go:175`).
  - Timing-safe untuk username tak dikenal: **SAMA** (`password.go:82-96`, `auth.go:65`).
  - Kode error `RATE_LIMITED`: **SAMA** (`transport/http/handler.go:59-60`).
- Tambahan: limiter IP untuk permintaan reset password (`ratelimit_ip.go`, `password_reset.go:39-47`), limiter per API key (`ratelimit_apikey.go`), batas body global 1 MiB (`config.go:177`) vs 32 MB lama, timeout request 30 detik (`router.go:31`).
- Verdict: **LEBIH BAIK**.

---

### Auth refresh

- Referensi lama (`auth_refresh.go`, `sessions.go:353-417`): hanya mobile; refresh token 48 char alfanumerik, hash SHA-256; access 1 jam; refresh TTL `max(session_days, 30)` hari; rotasi atomik `WHERE refresh_token_hash = old`; rotasi memperpanjang `expires_at`; user harus aktif; tanpa deteksi reuse; tanpa cookie; batas body 8 KB.
- Sekarang:
  - Berlaku web (cookie) dan mobile (body): **LEBIH BAIK** (`transport/http/auth.go:53-84`, `identity.yaml:43-44`).
  - Token 256-bit + hash SHA-256: **SAMA/LEBIH BAIK** (`platform/auth/refresh.go:13-25`).
  - Rotasi: **LEBIH BAIK** -- sesi lama dicabut `rotated`, sesi baru dalam `family_id` yang sama (`service/auth.go:153-157`); reuse token lama mencabut seluruh keluarga (`domain/session.go:58-66`, `auth.go:132-143`, ditulis di transaksi terpisah agar tetap commit).
  - Sesi impersonasi tidak bisa refresh: **LEBIH BAIK** (`auth.go:128-130`).
  - TTL: **BERBEDA** -- `REFRESH_TOKEN_TTL` global 30 hari (`config.go:191`), tidak mengikuti setting sekolah; access 15 menit untuk semua client.
  - User harus aktif saat refresh: **SEBAGIAN** -- `GetUserByID` hanya memfilter `deleted_at is null` (`queries/users.sql:4-5`), tidak `status`; user yang di-`SetUserStatus('inactive')` tanpa arsip tetap bisa refresh (`auth.go:148-151`). Arsip normal mengisi `deleted_at`, jadi jalur utama aman.
  - Cek header `Origin` pada refresh (`docs/08:63`): **tidak ditemukan** di `httpx/cookie.go` maupun `transport/http/auth.go`.
- Verdict: **LEBIH BAIK** -- model rotasi + deteksi reuse jauh lebih kuat; sisa gap kecil (status user, Origin).

---

### APNS / registrasi perangkat push

- Referensi lama (`apns.go`): klien HTTP/2 sendiri, provider token ES256 di-cache 50 menit; env `APNS_TEAM_ID/KEY_ID/BUNDLE_ID/ENV/PRIVATE_KEY[_PATH]`; alasan `BadDeviceToken/Unregistered/ExpiredToken` atau HTTP 410 -> hapus subscription; payload `aps.alert/sound/badge` + `href/type/id`; `POST /api/push/device-tokens`: platform wajib `ios`, token <= 255, 503 bila APNs belum dikonfigurasi, `device_name` fallback User-Agent, expiry = exp JWT min 180 hari, upsert reset `failure_count`; `DELETE` per token.
- Sekarang:
  - Klien: **SAMA (library)** `sideshow/apns2` token client, sandbox/production (`platform/notify/apns.go:35-54`); caching provider token ditangani library.
  - Token permanen tidak valid: **SEBAGIAN** -- hanya `Unregistered` dan `BadDeviceToken` -> `ErrDeviceGone` lalu perangkat dihapus (`apns.go:74-76`, `notifications/service/deliveries.go:28-32`); `ExpiredToken` tidak dipetakan, hanya menaikkan `failure_count` dan dibersihkan setelah 5 gagal (`domain/push_device.go:43`, `queries/push_devices.sql:36-39`).
  - Payload: **SEBAGIAN** -- `aps.alert/sound` + `href` + `data` (`apns.go:56-68`); `badge` **HILANG** (grep `badge` di notify/notifications kosong).
  - Registrasi: **LEBIH BAIK** satu endpoint `platform web/ios/android` (`notifications/transport/http/handler.go:173-196`, `domain/push_device.go:9-25`), TTL 180 hari tetap (`service/push_devices.go:15,24`), upsert per `endpoint_hash` reset `failure_count` (`push_devices.sql:1-13`). Cek "APNs belum dikonfigurasi" (503) **HILANG**; fallback `device_name` dari UA **HILANG**; batas panjang token 255 **tidak ditemukan** di handler.
  - Unregister per token: **SAMA** (`handler.go:198-203`, `push_devices.sql:15-16`).
  - Hapus push device saat logout/single-device: **HILANG** (lihat Auth).
- Tambahan: FCM Android, daftar perangkat sendiri, job pemangkasan perangkat kedaluwarsa/gagal.
- Verdict: **SAMA** secara fungsi inti (daftar, kirim, buang token mati), dengan celah kecil (badge, ExpiredToken, 503 saat belum dikonfigurasi).

---

## Ringkasan

| Fitur                  | Verdict    | Gap terpenting                                                                                                                                             |
| ---------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth (login/me/logout) | LEBIH BAIK | Username tidak dinormalisasi lowercase (`users.sql:1-2`); setting sesi per sekolah (`session_days`, `single_device`) hilang tanpa catatan di docs          |
| Sessions               | SEBAGIAN   | `last_seen_at` tidak pernah di-touch dan tidak ada job retensi sesi; cache 60 detik tidak diinvalidasi saat ganti/reset password                           |
| Impersonasi            | SEBAGIAN   | `RecordImpersonationAction` tidak dipanggil dari middleware (tabel `impersonation_actions` selalu kosong); impersonasi bersarang tidak dicegah             |
| Roles/permission       | SEBAGIAN   | Guard "permission izin guru hanya lewat tugas" dan aturan role sistem-vs-custom pada user hilang                                                           |
| Settings/branding      | SEBAGIAN   | Tidak ada endpoint tulis branding/pengaturan umum; `logo_url`/`favicon_url` tidak pernah diisi (`school/service/service.go:84-125`)                        |
| Users/profil           | SEBAGIAN   | Profil sendiri tidak bisa edit detail/username; tidak ada normalisasi username/email; `Me` tidak memuat detail                                             |
| User import            | HILANG     | `domain/import.go` mati (tidak ada endpoint); pengganti Dapodik mencari role `"siswa"` padahal seed `"student"` (`dapodik.go:31` vs `role_defaults.go:34`) |
| QR guru                | SEBAGIAN   | Konsumsi tidak dibatasi siswa, tanpa `reason`, tanpa nama guru dan event realtime `classroom_entry_scanned`                                                |
| Rate limit             | LEBIH BAIK | Fixed window vs sliding (kecil); ambang per IP 20 vs 10 lama                                                                                               |
| Auth refresh           | LEBIH BAIK | Refresh tidak mengecek `users.status`, hanya `deleted_at` (`users.sql:4-5`); cek `Origin` per docs/08 tidak ditemukan                                      |
| APNS / device push     | SAMA       | `badge` hilang; `ExpiredToken` tidak dianggap token mati; tidak ada 503 bila APNs belum dikonfigurasi                                                      |

---

# Bagian 2

## Catatan umum (berlaku untuk semua fitur)

- Lama: semua entitas di-scope ke tahun ajaran aktif (`requireActiveAcademicYear`, academic_scope.go:43-54, 409 bila tidak ada). Baru: `academic_year_id` eksplisit sebagai parameter/field di setiap endpoint (mis. class.go:14, teaching.go:13, scheduling ScheduleInput.AcademicYearID). LEBIH BAIK (bisa menyiapkan tahun depan), tetapi tidak ada guard apa pun yang menolak mutasi kelas/jadwal/enrollment pada tahun yang sudah `archived_at` (hanya `AcademicUpdateYear` yang mengecek, academic_years.sql:7-10).
- `academic_year_users` dihapus dengan sengaja (docs/06-database-schema.md:322); keanggotaan diturunkan dari enrollment/teaching/duty.
- Guard lama `manage_master_data` untuk hampir semua mutasi; baru dipecah: `manage_academic_years`, `manage_master_data`, `manage_enrollments`, `manage_teaching_assignments`, `view_academic_data` (openapi/modules/academic.yaml:5-1598, authz/permissions_academic.go:8-11). LEBIH BAIK.
- Ada dua service yang menulis `academic_years`: `modules/school/service/academic_year.go` (Create/Activate tanpa cek arsip, tanpa seeding term) dan `modules/academic/service/academic_year.go`. Duplikasi jalur tulis; hanya yang di academic yang terpasang ke HTTP.

### Tahun ajaran dan semester

- Referensi lama:
  - `year_label` + `semester` wajib, semester hanya `ganjil|genap`, unik gabungan (main.go:2509-2543).
  - Update tidak boleh mengubah `is_active` (main.go:2545-2585).
  - Activate: nonaktifkan semua, aktifkan satu, `INSERT IGNORE academic_year_users` semua user, dalam transaksi (main.go:2587-2636).
  - Delete: hard delete cascade seluruh data (main.go:2638-2655).
  - List: search label, page_size<=100, order created_at desc (main.go:2451-2507). Guard: create/update/activate/delete `manage_master_data`.
- Sekarang:
  - Label unik per tenant (<=20) + `starts_on < ends_on` (0003_academic.up.sql:1-11; domain ValidatePeriod academic_year.go:31-36). BERBEDA: semester tidak lagi kolom tahun ajaran tetapi tabel `terms` yang di-seed otomatis 2 semester (atau N dari policy `calendar.terms`) saat create (service/academic_year.go:60-100, BuildDefaultTerms domain:56-86). LEBIH BAIK.
  - Satu tahun aktif dijamin DB (`ux_active_year`, 0003:13) + service deactivate-all lalu activate (service:142-156). SAMA + lebih kuat. Tahun terarsip tidak bisa diaktifkan (service:148-150).
  - `academic_year_users` tidak lagi diisi: HILANG dengan sengaja (docs/06:322).
  - Hard delete HILANG, diganti arsip (`ArchiveYear`, service:162-173; 0010_academic_year_archive). LEBIH BAIK (tidak ada cascade destruktif).
  - Bug kecil: `UpdateAcademicYear` hanya memetakan unique violation (service:102-113); update pada id tak ada/terarsip (`where archived_at is null`, academic_years.sql:7-10) menghasilkan `pgx.ErrNoRows` yang jatuh ke `httpx.Internal` (transport handler.go:119-143), bukan 404/409.
- Tambahan: terms CRUD + activate satu term per tahun (service:185-229); kalender akademik dengan rentang tanggal, kind holiday/exam/event/no_school/semester_break, scoping per jenjang (domain/calendar.go:43-83, 0060); `school_days` per tahun (service:312-329); `IsSchoolDay` sebagai reader untuk modul lain (readers.go:44-46); setup tahun baru salin offering dan kelas (new_year.go).
- Verdict: LEBIH BAIK. Model tahun+semester+kalender jauh lebih lengkap; yang hilang (hard delete, academic_year_users) disengaja.

### Jenjang (grade levels) dan jurusan (tracks)

- Referensi lama: tidak ada entitas ini (nama kelas bebas).
- Sekarang: `grade_levels` (code unik per tenant, sequence) dan `tracks`; template SD/SMP/SMA/SMK idempoten (domain/grade_level.go:38-74, service/grade_level.go:79-99); hapus ditolak jika masih dipakai kelas (service:61-72, 131-141).
- Verdict: LEBIH BAIK (fitur baru, prasyarat promosi).

### Kelas

- Referensi lama: nama wajib, <=150, unik per tahun aktif, hard delete tanpa cek dependensi, page_size<=100, search LIKE (academic_scope.go:478-571).
- Sekarang:
  - Unik `(academic_year_id, name)` di DB (0003:142), dipetakan ke `ACADEMIC_CLASS_NAME_EXISTS` (service/class.go:35-43). SAMA. Catatan: unique index tidak mengecualikan baris soft-deleted, jadi nama kelas yang sudah dihapus tidak bisa dibuat ulang di tahun yang sama.
  - Panjang nama <=100 (0003:135) vs lama 150. BERBEDA (kecil).
  - Delete: soft delete, ditolak bila ada enrollment aktif atau teaching assignment (service:81-96). LEBIH BAIK.
  - Kelas wajib punya `grade_level_id`; opsional track, room, capacity, `homeroom_teacher_id` (0003:129-143). Tambahan.
  - `homeroom_teacher_id` di kelas TIDAK disinkronkan dengan duty `homeroom` (tidak ada kode yang menulis keduanya selain cmd/seed/operations.go:213-224). Attendance dan permits membaca duty (lihat Kelas binaan), permits juga membaca kolom ini (permits/queries/cross_module.sql:12). Dua sumber kebenaran.
- Verdict: LEBIH BAIK, dengan catatan sinkronisasi wali kelas.

### Mata pelajaran

- Referensi lama: nama wajib <=150, unik per tahun aktif, hard delete (academic_scope.go:123-216).
- Sekarang: `code` (<=20) unik per tenant + `name` <=150 (0003:186-195; spec maxLength academic.yaml:2251-2256); katalog tenant-wide, bukan per tahun. BERBEDA (disengaja, docs/06). Per-tahun dimodelkan lewat `subject_offerings` (year, subject, grade_level, hours_per_week). Soft delete ditolak bila masih ada offering/teaching assignment (service/subject.go:70-85). LEBIH BAIK.
- Catatan: uniqueness sekarang pada `code`, bukan `name`; dua mapel beda kode dengan nama sama diizinkan (lama tidak).
- Verdict: LEBIH BAIK.

### Ruang belajar

- Referensi lama: nama <=150 unik per tahun, hard delete (academic_scope.go:240-393).
- Sekarang: code unik per tenant, name <=100, capacity >=0 (0003:104-114); soft delete ditolak bila masih dipakai kelas (service/subject.go:160-170). Ruang belum dipakai untuk cek bentrok jadwal (sama seperti lama: "tanpa bentrok ruangan").
- Verdict: LEBIH BAIK.

### Periode / jam pelajaran dan aturan hari

- Referensi lama:
  - Periode per tahun: nama <=150, `sort_order >= 1` unik, `start < end` (format HH:MM), `is_active` default true (academic_scope.go:1932-1956, 1989-1999).
  - Override per (tahun, hari, periode) unik, mode `normal|friday_short|advanced|custom`, jam efektif start<end, hari menerima Inggris/Indonesia (1958-2029).
  - Hari aktif sekolah dari setting `school.active_until_day` (teaching_schedules.go:96-107).
- Sekarang:
  - `period_templates` (tenant) -> `periods` (sequence >0 unik per template, `starts_at < ends_at` di DB 0003:252-263 dan domain period.go:40-45, `is_break`) -> `period_day_assignments` (tahun, hari 1-7 -> template) (0003:275-281; service/period.go:111-135, 153-162). Override per hari digantikan template per hari (docs/06:324). BERBEDA (disengaja), LEBIH BAIK secara model.
  - `is_default` satu per tenant dijaga aplikasi, bukan DB (service:45-73).
  - Hari aktif: `school_days` per tahun (service/academic_year.go:322-329) menggantikan `active_until_day`. LEBIH BAIK (hari tidak harus kontigu).
  - Normalisasi nama hari Indonesia HILANG (hari sekarang integer 1-7; validasi domain/period.go:68-73).
  - `is_active` periode HILANG; `is_break` ada tetapi penjadwalan tidak menolak periode istirahat (scheduling resolveCandidate tidak melihatnya).
  - Hapus template ditolak bila masih dipakai hari (service:78-89); hapus periode tidak memetakan FK restrict dari `schedules` -> 500 alih-alih 409 (service:137-141).
- Tambahan: `PeriodsToday` (periode yang sedang berjalan, timezone tenant) (service:170-188, transport period.go:127-138).
- Verdict: LEBIH BAIK, dengan dua celah kecil (periode istirahat tidak ditolak, FK restrict tidak dipetakan).

### Siswa per kelas (enrollment, pindah, promosi/kelulusan)

- Referensi lama:
  - List: filter class_id, search nama/username/email/NIS/NISN, page<=100 (student_classes.go:86-146). Unassigned: role siswa aktif di tahun aktif, tanpa penempatan, LIMIT 100 (148-191).
  - Bulk assign: kelas dan siswa wajib, kelas harus di tahun aktif, siswa harus role siswa aktif + anggota tahun; upsert `status active, joined_at COALESCE, left_at NULL` -> siswa yang sudah punya kelas dipindah diam-diam (193-236).
  - Remove: hard delete penempatan (238-254).
  - Import: identitas via id/username/NIS (505-523), kelas via nama, duplikat dalam file ditolak, `move` butuh flag `move_existing_class`, commit ditolak seluruhnya bila ada baris invalid (427-489, 270-324). Template xlsx berisi semua siswa dan dropdown kelas (326-395).
- Sekarang:
  - Enrollment punya riwayat: `status active|moved|graduated|left`, `joined_on/left_on`, satu aktif per (tahun, siswa) dijamin partial unique index (0003:162-174). LEBIH BAIK.
  - AssignStudent menolak bila sudah ada enrollment aktif (`ACADEMIC_ENROLLMENT_EXISTS`, service/class.go:140-151); BulkAssign melewati (skipped) siswa yang sudah punya kelas alih-alih memindah (158-176). BERBEDA dari upsert lama; pindah kelas eksplisit lewat `MoveStudent` (tutup `moved` + buka baru, 181-195). LEBIH BAIK secara audit.
  - Validasi siswa: HILANG. `AssignStudent`/`BulkAssign`/`CreateEnrollment` tidak mengecek bahwa `student_user_id` adalah user ber-profil siswa dan aktif (hanya FK ke `users`). Lama mengecek role siswa + aktif (560-570). `ListUnassignedStudents` memang memfilter `up.kind = 'student'` (students_lookup.sql:19-34), tetapi endpoint assign menerima id apa pun.
  - Race: pre-check `GetActiveEnrollment` lalu insert; pelanggaran `ux_active_enrollment` tidak dipetakan ke `ErrEnrollmentExists` (repository/class.go:90-98) -> 500 pada balapan. Kecil.
  - Remove/keluarkan siswa dari kelas (status `left` di tengah tahun): tidak ditemukan endpoint. Hanya `MoveStudent` dan promosi (`transfer` -> `left`, `graduate`). SEBAGIAN.
  - Import xlsx: cocokkan NIS lalu username (student_lookup.go:32-44); lookup username tidak memfilter jenis user siswa (students_lookup.sql:8-11). Aksi assign/move/unchanged/error otomatis, tidak ada flag move dan tidak ada deteksi duplikat dalam file (import.go:181-215); commit melewati baris error, bukan menolak file (97-125). BERBEDA (lebih permisif). Template hanya contoh statis, bukan prefill siswa + dropdown (42-71). SEBAGIAN.
  - Search unassigned hanya nama/username (tanpa email/NIS/NISN) (students_lookup.sql:28). SEBAGIAN.
- Tambahan: promosi/kenaikan kelas/kelulusan/transfer dengan preview + commit idempoten, override per siswa, target berdasarkan urutan jenjang dan track (domain/promotion.go:70-150, service/promotion.go:59-142). Ini menutup rekomendasi docs/11 no. 17.
- Verdict: SEBAGIAN. Model dan promosi jauh lebih baik, tetapi validasi "harus siswa aktif" hilang dan tidak ada aksi keluarkan siswa di tengah tahun.

### Penugasan mengajar (teacher_subject_assignments -> teaching_assignments)

- Referensi lama: guru harus role guru aktif anggota tahun; mapel dan semua kelas harus di tahun aktif; kelas dedup, min 1 maks 100; sync per (guru, mapel) = hapus kelas yang tak ada di daftar, upsert sisanya; id komposit `teacher:subject`; hapus per pasangan (academic_scope.go:1392-1558).
- Sekarang:
  - Unik `(year, teacher, subject, class)` di DB (0003:320) -> `ACADEMIC_TEACHING_ASSIGNMENT_EXISTS` (service/teaching.go:36-44). SAMA.
  - Sync per guru: hapus semua penugasan guru di tahun itu lalu buat ulang semua pasangan (68-87). BERBEDA (granularitas guru, bukan guru+mapel); tidak ada batas 100 di service.
  - Validasi referensi HILANG: tidak ada cek guru adalah user guru aktif, tidak ada cek `class.academic_year_id == assignment.academic_year_id` maupun mapel ada (hanya FK). Kelas dari tahun lain bisa ditempel.
  - `RequireTeachingAssignment` diekspor sebagai reader (99-113, readers.go:52-54) dan dipakai scheduling (academic_reads.sql:40-44, `is_active` dicek). SAMA.
- Verdict: SEBAGIAN. Fungsi inti sama, validasi referensi lintas tahun/peran hilang.

### Jadwal pelajaran (teaching_schedules -> schedules)

- Referensi lama (teaching_schedules.go):
  - `canManage` = super_admin/admin/`manage_schedules`; guru tanpa itu hanya jadwal sendiri, `teacher_user_id` dan `source=teacher` dipaksa, owner check saat update/delete (88-94, 213-216, 253-259, 462-478). Mutasi guru dibatasi deadline absolut RFC3339 `schedule.teacher_edit_deadline` (566-614). Siswa hanya melihat kelasnya; non-manage guru hanya jadwal sendiri (123-155).
  - Validasi: hari valid dan <= `school.active_until_day`; kelas/mapel/guru valid di tahun aktif; guru wajib `teacher_subject_assignments` aktif; periode aktif dan start<=end; source `admin|teacher`; notes<=255 (335-414).
  - Bentrok kelas dan bentrok guru via irisan sort_order, 409 dengan nama guru/mapel/periode (416-460). Jam kontinu digabung bila hari/kelas/guru/mapel/source/notes sama (526-556). Hapus semua jadwal tahun aktif oleh canManage (313-333).
- Sekarang (scheduling):
  - Actor `CanManage` = `manage_schedules` (transport handler.go:45-51). Non-manage: `source=teacher` dan `TeacherUserID=actor` dipaksa (service/schedule.go:252-260); owner check pada update/delete (87-89, 125-128). SAMA. Catatan: super_admin/admin bukan lagi hardcoded, mengikuti permission (LEBIH BAIK).
  - Deadline guru: BERBEDA. Bukan tanggal batas absolut, melainkan durasi (`time.ParseDuration`, default 24h) sebelum kemunculan berikutnya slot (327-361, domain/edit_window.go:14-16). Konsekuensi: setting lama berformat RFC3339 tidak kompatibel; semantik berubah dari "masa pengisian awal semester" menjadi "jangan ubah H-1".
  - Scoping baca HILANG: `listSchedules` hanya butuh `view_schedules` yang dimiliki role student dan teacher (role_defaults.go:19-38); tidak ada filter "siswa hanya kelasnya" / "guru hanya miliknya" (transport schedule.go:51-80). Siswa bisa melihat jadwal kelas mana pun dan guru mana pun. Regresi kecil (data jadwal tidak sensitif, tetapi berbeda dari lama).
  - `createSchedule/updateSchedule/deleteSchedule` diberi `x-permission: view_schedules` (scheduling.yaml:39-40, 126-127, 146-147), jadi siswa lolos authz; ia baru ditolak di `resolveCandidate` karena tidak punya teaching assignment (293-296). Efeknya benar, tetapi bergantung pada validasi, bukan authz. Lama menolak di `Allowed` (566-571).
  - Hari aktif: `school_days` per tahun (academic_reads.sql:34-38, service:281-284). LEBIH BAIK.
  - Kelas/mapel harus ada (286-291), guru wajib teaching assignment aktif (293-296). SAMA. Cek "guru adalah user guru aktif" tidak eksplisit, tersirat dari assignment.
  - Periode: start dan end harus satu template dan `start_seq <= end_seq` (266-279). Tidak dicek bahwa template itu yang dipetakan ke `day_of_week` tersebut, dan periode istirahat tidak ditolak. SEBAGIAN.
  - Bentrok kelas dan guru: cek domain (domain/conflict.go:37-56) plus exclusion constraint GiST di DB (0030_schedules:35-46) yang dipetakan kembali ke error domain (372-384). LEBIH BAIK (bebas race). Pesan: 409 `SCHEDULE_CONFLICT_CLASS|TEACHER` dengan detail id kelas/mapel/guru/seq (handler.go:80-93), bukan nama. SEBAGIAN (klien harus resolve nama; disengaja per komentar conflict.go:9-14).
  - Merge kontinu: syarat sama kecuali `notes` diabaikan dan `room_id` ikut dibandingkan (domain/merge.go:72-79). BERBEDA (kecil).
  - Hapus semua per tahun: `manage_schedules` (139-143, scheduling.yaml:91-92). SAMA.
  - Notes<=255: tidak ditemukan di service; bergantung spec.
  - `mutation_policy` per jadwal (229-250). SAMA (bentuk beda).
- Tambahan: `term_id`, `room_id`, `source=import`, bulk import atomik (148-168), `created_by/updated_by`, substitusi guru dan jurnal kelas (di luar scope ini).
- Verdict: LEBIH BAIK secara integritas (constraint DB, hari per tahun), SEBAGIAN secara scoping baca dan semantik deadline yang berubah.

### Kelas binaan (homeroom)

- Referensi lama (homeroom_class.go):
  - Hanya role guru; wali kelas ditentukan dari duty aktif `grants_leave_homeroom_review` scope class (37-50, 68-85).
  - Filter tanggal, page<=50, search nama/NIS/NISN, filter status H/I/S/A/D/BELUM_TERCATAT (87-105).
  - Per siswa: NIS/NISN, gender, telepon, wali dan telepon wali, foto, jumlah dan poin pelanggaran, expected (jumlah jadwal kelas pada hari itu, 116-121; catatan: inventaris menyebut bug expected=submitted, tetapi snapshot lokal ini sudah menghitung dari jadwal), submitted, status harian prioritas A > S > I > D > H (231-248); ringkasan H/I/S/A/D/unrecorded (185-221).
- Sekarang (attendance):
  - Endpoint `GET /v1/attendance/homeroom?date=` (attendance.yaml:3142-3155), permission `view_attendance`; 403 `ATTENDANCE_NOT_HOMEROOM` bila tidak punya duty (service/calendar.go:151-168, handler.go:83-84). SAMA secara akses (tidak lagi hardcode role guru).
  - Wali kelas = duty slug `homeroom` scope class aktif dan dalam rentang tanggal (cross_reads.sql:32-48). SAMA secara maksud, tetapi slug `homeroom` di-hardcode di attendance dan permits (permits/service/rules.go:73-74), bukan lewat permission/flag; dan kolom `classes.homeroom_teacher_id` tidak ikut dibaca di sini.
  - Expected = jumlah jadwal kelas hari itu hanya bila `school_days` aktif (calendar.go:186-198). LEBIH BAIK (libur -> 0).
  - Status harian: satu algoritma `ComputeDailyStatus` untuk semua tampilan: NONE / INCOMPLETE / mayoritas mutlak / prioritas policy tenant (domain/daily_status.go:59-118). BERBEDA dari "A menang atas apa pun" milik lama; disengaja (docs/11:59), tetapi perilaku bisnisnya berubah: satu sesi alfa dari lima tidak lagi membuat hari itu "A".
  - HILANG: paginasi, search, filter status, ringkasan per status, data wali/telepon/foto, jumlah dan poin pelanggaran. Roster hanya `student_user_id, name, status_code, expected, submitted, complete` (service/types.go:79-86).
- Verdict: SEBAGIAN. Aturan inti (siapa wali kelas, expected dari jadwal) ada dan lebih benar, tetapi tampilan kehilangan separuh data dan filter.

### Tugas tambahan guru dan pegawai (duty types, assignments, permission turunan)

- Referensi lama:
  - `teacher_additional_duties` per tahun: nama <=150 unik, 7 flag `grants_*`, `is_active` default true (academic_scope.go:863-977). `employee_additional_duties` terpisah dengan `grants_exit_security` (employee_duties.go:132-200).
  - Penugasan guru: guru harus role guru aktif anggota tahun; duty harus aktif; scope `global|class|student|custom`; `scope_label` wajib bila bukan global (<=150); scope class wajib kelas valid di tahun; unik per (year, teacher, duty, scope) via DB (1130-1298). Penugasan pegawai: role pegawai aktif, duty aktif (employee_duties.go:202-230).
  - Permission turunan dihitung saat login: guru -> `review_leave_requests` (duty homeroom scope class, scope_id not null) dan `issue_leave_letters` (duty issuance), dengan permission role yang sama DIHAPUS lalu diganti hasil duty (main.go:1618-1665); pegawai -> tambah `scan_exit_permits` bila duty security (employee_duties.go:36-57). Flag `grants_all_attendance_reports`, `grants_exit_*`, `grants_late_arrival_*` dicek langsung di handler masing-masing.
  - Guard: semua `manage_master_data`; `/teacher-options` untuk guru/manage_master_data/manage_schedules, guru hanya melihat dirinya (1008-1064).
- Sekarang:
  - Satu katalog `duty_types` (slug regex, name<=150, `scope_kind school|class|student`, soft delete) + `duty_permissions` (kode dari catalog) + `duty_assignments` per tahun dengan `starts_on/ends_on` dan unik (year, duty, user, class, student) (0002_identity:239-294; docs/06:72-77, 321). Guru dan pegawai disatukan. LEBIH BAIK.
  - Validasi tipe: slug/name/scope (identity/domain/duty.go:35-46); hapus ditolak bila masih ada assignment (service/duties_admin.go:139-157); permission diganti hanya dengan kode yang dikenal (161-194); semua ada audit log. LEBIH BAIK.
  - Validasi penugasan: scope object harus cocok dengan `scope_kind` (domain/duty.go:61-86; menggantikan `scope_id`/`scope_label`; scope `custom` dan `scope_label` HILANG), kelas dan user harus ada (duty_assignments_admin.go:46-53, 69-89). HILANG: cek bahwa kelas berada di `academic_year_id` yang sama (hanya `ClassExistsInTenant`, duties_admin.sql:44-45) dan cek bahwa user adalah guru/pegawai aktif (hanya `UserExistsInTenant`).
  - Permission turunan: union role perms + duty perms aktif pada tahun aktif, dihitung per request (identity/service/service.go:207-249; authz/scope.go:36-42; duties.sql:1-17 memfilter `is_active` tipe dan penugasan, rentang tanggal). LEBIH BAIK (tidak perlu login ulang; lama malah mencabut permission role). Scope objek dievaluasi service lewat `HasScope` (scope.go:47-66) atau query slug (permits cross_module.sql:36-57).
  - Pemetaan flag lama -> permission/duty baru (cmd/seed/main.go:49-53 dan pemakainya): `grants_leave_homeroom_review` -> `review_leave_requests` pada `homeroom`; `grants_leave_issuance` -> `issue_leave_letters` pada `counselor`; `grants_all_attendance_reports` -> `view_reports`; `grants_exit_bk_approval`/`grants_exit_leadership_approval` -> approver rule `duty:counselor` / `duty:leadership` di workflow permits; `grants_exit_security` -> `scan_exit_permits` pada `security`; `grants_late_arrival_*` tidak dipetakan (yang `_duty` memang tidak dipakai di lama). Catatan: pemetaan ini hidup di seed dan ETL (cmd/etl/migrate_identity.go:105-109), bukan bootstrap tenant; modul school/service tidak men-seed duty types (grep kosong), jadi tenant baru tanpa seed tidak punya `homeroom` yang di-hardcode attendance/permits.
  - Guard: tipe duty `manage_permissions`, penugasan `manage_master_data`, list penugasan `view_users` (identity-admin.yaml:443-622). SAMA untuk penugasan.
  - `/teacher-options` dan daftar pegawai untuk dropdown: tidak ditemukan padanan khusus; penugasan jadwal guru tidak membutuhkannya karena teacher dipaksa ke aktor.
- Verdict: LEBIH BAIK. Dua sistem paralel disatukan sesuai docs/06; celah: validasi kelas-vs-tahun dan peran user pada penugasan, serta seeding duty `homeroom` yang di-hardcode belum ada di bootstrap tenant.

### Katalog pelanggaran (violations, ada di academic_scope.go)

- Referensi lama: nama <=150 unik per tahun, poin >=0 (751-771).
- Sekarang: dipindah ke modul discipline (`violation_types`, discipline/queries/violations.sql:1-20). Di luar grup ini; hanya dicatat bahwa tidak hilang.

## Ringkasan

| Fitur                           | Verdict               | Gap terpenting                                                                                                                                                |
| ------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tahun ajaran dan semester       | LEBIH BAIK            | Update tahun terarsip/tak ada jatuh ke 500, bukan 404; dua service penulis `academic_years`                                                                   |
| Jenjang dan jurusan             | LEBIH BAIK            | Fitur baru, tidak ada gap                                                                                                                                     |
| Kelas                           | LEBIH BAIK            | `classes.homeroom_teacher_id` tidak disinkronkan dengan duty `homeroom`                                                                                       |
| Mata pelajaran                  | LEBIH BAIK            | Uniqueness pindah ke `code` tenant-wide (bukan nama per tahun), disengaja                                                                                     |
| Ruang belajar                   | LEBIH BAIK            | Masih tanpa cek bentrok ruangan (sama seperti lama)                                                                                                           |
| Periode dan aturan hari         | LEBIH BAIK            | Periode istirahat tidak ditolak saat dijadwalkan; hapus periode yang dipakai -> 500                                                                           |
| Kalender akademik               | LEBIH BAIK            | Fitur baru                                                                                                                                                    |
| Siswa per kelas                 | SEBAGIAN              | Assign tidak memvalidasi user adalah siswa aktif; tidak ada endpoint keluarkan siswa (`left`) di tengah tahun                                                 |
| Promosi/kelulusan               | LEBIH BAIK            | Fitur baru, idempoten                                                                                                                                         |
| Penugasan mengajar              | SEBAGIAN              | Tidak ada cek kelas/mapel di tahun yang sama atau guru aktif                                                                                                  |
| Jadwal pelajaran                | LEBIH BAIK / SEBAGIAN | Siswa dan guru bisa membaca jadwal siapa pun; semantik deadline guru berubah (durasi H-n, bukan tanggal batas)                                                |
| Kelas binaan                    | SEBAGIAN              | Hilang paginasi, search, filter status, ringkasan, data wali dan pelanggaran; algoritma status harian berubah (disengaja)                                     |
| Tugas tambahan guru dan pegawai | LEBIH BAIK            | Penugasan tidak mengecek kelas berada di tahun yang sama dan user berperan guru/pegawai; duty `homeroom` yang di-hardcode belum di-seed oleh bootstrap tenant |

---

# Bagian 3

## Perbandingan logika: presensi, laporan, kalender, jurnal, guru pengganti, presence, presensi pegawai

Catatan umum: kode lama satu file per fitur (`reference/sion-rebuild-go/backend/cmd/api/*.go`), kode baru terpisah domain/service/repository/transport. Referensi baris di bawah: "L" = file lama, path penuh = file baru (relatif `apps/api/`).

---

### 1. Presensi siswa oleh guru (sesi, status, jendela simpan/koreksi)

**Referensi lama** (`teacher_attendance.go`):

- Akses: role guru atau permission `manage_attendance` (L95); butuh tahun ajaran aktif (L99); `?date=` bebas (L350-358).
- Daftar jadwal: kosong bila di luar hari aktif sekolah (L361-364); guru melihat jadwal sendiri atau sebagai pengganti accepted (L383); admin bisa filter `teacher_user_id` (L386-389); `currentOnly` membatasi ke jam berjalan (L390-394); jam kontinu digabung (L483-508).
- Buka sesi: mode normal hanya bila jam sedang berjalan (L421-425); mode koreksi (`?mode=correction|koreksi`, L825-828) memerlukan akses koreksi (L155-160); sesi dibuat SELECT-then-INSERT (race, L510-531).
- Payload sesi: `previous_status` (default H bila sesi sebelumnya ada, L540), `late_arrival_pending` (L576-579), status ditimpa surat izin issued saat ditampilkan (L588), `meeting_number` dihitung per kelas+guru+mapel (L614-628), jurnal sebelumnya dengan fallback ke `notes` sesi (L630-666), `can_edit_journal` (L668-675).
- Simpan: entries wajib tidak kosong (L189); topik dan kegiatan jurnal wajib bersamaan (L196); batas topik 255 / kegiatan 5000 / refleksi 5000 (L200); siswa wajib anggota aktif kelas (L261); siswa dengan terlambat belum selesai **dilewati diam-diam** (L267); status hanya H/S/I/D/A (L270); surat izin issued menimpa status jadi S/D/I + catatan otomatis (L274-280); catatan maks 255 (L281); pelanggaran per sesi delete-and-reinsert (L295-309); `submitted_at` diisi (L311); jurnal ditulis atas nama guru asli hanya oleh guru asli atau pengganti accepted (L316-336); broadcast monitoring (L341).
- Otorisasi simpan (L939-970): global bila super_admin/admin/`correct_attendance`/duty `grants_all_attendance_reports` atau `grants_leave_issuance` (L830-854); wali kelas = duty `grants_leave_homeroom_review` scope kelas (L856-885); bukan pemilik jadwal harus pengganti accepted atau wali kelas (L950-963); hari yang sama boleh sampai `end_time:59` (L964-967); setelah itu **guru mana pun yang lolos cek di atas** boleh sampai `tanggal + correction_days + 1` (L928-936), default `correction_days` = 3 (L912-918).

**Sekarang** (`internal/modules/attendance`):

- Akses route: `manage_attendance` untuk buka/simpan, `view_attendance` untuk baca (`openapi/modules/attendance.yaml:6,25,54,73`). SAMA secara fungsi, tanpa cek role "guru" eksplisit.
- Daftar hari ini: `service/session.go:20-83` jadwal sendiri + pengganti accepted, sesi langsung dibuka idempoten. SEBAGIAN: tidak ada `?date=`, tidak ada `currentOnly`, tidak ada cek hari aktif, tidak ada filter guru untuk admin, tidak ada penggabungan jam kontinu.
- Buka sesi: `service/session.go:90-128`; akses via `scheduling/service/access.go:13-32` (pemilik jadwal atau pengganti accepted). BERBEDA: (a) tidak ada batasan "jam sedang berjalan", tanggal bebas (termasuk masa depan); (b) admin/`manage_attendance` **tidak bisa** membuka sesi guru lain (lama bisa); (c) wali kelas/korektor global **tidak bisa** membuka sesi kelas yang tidak diajarnya untuk koreksi (lama bisa lewat mode koreksi, L411-415), hanya bisa koreksi sesi yang sudah pernah dibuka guru.
- Sesi idempoten: `queries/sessions.sql:1-11` ON CONFLICT + unique `(schedule_id, date)` (`migrations/0032_attendance_sessions.up.sql:18`). LEBIH BAIK (race hilang).
- Payload: `service/session.go:168-245`. `previous_status` SAMA (`queries/entries.sql:23-31`, tanpa default H); `Blocked` untuk terlambat (L221-226) SAMA; `meeting_number` dihitung **per schedule_id** (`queries/sessions.sql:42-46`) BERBEDA: mapel yang diajar dua slot seminggu dihitung terpisah, lama per kelas+guru+mapel; jurnal sebelumnya (L174-185) SAMA tanpa fallback notes; timpaan surat izin **tidak diterapkan pada roster** (hanya `Source` dari entri yang sudah ada) SEBAGIAN; `can_edit_journal` HILANG (tidak ada di payload).
- Simpan `service/entries.go:27-187`:
  - Set status: konfigurasi per tenant `tenant_policies` (`domain/policy.go:38-49`, default H/S/I/D/A). LEBIH BAIK.
  - Siswa harus anggota kelas (L103) SAMA; status valid (L106) SAMA.
  - Surat izin menimpa: Overrider (L112-116) → `permits/service/read.go:125-135`. SAMA untuk surat izin; izin keluar tidak lewat Overrider (`cmd/api/integrations.go:106-114`), hanya lewat `ForceStatus` saat keluar gerbang.
  - **Terlambat belum selesai: HILANG pada simpan.** Blocker hanya dipakai untuk menandai roster (`session.go:221`), `SaveEntries` tidak memeriksa `blocker` sama sekali, sehingga payload manipulasi bisa mencatat hadir (tepat yang dicegah komentar lama L265-266 dan `docs/02-system-design.md:109`). REGRESI.
  - Entries kosong: tidak ditolak (lama 400). BERBEDA kecil: sesi tercatat submitted tanpa entri.
  - Jurnal: kedua field wajib bila jurnal dikirim (L143-146) SAMA; ditulis atas nama `session.TeacherUserID`, `written_by` = aktor (`scheduling/service/journal.go:30-57`). LEBIH BAIK (penulis tercatat). Batas: topik 300 (`attendance.yaml:370`), kegiatan tanpa batas, catatan 300 (`attendance.yaml:365`).
  - Pelanggaran per sesi: HILANG dari payload (`attendance.yaml:351-370` tidak ada `violation_ids`); modul discipline punya kolom `attendance_session_id` (`discipline/queries/violations.sql:24`) tetapi alur terpisah.
  - Audit koreksi `attendance_corrections` bila status berubah setelah submit (L131-138). LEBIH BAIK (baru).
  - Jendela (`domain/save_window.go:42-61`): normal ditutup saat `Now > PeriodEndAt`; koreksi hanya korektor global atau wali kelas + alasan wajib, sampai `endOfDay(tanggal) + correction_days`. `correction_days` dari setting tenant `attendance.correction_days` (`repository/cross_reads.go:92-104`, sesuai `docs/11-feature-recommendations.md:26`), default 7 (`entries.go:18`, lama 3).
    - BERBEDA/REGRESI: guru pemilik jadwal yang lupa mengisi tidak bisa menyimpan setelah jam berakhir (lama boleh sampai tenggat koreksi). Juga tanpa toleransi `:59`; komentar `save_window.go:24-27` menyebut grace ditambahkan, tapi `session.go:250-258` tidak menambah apa pun.
    - Korektor global hanya permission `correct_attendance` (`transport/http/handler.go:44-52`); duty lama `grants_all_attendance_reports`/`grants_leave_issuance` hanya berlaku bila `duty_permissions` memberi permission itu (`platform/authz/permissions.go:126-128`). SEBAGIAN (bergantung seed).
    - Wali kelas: duty slug `homeroom` (`queries/cross_reads.sql:32-48`). SAMA.
  - Broadcast monitor: `entries.go:181-185` + `module.go:45-49`. SAMA.
  - Event `attendance.submitted` (`entries.go:169-174`) dipublikasikan sebagai struct `service.Submitted`, sedangkan handler notifikasi menuntut `events.Envelope` (`notifications/service/events.go:121-125`) → handler error, ditelan `_ =`. Notifikasi orang tua untuk A (`docs/02-system-design.md:110`) tidak pernah terjadi. HILANG (bug wiring).

**Tambahan di kode baru:** zona waktu tenant (`service/service.go:221-231`), Idempotency-Key (`attendance.yaml:76`), materialisasi `attendance_daily_summary` dalam transaksi yang sama (`entries.go:194-229`), status konfigurabel, audit koreksi, `ForceStatus` dari permits (`service/force.go`), tes integrasi.

**Verdict: SEBAGIAN.** Inti (sesi, status, timpaan izin, jurnal, koreksi wali kelas) ada dan lebih rapi, tetapi tiga regresi nyata: siswa terlambat tidak lagi dilewati saat simpan, guru pemilik tidak bisa simpan telat, dan pelanggaran per sesi hilang.

---

### 2. Laporan / rekap presensi

**Referensi lama** (`teacher_attendance_reports.go`):

- Akses guru/`view_attendance`/`manage_attendance` (L50); `?date=` default hari ini (L102-110); filter `class_id` (L64).
- Scope: non-guru = all; guru = own kecuali duty `grants_all_attendance_reports` (L112-127). Own hanya sesi yang sudah submit (L168-172).
- Daftar kelas untuk filter per hari (L129-160).
- Detail per jadwal × siswa (mapel, guru, periode, status, catatan, `session_submitted`) (L162-218); `expected` dari jadwal hari itu.
- Ringkasan per siswa: `BELUM_LENGKAP` bila submitted < expected; `A` bila semua A; `A_SEBAGIAN` bila ada A; seragam H/S/I/D; selain itu `CAMPURAN` (L263-286).

**Sekarang:**

- `GET /v1/attendance/reports/daily` wajib `class_id`, permission `view_reports` (`attendance.yaml:144-148`); `service/report.go:17-39` → `buildRoster` (`service/calendar.go:174-234`). BERBEDA: tidak ada scope "own" untuk guru biasa, tidak ada daftar kelas, tidak ada baris detail per sesi (hanya per siswa).
- Algoritma harian `domain/daily_status.go:59-94`: `NONE`/`INCOMPLETE`/`MIXED`, lalu mayoritas mutlak, lalu prioritas A>D>I>S>H. Expected dihitung dari jumlah jadwal kelas hari itu (`calendar.go:194-206`), memperbaiki bug "expected = submitted" (docs 1.11). BERBEDA: `A_SEBAGIAN` hilang; 2 H + 1 A menjadi `H`, alpa sebagian tidak terlihat di rekap harian (lama menonjolkannya).
- Ekspor XLSX (`service/report.go:43-81`), rekap bulanan per siswa (`service/calendar.go:49-59`, `attendance.yaml:188-192`), integrasi modul reports terjadwal (`reports/service/service.go:61`). LEBIH BAIK (baru).

**Verdict: SEBAGIAN.** Kalkulasi expected lebih benar dan ada XLSX/bulanan, tetapi detail per sesi, scope guru sendiri, dan sinyal `A_SEBAGIAN` hilang.

---

### 3. Kalender presensi siswa (siswa/orang tua)

**Referensi lama** (`student_attendance.go`):

- Hanya role siswa (L34); `?month=YYYY-MM` (L60-72); hanya sesi submitted (L97); detail per sesi: mapel, guru, periode, status, catatan (L80-98).
- Timpaan per hari: surat izin issued → S/D/I (L153-195); izin keluar issued/exited → `D` untuk seluruh hari `created_at`, menimpa surat izin (L204-223); hari override tetap muncul walau tanpa sesi (L125-129).
- Agregasi: mayoritas mutlak dengan prioritas D,I,S,A,H, selain itu `CAMPURAN`; `source` official/teacher/mixed/none (L231-247). Hanya hari yang punya data.

**Sekarang:**

- `GET /v1/attendance/me/calendar` (`attendance.yaml:95-99`, authenticated) → `service/calendar.go:24-44, 70-145`. Semua hari dalam bulan dikembalikan (L88), termasuk `NONE`. Membaca `attendance_daily_summary` bila ada, hitung live bila belum (L108-142), satu algoritma dengan laporan. LEBIH BAIK (konsisten).
- Per sesi hanya `schedule_id`, `subject_id`, `status_code` (L98-106). SEBAGIAN: nama mapel/guru/periode/catatan/`source`/`override_label` hilang.
- Timpaan: bukan overlay saat baca, melainkan entri bersumber `leave`/`permit` yang ditulis `ForceStatus` (`service/force.go:19-98`; `permits/service/leaverequest.go:353-358`, `exitpermit.go:262-270`). Izin keluar hanya menimpa sesi dalam rentang periodenya (komentar "bug fix", `exitpermit.go:262-264`) LEBIH BAIK. Tetapi `ForceStatus` tidak membuat sesi (`force.go:14-16`), jadi hari izin tanpa sesi tampil `INCOMPLETE`, bukan "official S" seperti lama; dan Overrider saat simpan hanya surat izin, bukan izin keluar (`cmd/api/integrations.go:108-114`). SEBAGIAN.
- Agregasi mayoritas + prioritas (`domain/daily_status.go:87-93`), `CAMPURAN` hanya kasus degeneratif. BERBEDA (keputusan sadar, `domain/policy.go:14-17`).
- Orang tua: `GET /v1/family/children/{id}/attendance` (`family/transport/http/handler.go:44-56`, permission `view_child_attendance`). LEBIH BAIK (lama tidak ada).

**Verdict: SEBAGIAN.** Struktur dan konsistensi lebih baik dan orang tua dapat akses, tetapi detail per sesi dan label sumber/override hilang, dan hari izin tanpa sesi tidak lagi tampil resmi.

---

### 4. Jurnal kelas

**Referensi lama** (`class_journals.go`):

- Hanya guru, hanya jurnal sendiri (L45-51, L87); opsi kelas/mapel dari `teacher_subject_assignments` aktif (L61-67); filter `date_from/date_to/class_id/search`, paginasi ≤100 (L85-107, L126-133).
- Validasi: tanggal valid, kelas/mapel/topik/kegiatan wajib, topik ≤255, kegiatan/refleksi ≤5000 (L159-184); kelas+mapel wajib penugasan mengajar aktif (L186-194); unik tanggal+kelas+mapel → 409 (L209-217, L239-247); update hanya milik sendiri (L239).
- Unduh CSV BOM UTF-8 (L317-326) atau DOCX A4 landscape dengan kop `leave.letter_header` (L299-315, L328-408).

**Sekarang** (`internal/modules/scheduling`):

- Route `scheduling.yaml:246-341`, semua `authenticated`.
- List: milik sendiri, atau per kelas bila `view_journals_all` (`transport/http/journal.go:17-42`). LEBIH BAIK untuk supervisi; HILANG filter tanggal/pencarian/paginasi.
- Upsert `journal.go:59-73` → `service/journal.go:30-57`: topik+kegiatan wajib (`domain/journal.go:34-42`) SAMA; unik DB (`migrations/0033_class_journals.up.sql:16`) SAMA (tanpa 409, langsung update); topik ≤300 (`scheduling.yaml:513`, migrasi L10), kegiatan tanpa batas. **Cek penugasan mengajar HILANG** (tidak ada pemanggilan `teaching_assignments` di `service/journal.go`).
- `GetJournal` by id (`journal.go:75-82`, `service/journal.go:59-70`): **tanpa cek kepemilikan**, pengguna terautentikasi mana pun (termasuk siswa) bisa membaca jurnal guru mana pun. REGRESI otorisasi.
- Hapus (`journal.go:84-92`, cek pemilik/penulis) baru. LEBIH BAIK.
- Ekspor: XLSX dengan ID mentah, tanpa nama kelas/mapel/guru (`journal.go:129-170`); `format=docx` → 501 (`journal.go:95-97`). SEBAGIAN/HILANG (DOCX dengan kop tidak ada; CSV diganti XLSX ID mentah).
- Opsi kelas/mapel: tidak ditemukan endpoint padanan.
- Dari presensi: penulisan atas nama guru asli oleh pengganti (`attendance/service/entries.go:147-152`) SAMA + `written_by_user_id`.

**Verdict: SEBAGIAN.** CRUD dasar dan penulisan dari presensi ada, tetapi hilang cek penugasan, filter/pencarian, DOCX berkop, dan ada kebocoran baca-jurnal-siapa-saja.

---

### 5. Guru pengganti

**Referensi lama** (`teacher_substitutions.go`):

- Hanya guru (L51); list scope all/incoming/outgoing + filter status, limit 100 (L59-79); daftar jadwal sendiri (L93-133); opsi pengganti = user aktif berrole guru di tahun aktif, kecuali diri sendiri, search, limit (L135-180).
- Create: jadwal/tanggal/pengganti wajib (L199-203); bukan diri sendiri (L204); catatan ≤500 (L208); jadwal milik requester (L213-216); weekday cocok hari jadwal (L222); pengganti guru aktif (L226-236); unik jadwal+tanggal apa pun statusnya → 409 (L237-245); notifikasi DB + WS ke pengganti (L251-259).
- Respond: hanya pengganti, hanya pending; default accept kecuali `action=reject`; catatan ≤500; notifikasi ke requester (L278-322). Tanpa cancel, tanpa cek bentrok pengganti.

**Sekarang:**

- Route `scheduling.yaml:153-245`, permission `view_schedules`. SAMA secara praktis.
- Create `service/substitution.go:59-107`: pemilik jadwal (L69) SAMA; bukan diri sendiri + weekday (`domain/substitution.go:42-50`, plus CHECK DB `0031:14`) SAMA; catatan ≤500 (`scheduling.yaml:216,477`) SAMA; duplikat hanya pending/accepted (L77-81 + partial unique index `0031:20`) LEBIH BAIK (bisa minta lagi setelah ditolak); pengganti = punya `teaching_assignments` aktif (`queries/academic_reads.sql:46-50`) BERBEDA (lebih ketat dari "user aktif berrole guru").
- Respond `L109-136` + `domain/substitution.go:64-72` SAMA. Cancel oleh requester saat pending/accepted (`L138-152`, `domain:77-85`) LEBIH BAIK (baru).
- List hanya incoming/outgoing (`transport/http/substitution.go:11-33`); HILANG scope all, filter status, endpoint opsi pengganti.
- **Notifikasi HILANG (bug):** event dipublikasikan dengan nama `scheduling.substitution_requested`/`_responded` (`service/substitution.go:41,53`), sedangkan notifications berlangganan `substitution.requested`/`.responded` (`platform/events/names.go:13-14`, `notifications/service/events.go:31-41`); selain itu handler menuntut `events.Envelope` (`events.go:121-125`) sedangkan yang dikirim struct polos. Tidak ada push WS ke guru (lama `teacherEvents`).
- Tetap tanpa cek bentrok pengganti (SAMA dengan lama).

**Verdict: SEBAGIAN.** Aturan pembuatan/respon setara-atau-lebih baik (cancel, re-request), tetapi notifikasi ke pengganti/requester tidak pernah terkirim.

---

### 6. Presence (`presence.go`), pengguna online realtime

Catatan: file ini **bukan** presensi guru; ini pelacak "siapa sedang online" untuk dashboard.

**Referensi lama:** WS `/api/realtime/presence` (L158-225): verifikasi JWT HS256 + cek single-device (L164-193); heartbeat TTL 90 detik (L17), backing Redis ZSET/HASH + pub/sub (L57-63, L145-151) atau memori; snapshot total + per-role (L79-109); `presence_ready`/`presence_update` disiarkan ke semua pendengar, loop kedaluwarsa 15 detik (L137-143).

**Sekarang:** tidak ada pelacak presence per pengguna. `GET /v1/monitor/presence` (`attendance.yaml:236-240`, `transport/http/monitor.go:28-36`) hanya menghitung socket terbuka pada topik `monitor:<tenant>` (`attendance/module.go:52-64`; komentar mengakui belum ada `realtime.Presence`). `platform/realtime/` berisi hub/redis/client saja (tidak ada presence.go). WS per-user `ws/me` (`cmd/api/ws.go:41-70`) hanya topik notifikasi.

- HILANG: heartbeat TTL, hitungan per-role, siaran `presence_update`, cek single-device pada WS.

**Verdict: HILANG.** Yang tersisa hanya jumlah socket monitor; tidak ada dokumen yang menyatakan fitur ini sengaja dibuang.

---

### 7. Presensi pegawai/guru (staff attendance)

**Referensi lama:** tidak ada (grep `staff_attendance|teacher_presence|employee_attendance` di `reference/sion-rebuild-go/backend` kosong).

**Sekarang** (`internal/modules/staffattendance`, `openapi/modules/staff-attendance.yaml`): jadwal kerja mingguan per pegawai dengan grace (`service/schedule.go`), catat via scan/manual/import (`service/records.go:17-141`), aturan keterlambatan murni domain (`domain/lateness.go:55-80`: OnLeave > libur/tanpa jadwal > absen > incomplete > menit terlambat/pulang cepat, shift lintas tengah malam), papan hari ini, riwayat, rekap bulanan + XLSX (`service/recap.go`, `service/xlsx.go`), koreksi berizin `correct_staff_attendance`, feature flag `staff_attendance` (`service/service.go:21`), integrasi kalender akademik dan cuti dari permits. Sesuai `docs/11-feature-recommendations.md:40` (item 22).

**Verdict: LEBIH BAIK (fitur baru).**

---

## Ringkasan

| Fitur                    | Verdict    | Gap terpenting                                                                                                                                                                                                 |
| ------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Presensi siswa oleh guru | SEBAGIAN   | `SaveEntries` tidak memanggil Blocker: siswa terlambat-belum-selesai bisa dicatat hadir (`attendance/service/entries.go:102-141`); guru pemilik tidak bisa simpan setelah jam berakhir; `violation_ids` hilang |
| Laporan/rekap presensi   | SEBAGIAN   | `A_SEBAGIAN` dan detail per sesi hilang; tidak ada scope "own" untuk guru tanpa `view_reports`                                                                                                                 |
| Kalender presensi siswa  | SEBAGIAN   | Tanpa nama mapel/guru/catatan/`source`; hari izin tanpa sesi tampil `INCOMPLETE`, bukan status resmi                                                                                                           |
| Jurnal kelas             | SEBAGIAN   | `GetJournal` tanpa cek pemilik (`scheduling/service/journal.go:59-70`); cek penugasan mengajar, filter/pencarian, DOCX berkop hilang                                                                           |
| Guru pengganti           | SEBAGIAN   | Notifikasi tidak pernah terkirim: nama event dan tipe (struct vs Envelope) tidak cocok dengan langganan notifications                                                                                          |
| Presence (online)        | HILANG     | Tidak ada pelacak heartbeat/per-role; hanya hitung socket monitor                                                                                                                                              |
| Presensi pegawai         | LEBIH BAIK | Fitur baru sesuai docs/11 item 22; lama tidak punya                                                                                                                                                            |

Dua bug wiring lintas modul yang layak diprioritaskan karena menyentuh dua fitur sekaligus: (1) event `attendance.submitted` dan `scheduling.substitution_*` dipublikasikan sebagai struct polos sehingga `notifications/service/events.go:121-125` selalu gagal; (2) `SaveEntries` mengabaikan Blocker meski roster sudah menandainya.
---

# Bagian 4

## Perbandingan logika: Izin terencana, Izin keluar/dispensasi, Terlambat

Catatan umum: ketiga fitur di kode baru dibangun di atas satu mesin workflow generik (`workflow_definitions` + `workflow_instances` + `workflow_events`) dengan tahap default yang meniru SION (`apps/api/internal/modules/permits/domain/defaults.go:10-64`). Pengecekan pemberi persetujuan lewat registry rule (`service/rules.go:62-88`), bukan kolom `grants_*` pada duty. Permission `review_leave_requests` / `issue_leave_letters` / `scan_exit_permits` kini melekat pada duty (`apps/api/cmd/seed/main.go:49-53`), setara dengan derivasi lama di `main.go:1650-1666`.

---

### Izin terencana (leave request)

**Referensi lama** (`student_leave_api.go`, `student_leave_requests.go`, `main.go`)

1. State: `pending_homeroom -> pending_bk -> issued`, atau `rejected` dari homeroom (`student_leave_requests.go:12-20`).
2. Hanya siswa mengajukan; kategori `religious_ceremony|sick|dispensation|other`; alasan dipaksa label default untuk non-`other`; alasan <= 500; `end >= start` (`student_leave_api.go:161-183`).
3. Wali kelas ditentukan saat submit dari duty scope class dengan `grants_leave_homeroom_review`; 409 bila tidak ada (`:186-193`).
4. Bukti wajib, WebP <= 6 MB, disimpan lokal; kompensasi manual (hapus row) jika gagal (`:201-238`).
5. Snapshot nama siswa/kelas/wali murid; event; notifikasi DB ke wali kelas (`:196-208`).
6. Review: hanya `homeroom_user_id` yang tersimpan; status harus `pending_homeroom`; approve/reject + note; notifikasi ke siswa (`:240-271`).
7. Issue: hanya guru dengan duty `grants_leave_issuance`, status `pending_bk`; nomor `SION/IZIN/YYYYMMDD/HEX`; sinkron `attendance_entries` untuk semua sesi dalam rentang (S/D/I); event; notifikasi; satu transaksi (`:273-310`, `:533-591`).
8. Status izin terbit juga menimpa roster presensi saat guru membuka sesi (`:593-664`).
9. Surat SVG A4 dari template 16 field di `app_settings.leave.letter_template` (normalisasi default, accent color hex, <= 1200 char/field, payload <= 20 KB) + kop gambar `leave.letter_header` WebP <= 700 KB; placeholder `{{student_name}} {{class_name}} {{reason}} {{date_range}} {{letter_number}} {{nis}} {{address}} {{issued_at}} {{homeroom_name}} {{issuer_name}}` (`main.go:105-121,171-190,244-299`; `student_leave_api.go:355-462`).
10. Unduh surat: siswa pemilik, atau guru dengan `review_leave_requests`/`issue_leave_letters` (`:344-351`).
11. Verifikasi publik: HMAC-SHA256(JWT secret, id|nomor|issuedAt) 22 char; mengembalikan nama, kelas, **alasan**, tanggal (`:56-60,77-108`).
12. Daftar: siswa lihat miliknya; guru lihat `pending_homeroom` miliknya dan/atau `pending_bk` bila punya duty issuance (`:110-158`).

**Sekarang**

1. State machine: LEBIH BAIK. Generik `in_progress -> approved/completed | rejected | cancelled | expired` (`domain/workflow.go:35-52`), tahap default `homeroom -> counselor` (`domain/defaults.go:52-61`). Review tidak boleh menyetujui tahap terakhir (`service/leaverequest.go:226-228`), issue hanya di tahap terakhir (`:288-290`).
2. Validasi submit: SEBAGIAN. Kategori dan tanggal dicek (`service/leaverequest.go:48-53`, CHECK DB `migrations/0044_leave_requests.up.sql:4,15`), alasan 1-500 via OpenAPI (`openapi/modules/permits.yaml:438`). Pemaksaan alasan ke label default untuk non-`other` HILANG. Siswa dibatasi lewat permission `submit_leave_requests` (`permits.yaml:428`), bukan role.
3. Penentuan wali kelas: BERBEDA (lebih baik). Tidak disnapshot saat submit; dievaluasi saat review lewat `homeroom_of_student` = duty `homeroom` aktif pada kelas instance (`service/rules.go:73-74`, `queries/cross_module.sql:36-57`). Konsekuensi: submit tidak lagi 409 bila kelas belum punya wali kelas; pengajuan bisa menggantung sampai job expiry menutupnya sebagai `expired` (`service/expiry.go:17-41`).
4. Bukti: BERBEDA (regresi aturan). Bukti tidak lagi wajib: submit tidak mensyaratkan, review/issue tidak memeriksa `HasEvidence`. Unggah dua langkah presigned + confirm, JPEG/PNG (bukan WebP) <= 6 MB, decode ulang untuk buang EXIF, disimpan sebagai `assets` (`service/leaverequest.go:112-192`, `service/service.go:136-143`). Policy `permits.evidence_required` yang disebut `docs/02-system-design.md:67` tidak ditemukan di kode.
5. Snapshot + event + notifikasi: SAMA. Snapshot (`service/leaverequest.go:86-90`), event `opened` (`service/workflow.go:189-194`), notifikasi via bus ke pemegang duty homeroom kelas (`internal/wiring/eventbridge.go:30-37`).
6. Review homeroom: SAMA/LEBIH BAIK. Rule + status dicek (`service/workflow.go:219-245`, `:278-303`), catatan disimpan sebagai event; notifikasi ke siswa dan ke BK saat approve (`eventbridge.go:38-58`). Reject tanpa alasan tetap boleh untuk wali kelas (wajib alasan hanya untuk wali murid, `service/leaverequest.go:261-266`).
7. Penerbitan: LEBIH BAIK. Duty `counselor` (`defaults.go:58`), nomor atomik `{{seq}}/IZIN/{{month_roman}}/{{year}}` dari `document_sequences` (`domain/document.go:79`, `queries/document_sequences.sql:1-10`), unik per tenant (`0044:19`), PDF tersimpan + `issued_documents` dengan hash kode verifikasi (`service/leaverequest.go:304-348`), sinkron presensi via `AttendanceSync.ForceStatus` S/D/I dalam satu transaksi (`:353-359`, `:370-379`; implementasi `attendance/service/force.go:19-98`).
8. Override roster presensi: SAMA. `LeaveOverride` (`service/read.go:125-135`) dipasang sebagai `Overrider` attendance (`cmd/api/wire.go:140`, `cmd/api/integrations.go:108-114`).
9. Template surat: SEBAGIAN. Diganti `document_templates` (HTML -> PDF, banyak template, satu default per kind, `service/leaverequest.go:583-635`, `migrations/0046`). Template bawaan hanya punya `letter_number student_name class_name guardian_name category reason starts_on ends_on days issued_at verification_code` (`:315-320,390-401`). Placeholder `nis`, `address`, `homeroom_name`, `issuer_name` HILANG; kop surat gambar (`leave.letter_header`) HILANG (renderer `platform/documents/renderer.go` tidak punya letterhead); normalisasi field/accent color HILANG (tidak relevan di HTML). Sesuai rekomendasi `docs/11-feature-recommendations.md:24` (editor template), tetapi "kop surat dari branding" belum ada.
10. Unduh surat: LEBIH BAIK. `RequireCanViewLeaveRequest`: subjek, homeroom kelas, counselor, leadership (`service/read.go:94-121`); URL presigned singkat (`service/leaverequest.go:519-543`).
11. Verifikasi publik: BERBEDA (disengaja). Kode acak 16 byte, HMAC dengan `DOCUMENT_SIGNING_KEY` (bukan JWT secret), lookup hash (`platform/documents/verification.go:26-44`); respons sengaja tanpa alasan (`service/leaverequest.go:558-579`). Bisa `revoked`.
12. Daftar: SEBAGIAN. Siswa: `ListMyLeaveRequests`. Reviewer: `ListLeaveRequestsForReview` mengembalikan semua `in_progress` untuk kelas homeroom atau semua kelas untuk counselor/leadership (`queries/leave_requests.sql:25-51`), tidak difilter per tahap saat ini, sehingga wali kelas tetap melihat pengajuan yang sudah lewat tahapnya.

**Tambahan di kode baru**: tahap wali murid opsional `guardian_of_student` + antrean wali murid (`service/leaverequest.go:261-266,471-515`; sesuai `docs/11:11`); pembatalan; expiry otomatis; ekspor daftar izin ke laporan (`wiring/reports.go:146-167`); pipeline dokumen dipakai ulang oleh SP, kuitansi, visitor.

**Celah authz baru**: `GET /v1/leave-requests/{id}` hanya `authenticated` tanpa cek kepemilikan (`transport/http/handler.go:360-366`, `permits.yaml:532`); lama daftar selalu ter-scope.

**Verdict fitur: SEBAGIAN** -- mesin alur, penomoran, verifikasi, dan sinkron presensi lebih kuat, tetapi bukti wajib, penetapan wali kelas saat submit, placeholder identitas siswa, dan kop surat gambar hilang.

---

### Izin keluar / dispensasi (exit permit)

**Referensi lama** (`exit_permit_api.go`, `exit_permit_reports.go`)

1. State: `pending_duty_teacher -> pending_class_teacher -> pending_bk -> pending_leadership -> issued -> exited` (`:340-406`).
2. Buat: hanya siswa; tujuan 1-500; kelas aktif (`FOR UPDATE`); maksimal 1 pengajuan per hari **apa pun statusnya**; tidak boleh ada yang belum `exited`; `end.sort_order > start.sort_order` dan keduanya aktif; snapshot; event (`:25-115`).
3. Tahap 1: QR guru mana pun. Tahap 2: guru berbeda dari tahap 1 dan sedang mengajar kelas itu atau maksimal 2 jadwal berikutnya (`:345-361`, `:438-475`). Tahap 3: duty `grants_exit_bk_approval`. Tahap 4: duty `grants_exit_leadership_approval`; saat `issued`, `gate_token_expires_at = DATE(created_at) + end_period.end_time` (`:365-413`).
4. QR guru: `teacher_qr_tokens` sekali pakai, tanpa konteks instance (`:319-332`).
5. Gate token: hanya pemilik, status `issued`, belum kedaluwarsa; 32 char acak, hash SHA-256 (`:477-529`). Scan: pegawai + `scan_exit_permits`, `FOR UPDATE`, sekali pakai, hapus hash (`:122-195`).
6. Cancel: siswa pemilik, hard delete bila belum `exited` (`:242-293`).
7. Daftar: siswa miliknya; guru dengan permission izin; pegawai scanner (`:197-240`).
8. Laporan DOCX seluruh tahun untuk guru BK dengan kop `leave.letter_header` (`exit_permit_reports.go:23-182`).
9. Notifikasi/WS setiap scan (`:434`).

**Sekarang**

1. State: SAMA (dipetakan). Tahap `duty_teacher -> class_teacher -> counselor -> leadership` (`domain/defaults.go:12-30`); selesai semua tahap = `approved` (= `issued`), gate scan = `completed` (= `exited`) (`service/exitpermit.go:128-141,234`).
2. Buat: SEBAGIAN. Tujuan <= 500 (DB `0042:7`); enrollment aktif (`service/exitpermit.go:39-45`); "tidak boleh ada yang belum exited" via `GetInProgressInstance` status `in_progress|approved` (`service/workflow.go:169-173`) + unique index `ux_workflow_instances_one_exit_permit_per_day` (`migrations/0041:37-39`). Aturan "maksimal 1 per hari termasuk yang sudah exited" HILANG: setelah keluar, siswa bisa mengajukan lagi hari yang sama. Validasi periode: `end.sequence > start.sequence` dan satu template (`:84-97`); cek `is_active` periode tidak ada.
3. Aturan tahap: SAMA. `any_teacher` = guru aktif (`rules.go:64-65`); `teacher_of_class_now` + `lookahead_slots: 2` + `distinct_from` (`defaults.go:19-20`, implementasi `cmd/api/integrations.go:36-71`); `duty:counselor`, `duty:leadership` (`rules.go:83-85`). Perbedaan kecil: tahap 3-4 kini juga wajib berbeda dari semua tahap sebelumnya (`defaults.go:23-28`), lama hanya tahap 2.
4. QR guru: LEBIH BAIK. `scan_tokens` dengan `purpose=approve_stage` dan `context_id` wajib = instance (`handler.go:42-44`, `service/scantoken.go:101-106`); konsumsi atomik (`queries/scan_tokens.sql:6-13`); TTL 30 detik (`domain/scantoken.go:43`). Guru harus menampilkan QR khusus per pengajuan (lama satu QR guru untuk apa pun).
5. Gate token: SAMA + catatan. Hanya subjek (`handler.go:175-179`), status `approved` (`service/exitpermit.go:175-177`), kedaluwarsa akhir periode (`domain/scantoken.go:49-59`). Scan: permission `scan_exit_permits` (`permits.yaml:246`), `FOR UPDATE` + konsumsi atomik, status jadi `completed` (`:211-248`). **Kemungkinan bug zona waktu**: `periodEndsAt = combineDateAndDuration(s.clock.Now(), endPeriod.EndsAt)` memakai `clock.Real.Now()` yang UTC (`platform/clock`), sehingga "13:00" periode dihitung sebagai 13:00 UTC; `from/to` untuk `ForceStatus` di `GateScan` (`:264-266`) juga UTC sementara attendance membandingkan dengan jendela sesi di zona tenant (`attendance/service/force.go:82-88`). Hal serupa pada `rc.date = s.clock.Now()` untuk `teacher_of_class_now` (`rules.go:36`, `integrations.go:46`).
6. Cancel: LEBIH BAIK. Status `cancelled` dengan event, bukan hard delete (`service/workflow.go:320-343`), hanya bila masih `in_progress` (`:328-330`) -- lama boleh cancel saat `issued`, sekarang tidak (`approved` bukan `CanTransition`).
7. Daftar: SEBAGIAN. Hanya `ListMyExitPermits` untuk siswa (`handler.go:105-122`). Antrean untuk guru/BK/security HILANG; `GET /v1/exit-permits/{id}` bisa dibaca semua pengguna terautentikasi tanpa cek pemilik (`handler.go:140-146`, `permits.yaml:166`).
8. Laporan DOCX: HILANG. Query `ListExitPermitsForReport` ada (`queries/exit_permits.sql:26-34`) tetapi tidak masuk `Repository` (`service/repository.go:42-47`) dan tidak dipakai; modul reports hanya punya `permits.leave_requests` (`reports/service/service.go:31`).
9. Notifikasi: LEBIH BAIK. Event ke siswa tiap tahap, ke satpam saat issued, saat exited (`eventbridge.go:67-88`).

**Tambahan di kode baru**: presensi dipaksa `D` hanya pada sesi dalam rentang periode izin (`service/exitpermit.go:262-270`; menutup masalah `docs/11:60`); expiry otomatis akhir hari (`docs/11:63`); tahap dapat dikonfigurasi per tenant.

**Verdict fitur: SEBAGIAN** -- alur persetujuan dan keamanan token setara/lebih baik, tetapi laporan DOCX BK, antrean untuk guru/security, dan batas 1 pengajuan/hari hilang, plus kemungkinan bug UTC pada kedaluwarsa gate token.

---

### Terlambat (late arrival)

**Referensi lama** (`late_arrivals.go`)

1. Scan QR guru pertama membuat `pending_duty_teacher` dengan `duty_teacher_user_id` = guru itu; alasan <= 500, default "Terlambat datang ke sekolah"; kelas aktif wajib (`:156-230`).
2. `late_count` = COUNT record tahun aktif + 1; aksi ke-2/5 `call_parent`, ke-3/6 `send_home` (`:81-90,216-225`).
3. Review piket: hanya oleh `duty_teacher_user_id` itu sendiri dan status `pending_duty_teacher`; validasi `violation_ids` ada di tahun aktif; insert `student_has_violations` dengan notes "Proses masuk terlambat ke-N" (idempoten); `homeroom_reported`; lanjut `pending_leadership` (`:356-402`).
4. Scan wakil kepala: duty `grants_late_arrival_leadership`, harus berbeda dari guru pertama -> `pending_class_teacher` (`:236-255`).
5. Scan guru pengajar: guru yang **pernah** mengajar kelas itu (jadwal apa pun), berbeda dari keduanya -> `completed` (`:256-275`).
6. Antrean guru: hanya `pending_duty_teacher` milik dirinya (`:119-154`).
7. Selama belum `completed`, siswa tidak bisa ditandai hadir; broadcast WS ke semua guru pengajar kelas + pengganti (`:297-354`).
8. Tidak ada mekanisme kedaluwarsa (alur menggantung lintas hari).

**Sekarang**

1. Buka: SAMA. Token `purpose=late_arrival` dikonsumsi (`service/latearrival.go:33-38`), enrollment aktif (`:44-50`), alasan default (`:62-65`), <= 500 (DB `0043:4`), guru pembuka disimpan di payload (`:70`). Satu alur aktif per siswa (`workflow.go:169-173`).
2. Hitungan dan aksi: LEBIH BAIK. Advisory lock + COUNT non-cancelled (`:52-59`, `queries/workflow_instances.sql:35-46`); tabel aksi default sama (`domain/latearrival.go:24-31`) dan bisa dioverride via Config (`service/service.go:123-131`) meski pembacaan `tenant_policies` belum ada.
3. Review piket: SEBAGIAN. Stage `duty_teacher` rule `any_teacher` verifikasi manual (`defaults.go:38-41`); permission `manage_attendance` (duty piket, `permits.yaml:348`). Pembatasan "hanya guru yang QR-nya discan" HILANG -- guru aktif mana pun dengan `manage_attendance` bisa mereview. `violation_ids` hanya disimpan sebagai payload opaque (`:128-136`), tidak divalidasi dan **tidak dikonsumsi** modul discipline (grep `violation_ids` di `modules/discipline` kosong) -- pencatatan pelanggaran HILANG.
4. Scan pimpinan: SAMA. `duty:leadership`, `distinct_from: [duty_teacher]` (`defaults.go:42-45`).
5. Scan guru pengajar: BERBEDA (lebih ketat). `teacher_of_class_now` dengan lookahead 2 (`defaults.go:46-49`), bukan "pernah mengajar kelas itu"; menyelesaikan alur (`:174-189`).
6. Antrean: BERBEDA (regresi scope). `ListLateArrivalsForReview` mengembalikan semua `in_progress` tenant tanpa filter guru/tahap (`queries/late_arrivals.sql:32-37`), dan `GET /v1/late-arrivals/{id}` tanpa cek pemilik (`handler.go:238-244`).
7. Blokir presensi: SAMA. `HasBlockingLateArrival` hanya untuk hari yang sama (`queries/late_arrivals.sql:19-30`) dipasang sebagai `Blocker` (`wire.go:140`, `attendance/service/session.go:221-226`). Broadcast ke guru pengajar HILANG; notifikasi hanya ke wali kelas saat dibuka dan ke siswa saat berubah (`eventbridge.go:89-103`).
8. Kedaluwarsa: LEBIH BAIK. Job tiap 15 menit menutup alur lewat tengah malam zona tenant (`jobs.go:56-66`, `service/expiry.go:17-41`); sesuai `docs/11:63`.

**Tambahan di kode baru**: `GET /late-arrivals/current` untuk siswa (`:232-259`) dan riwayat event per instance.

**Verdict fitur: SEBAGIAN** -- pencatatan pelanggaran saat review dan pembatasan reviewer ke guru yang discan hilang; sisanya setara atau lebih baik.

---

### Ringkasan

| Fitur                    | Verdict  | Gap terpenting                                                                                                         |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| Izin terencana           | SEBAGIAN | Bukti tidak lagi wajib; template bawaan tanpa `nis/address/homeroom_name/issuer_name` dan tanpa kop gambar             |
| Izin keluar / dispensasi | SEBAGIAN | Laporan DOCX BK dan antrean guru/security hilang; kedaluwarsa gate token dihitung di UTC (`service/exitpermit.go:190`) |
| Terlambat                | SEBAGIAN | `violation_ids` tidak divalidasi/dicatat ke discipline; reviewer tidak lagi dibatasi ke guru yang QR-nya discan        |

Perbaikan lintas fitur yang nyata di kode baru: token QR sekali pakai berpurpose dan berkonteks, penomoran surat atomik, cancel/expiry dengan audit trail, presensi dipaksa hanya pada sesi yang tercakup, dan tahap alur dapat dikonfigurasi per tenant. Celah authz yang berulang: endpoint detail `GET .../{instanceId}` untuk ketiga fitur hanya `authenticated` tanpa cek kepemilikan/duty.
---

# Bagian 5

## Perbandingan logika: Disiplin, SP, Konseling (SION lama vs `apps/api/internal/modules/discipline`)

Tidak ada dokumen keputusan yang secara eksplisit membuang fitur di grup ini; `docs/01-analisis-aplikasi-lama.md:59` dan `docs/08-security.md:44-45,67` justru menetapkan arah baru (level SP berpolicy, nomor dari sequence, konseling terenkripsi dengan visibilitas terbatas). `docs/13-etl-sion.md:154` hanya menyatakan konseling lama tidak dimigrasikan.

### Katalog pelanggaran

- Referensi lama (`reference/sion-rebuild-go/backend/cmd/api/academic_scope.go:597-760`): katalog per tahun ajaran (`violations.academic_year_id`), field hanya `name` + `points`, nama unik per tahun (409), hard delete, pencarian nama; hanya untuk tahun aktif.
- Sekarang:
  - Katalog per tenant lintas tahun, `code` unik (upper-cased), `name`, `points >= 0`, `category` default `general`, `is_active`, BERBEDA (bukan per tahun; disengaja per `docs/06-database-schema.md:182,329`), `service/violations.go:23-40`, `migrations/0056_discipline.up.sql:5-13`.
  - Hapus menjadi soft delete + nonaktif, LEBIH BAIK, `queries/violations.sql:19-20`.
  - Tipe nonaktif ditolak saat pencatatan, LEBIH BAIK, `service/violations.go:100-102`.
  - Pencarian nama pada list, HILANG (`queries/violations.sql:1-4` hanya filter aktif/nonaktif).
- Tambahan: permission terpisah `manage_discipline_catalog` (`openapi/modules/discipline.yaml:25,46,69`, `platform/authz/permissions_discipline.go:6`).
- Verdict: LEBIH BAIK, katalog stabil lintas tahun dengan snapshot poin di record, soft delete, kode unik.

### Pencatatan pelanggaran dan poin

- Referensi lama (`student_violations.go`):
  - Pencatat: guru/admin/superadmin atau permission `manage_attendance` (:24-26).
  - Siswa wajib punya penugasan kelas aktif di tahun aktif dan user aktif (:108-122); pelanggaran wajib terdaftar di tahun aktif (:124-134).
  - 1–50 jenis per catatan, unik (:98-106); notes <= 1000 (:93-96); `occurred_date` selalu hari ini (:163); transaksi (:156-181).
  - Poin = SUM poin katalog saat ini (berubah bila katalog diedit) (:136-154).
  - Respons `sp_summary` (previous/new level, `newly_reached`) dan notifikasi ke guru BK bila level naik (:182-196, `violation_warning_letters.go:361-394`; bug: tidak pernah terkirim per inventori 1.17).
  - Tidak ada edit/hapus catatan. Pelanggaran juga dicatat dari presensi (`teacher_attendance.go:802-822`, kolom `attendance_session_id`) dan review terlambat (`late_arrivals.go:380-387`).
- Sekarang:
  - Authz: permission `record_violations`, SAMA (lebih rapi), `discipline.yaml:143,173`.
  - Validasi siswa terdaftar/aktif di tahun aktif, HILANG: `service/violations.go:84-86` hanya cek UUID non-nil; `queries/violations.sql:22-26` tidak cek enrollment (regresi: bisa mencatat ke user bukan siswa / tidak terdaftar).
  - Tipe wajib ada dan aktif, SAMA, `service/violations.go:93-102`.
  - Satu pelanggaran per panggilan (bukan batch 50), BERBEDA, `discipline.yaml:147-158`; notes <= 1000, SAMA, `discipline.yaml:156`, `0056_discipline.up.sql:35`.
  - `occurred_on` diisi klien, tidak dibatasi ke rentang tahun aktif, BERBEDA (lebih fleksibel, kurang validasi), `service/violations.go:84,105`.
  - Poin di-snapshot (`points_snapshot`), LEBIH BAIK, `service/violations.go:81-83,105`; total hanya record tidak di-void, `queries/violations.sql:58-61`.
  - Respons `total_points` + `due_levels` (level yang sudah tercapai tapi belum diterbitkan), LEBIH BAIK dari `sp_summary`, `service/violations.go:73-79,113`, `domain/discipline.go:130-143`.
  - Notifikasi ke BK saat ambang tercapai, HILANG: `RecordViolation` tidak mem-publish event; `wiring/eventbridge.go` hanya menangani `WarningLetterIssued` (:122). (Yang lama juga tidak berfungsi, jadi bukan regresi fungsional, tapi tujuan fiturnya belum ada.)
  - Void dengan alasan wajib, audit `voided_by/voided_at`, tolak void ganda, LEBIH BAIK (lama tidak ada koreksi sama sekali), `service/violations.go:135-155`, `queries/violations.sql:31-34`.
  - Keterkaitan presensi/terlambat: kolom `attendance_session_id`, `workflow_instance_id` ada (`service/violations.go:63-71`), tapi tidak ada pemanggil di luar modul (grep `RecordViolation` di attendance/permits/wiring kosong); `permits/service/latearrival.go:101-133` hanya menyimpan `violation_ids` ke payload dengan komentar "discipline consumes them", konsumen tidak ada. HILANG.
- Tambahan: daftar admin dengan filter kelas/tanggal/void (`queries/violations.sql:43-56`), rekap poin per siswa (`:63-74`), RLS per tenant.
- Verdict: SEBAGIAN, poin snapshot dan void lebih baik, tetapi validasi siswa hilang, batch hilang, dan jalur presensi/terlambat ke pelanggaran belum tersambung.

### Riwayat pelanggaran (tampilan siswa)

- Referensi lama (`student_violation_history.go:99-158`): hanya role siswa; daftar (nama pelanggaran, poin, catatan, tanggal, pencatat) urut tanggal desc; ringkasan `total_points`, `violation_count`, `sp_level`, `next_sp_level`, `points_to_next_level`; ambang SP disertakan.
- Sekarang:
  - `GET /v1/me/discipline` untuk pemanggil sendiri, permission `authenticated`, SAMA, `transport/http/handler.go:194-205`, `discipline.yaml:214-218`.
  - Daftar record + poin + tanggal + catatan, SAMA; nama pencatat, SEBAGIAN (hanya `reporter_user_id`, `handler.go:335-340`).
  - Total poin, policy (ambang), `due_levels`, SAMA; `next_sp_level`/`points_to_next_level`, SEBAGIAN (harus dihitung klien dari `policy.levels`; `service/violations.go:183-206`).
  - Surat SP yang sudah terbit ikut ditampilkan, LEBIH BAIK, `handler.go:202-203`.
- Tambahan: record yang di-void tetap terlihat berlabel `is_voided` (`handler.go:338`).
- Verdict: SAMA, semua informasi tersedia, hanya nama pencatat dan hitungan "menuju level berikutnya" dipindah ke klien.

### Pengaturan ambang SP

- Referensi lama (`student_violation_history.go:11-97,160-224`): per tahun ajaran; default 25/50/75; tepat tiga level; validasi `sp1>0 && sp1<sp2 && sp2<sp3 && sp3<=100000`; GET oleh siswa atau guru BK (guru + `issue_leave_letters`), PUT hanya guru BK; upsert menimpa.
- Sekarang:
  - Default 25/50/75 di-seed saat pertama dibaca, SAMA, `domain/discipline.go:91-97`, `service/service.go:159-174`.
  - Jumlah level bebas (N level, label bebas), level harus 1..n berurutan, min_points naik dan > 0, LEBIH BAIK, `domain/discipline.go:99-114`, test `domain/discipline_test.go:51-67`.
  - Per tenant, bukan per tahun; versi bertambah, riwayat tersimpan di `tenant_policies` (kind `discipline_levels`), BERBEDA (versioned, tetapi tidak bisa beda per tahun; `loadPolicy` selalu ambil versi terakhir tanpa memandang `effective_from`, `queries/cross_module.sql:1-5`).
  - GET `view_discipline`, PUT `manage_settings`, BERBEDA (BK tidak lagi otomatis boleh mengubah), `discipline.yaml:82,94`.
- Verdict: LEBIH BAIK, policy generik berversi; catatan: kehilangan granularitas per tahun.

### Laporan / rekap pelanggaran

- Referensi lama (`violation_reports.go`): hanya guru BK (:31-34); DOCX rekap semua siswa yang punya pelanggaran (nama+kelas, daftar pelanggaran bertanggal, total poin, "Status SP" = tanggal pertama menembus tiap ambang, :152-169, :232-257); DOCX individu per siswa dengan NIS, tabel pencatat, total, tanda tangan Guru BK (:259-281); kop dari pengaturan (:55-60).
- Sekarang:
  - Rekap poin per siswa (nama, total, jumlah record, pelanggaran terakhir) sebagai XLSX lewat modul reports, filter kelas, permission `view_discipline`, SEBAGIAN, `wiring/reports.go:50-76`, `reports/service/service.go:29,62`.
  - Rekap surat SP (nomor, siswa, level, total, tanggal), LEBIH BAIK (lama tidak ada), `wiring/reports.go:78-100`.
  - Tanggal pertama menembus tiap ambang ("Status SP"), HILANG; hanya `LevelFor(total)` saat ini (`domain/discipline.go:117-126`).
  - Laporan individu (DOCX dengan rincian pencatat dan tanda tangan), HILANG; data mentahnya ada di `GET /v1/discipline/students/{id}` (`handler.go:183-192`) tapi tanpa dokumen.
  - Kop surat/branding pada laporan, HILANG (sheet XLSX polos, `reports/service/service.go:123-136`).
- Verdict: SEBAGIAN, rekap tabel ada dalam XLSX, dokumen naratif dan riwayat pencapaian ambang belum ada.

### Surat peringatan (SP1/SP2/SP3)

- Referensi lama (`violation_warning_letters.go`):
  - Status per siswa untuk pencatat (`attained_levels`, `issued_letters`, :85-123); daftar kandidat BK: total >= SP1, filter level, cari nama/NIS/kelas, pagination, surat terbit per siswa (:125-209).
  - Penerbitan hanya BK (:211-215); level dinormalisasi "SP n"; ditolak bila poin belum mencapai level (:248-251); level bisa diterbitkan tanpa urutan (SP2 langsung jika poin cukup); idempoten: bila sudah ada, balas 200 dengan surat lama (:252-257).
  - Nomor: pola konfigurasi `settings.WarningLetterTemplate.NumberPattern` dengan `{{sequence}}` (%03d, COUNT+1, retry 3x), `{{sp_level_number}}`, `{{month_roman}}`, `{{year}}` (:273-296).
  - Snapshot JSON lengkap (siswa, NIS, kelas, entri, template) (:285-287); notifikasi ke siswa (:297).
  - DOCX A4 dari snapshot saat unduh, template teks (judul, penerima, pembuka, isi, harapan, penutup) + tanda tangan 3 kolom Orang Tua/Siswa/Guru BK, kop dari pengaturan (:302-332, :447-503). Tanpa verifikasi.
- Sekarang:
  - Authz `issue_warning_letters` (terbit) / `view_discipline` (lihat/unduh), LEBIH BAIK (tidak lagi menumpang `issue_leave_letters`), `discipline.yaml:254,275,301,317`.
  - Ditolak bila level belum tercapai, SAMA, `service/letters.go:54-56` (`ErrLetterLevelNotDue`, 409 di `httpx/errors_discipline.go:12`).
  - Harus berurutan (SP1 sebelum SP2), BERBEDA (lebih ketat), `service/letters.go:54` (`due[0].Level != level`), `domain/discipline.go:128-143`.
  - Idempoten per level, SAMA secara efek, respons 409 bukan 200+surat lama, `service/letters.go:49-53`, unik DB `0056_discipline.up.sql:66`.
  - Nomor dari sequence DB per tenant/kind/tahun (bukan COUNT+1), LEBIH BAIK, `permits/service/issue_document.go:49-53`; nomor unik di DB `0056:67`.
  - Pola nomor: konstanta `{{seq}}/SP/{{month_roman}}/{{year}}`, SEBAGIAN: tidak dapat dikonfigurasi tenant (selalu `DefaultWarningLetterNumberingTemplate`, `wiring/discipline.go:21`) dan placeholder nomor level `{{sp_level_number}}` tidak tersedia (`permits/domain/document.go:110-118`), tanpa zero-padding.
  - Snapshot pelanggaran yang dihitung (tipe, poin, tanggal, catatan), SEBAGIAN (tanpa NIS/kelas/penerbit; tapi `threshold_points`, `total_points`, `level_label` disimpan di kolom), `service/letters.go:120-136`, `0056:57-64`.
  - Dokumen: PDF dirender saat terbit dari `document_templates` kind `warning_letter` (default tenant) atau HTML bawaan, disimpan ke storage, presigned URL, LEBIH BAIK, `issue_document.go:66-81`, `:117-122`, `service/letters.go:182-191`.
  - Template bawaan: judul, nomor, nama/kelas/wali, tabel pelanggaran, tanggal terbit, kode verifikasi, SEBAGIAN: tidak ada NIS, nama Guru BK penerbit, blok tanda tangan 3 kolom, dan bagian teks (pembuka/harapan/penutup) yang bisa diatur, `service/letters.go:195-211`, vars `:106-113`.
  - Verifikasi: kode verifikasi hash + `issued_documents`, resolusi publik `GET /v1/documents/verify/{code}`, LEBIH BAIK (lama tidak ada), `issue_document.go:54,64,82-88`, `openapi/modules/permits.yaml:670`.
  - Notifikasi: siswa + wali kelas (via event `discipline.warning_letter.issued`), LEBIH BAIK, `service/letters.go:91-96`, `wiring/eventbridge.go:122-130`. Orang tua tidak termasuk meski komentar di `letters.go:13-14` menyebutnya.
  - Daftar kandidat SP (>= SP1, filter level, cari, surat terbit), SEBAGIAN: yang ada `ListPointTotals` (urut total, filter kelas, limit) tanpa filter ambang/pencarian/status terbit, `service/violations.go:208-222`; `due_levels` hanya per siswa (`StudentSummary`).
  - Surat dalam transaksi bersama nomor dan asset (lama tanpa transaksi), LEBIH BAIK, `service/letters.go:36-87`.
- Tambahan: daftar surat tahun berjalan dengan filter kelas (`queries/letters.sql:15-22`), laporan XLSX surat, `has_document` di respons, wiring nyata di `cmd/api/wire.go:153-156`.
- Verdict: LEBIH BAIK, penomoran, verifikasi, penyimpanan PDF dan transaksi jauh lebih kuat; gap: pola nomor tidak bisa diatur/tanpa nomor level, template bawaan tanpa tanda tangan/NIS, tidak ada layar kandidat.

### Konseling

- Referensi lama (`counseling.go`):
  - Semua route hanya guru BK (guru + `issue_leave_letters`) (:60-70); semua BK melihat semua catatan (:232-360) dengan filter jenis/siswa, pencarian judul/catatan/nama, pagination.
  - Jenis topik: karir, permasalahan (default), pribadi, belajar, sosial, lainnya (:510-512, :878-898); field per jenis `career_goals`, `problem_description`, `notes` (:900-947).
  - Wajib: siswa, judul, rencana tindak lanjut (:502-516); tanggal fleksibel default sekarang (:525-534).
  - Update oleh BK mana pun (:562-637); hapus hanya pemilik atau admin (:663-666).
  - Bukti foto <= 10 MB, dikonversi WebP, disajikan lewat endpoint terautentikasi BK/admin (:774-853); laporan cetak HTML A4 dengan tanda tangan Siswa/Guru BK (:427-479, :949-1001).
  - Isi tersimpan plaintext; error SQL bocor (inventori 1.18).
- Sekarang:
  - Authz permission `manage_counseling` untuk semua route, SAMA, `discipline.yaml:338-429`.
  - Isi dan rencana tindak lanjut dienkripsi AES-GCM dengan `content_key_id`, LEBIH BAIK (sesuai `docs/08-security.md:44`), `service/counseling.go:45-69`, `0056:86-87`.
  - Visibilitas `counselor` (default, hanya penulis) / `bk_team` (duty `counselor`) / `leadership` (duty `counselor`+`leadership`), LEBIH BAIK/BERBEDA: default lebih ketat daripada lama (BK lain tidak bisa membaca kecuali penulis memilih `bk_team`), `domain/discipline.go:205-217`, `service/counseling.go:33-43`, `handler.go:259-263`.
  - Jenis: `individual/group/parent/referral` (format sesi) menggantikan jenis topik; field `career_goals`/`problem_description` dan seksi laporan per jenis, HILANG/BERBEDA, `domain/discipline.go:145-160`, `0056:83`.
  - Wajib: siswa, waktu sesi, jenis, judul, isi; rencana tindak lanjut opsional, BERBEDA (lama justru wajib), `service/counseling.go:23-31`, `discipline.yaml:547`.
  - Update dan hapus hanya penulis (admin pun tidak bisa), BERBEDA (lebih ketat), `service/counseling.go:115,230`.
  - Daftar: hanya milik sendiri (`ListMyCounselings`) atau per siswa dengan saringan visibilitas, SEBAGIAN: filter jenis dan pencarian teks hilang (isi terenkripsi, pencarian memang tidak mungkin), `service/counseling.go:163-219`.
  - Bukti foto, HILANG: tabel `counseling_attachments` ada (`0056:102-114`) tetapi tidak ada query/service/route (grep kosong di luar migrasi/gen).
  - Laporan cetak, HILANG: tidak ada `TemplateKind` konseling di `permits/domain/document.go:20-27` maupun pemanggil renderer.
  - Validasi siswa terdaftar, HILANG (sama seperti pencatatan pelanggaran; `service/counseling.go:24` hanya cek UUID).
- Tambahan: batas panjang isi 20000/5000 (`discipline.yaml:553-554`), RLS tenant, tidak ada kebocoran error SQL (`handler.go:40-51`).
- Verdict: SEBAGIAN, privasi jauh lebih baik (enkripsi + visibilitas), tetapi bukti foto, laporan cetak, jenis topik, dan daftar lintas-BK belum ada.

### Ringkasan

| Fitur                         | Verdict    | Gap terpenting                                                                                                                                 |
| ----------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Katalog pelanggaran           | LEBIH BAIK | Pencarian nama pada list katalog hilang                                                                                                        |
| Pencatatan pelanggaran & poin | SEBAGIAN   | Tidak ada validasi siswa terdaftar/aktif; jalur presensi dan terlambat tidak menulis pelanggaran; tidak ada notifikasi BK saat ambang tercapai |
| Riwayat siswa                 | SAMA       | Nama pencatat dan "poin menuju level berikutnya" harus dihitung klien                                                                          |
| Pengaturan ambang SP          | LEBIH BAIK | Policy per tenant, tidak per tahun ajaran; BK butuh `manage_settings` untuk mengubah                                                           |
| Laporan / rekap               | SEBAGIAN   | Laporan individu DOCX dan tanggal pertama menembus ambang tidak ada                                                                            |
| Surat peringatan              | LEBIH BAIK | Pola nomor tidak bisa diatur dan tanpa nomor level; template bawaan tanpa NIS/tanda tangan; tidak ada daftar kandidat SP                       |
| Konseling                     | SEBAGIAN   | Bukti foto (tabel ada, route tidak), laporan cetak, dan jenis/seksi per topik hilang; default visibilitas mengunci BK lain                     |

---

# Bagian 6

## Perbandingan logika: GRADING, ANNOUNCEMENTS, NOTIFICATIONS/PUSH, REALTIME, PRESENCE/MONITORING, DASHBOARD

Catatan umum: kode baru memakai River (bukan outbox sendiri), RLS per tenant, `term_id`, dan permission-based authz. Perubahan itu disengaja per `docs/06-database-schema.md` sec. 9-10 dan `docs/02-system-design.md` sec. 4.7. Di bawah ini hanya perbedaan aturan bisnis yang saya nilai.

---

### Penilaian (grading)

**Referensi lama** (`grading.go`, `grading_extended.go`):

1. Guard `modules.grading_enabled` (app_settings) + `manage_grades` hanya role Guru, `view_own_grades` hanya Siswa (grading.go:52-70).
2. Guru wajib punya penugasan aktif kelas+mapel untuk SEMUA operasi baca/tulis (`teacherOwnsGradingContext`, :97-101; dipakai di list/report/ranges/tp/stars/publication).
3. Komponen: code uppercase <= 30, deskripsi <= 500, tipe `tp|sumatif|praktik|lainnya`, weight 0-100, kktp 0-100 (:153-175); code unik -> 409; tidak bisa hapus bila sudah ada nilai (:239-244).
4. Nilai 0-100; siswa harus anggota kelas aktif (`classStudentSet`, :325-347); score `null` = hapus nilai (:341-342).
5. Nilai akhir = rata-rata berbobot komponen yang punya nilai; `final_kktp` serupa (:394-419).
6. Publikasi per (guru, kelas, mapel); siswa hanya lihat yang dipublikasikan (:427-508).
7. Analisis rapor: bila `previous > 0`, cari rentang yang memuat nilai murni, `automatic = min(previous + increase, 100)`, selain itu `automatic = pure`; `final = manual ?? automatic`; warning `danger` bila turun dari previous, `warning` bila |final-pure| > 10 (grading_extended.go:256-330).
8. Rentang per (guru, mapel): min>=0, max<=100, increase 0-10, tidak tumpang tindih, replace-all (:96-152).
9. Pemetaan TP -> kode ekspor dengan rentang R/T; hanya komponen tipe `tp`, export_code unik (:188-246). Ekspor XLSX sheet e-Rapor: No/NIS/Nama/Nilai Rapor/<kode TP: T|R>/Validasi + dropdown T/R (:421-485).
10. Bintang: amount 1-999, note <= 255, per (guru, kelas, mapel), siswa harus anggota kelas; pengurangan LIFO `FOR UPDATE` tanpa guard total >= 0 (:539-638); `my-stars` hanya event `visible_to_student`, dikelompokkan per mapel/guru (:640-669).

**Sekarang:**

- (1) Flag modul: HILANG. `ModuleGrading` ada di konsol platform (`apps/api/internal/modules/platform/domain/platform.go:81`) tetapi modul grading tidak pernah memanggil `IsModuleEnabled` (hanya billing/visitors/mentoring/supervision yang memakainya). Guard role diganti permission `manage_grades`/`view_own_grades` (`openapi/openapi.yaml:4776-5308`) plus bypass `manage_master_data` untuk staf kurikulum (`grading/transport/http/handler.go:41-50`): LEBIH BAIK.
- (2) Scope penugasan: SEBAGIAN (regresi). `requireTeaches` dipakai untuk create/update/delete komponen, simpan nilai, manual score, publikasi, e-Rapor (`service/gradebook.go:85,111,131,156`; `service/reports.go:147,176`; `service/erapor.go:141-159`). Tetapi `Gradebook` (`gradebook.go:38-57`) TIDAK memeriksa penugasan: siapa pun dengan `manage_grades` bisa membaca gradebook kelas/mapel mana pun. `GiveStar`, `StarLedger`, `ClassStarBalances`, `ListGradeRanges` juga tanpa cek scope (`reports.go:366-426`).
- (3) Komponen: BERBEDA. Validasi service hanya code non-kosong, kind valid, weight > 0 (`gradebook.go:72,99`); batas code <= 32 dan deskripsi <= 500 ada di DB (`migrations/0057_grading.up.sql:10,12`); tidak ada batas atas weight dan tidak ada validasi kktp. Kind diganti `formative|summative|project|practical|attitude|other` (`domain/grading.go:27-36`). Code unik -> `ErrComponentCodeExists` (`repository/repository.go:72`): SAMA. Guard "sudah ada nilai": HILANG; `DeleteComponent` (`gradebook.go:122-136`) langsung hapus dan `grades.component_id ... on delete cascade` (`0057:33`) ikut menghapus nilai siswa.
- (4) Nilai: BERBEDA. Rentang mengikuti skala tenant (`gradebook.go:164-166`), dibulatkan `scale.Round`; TIDAK ada cek keanggotaan kelas (siapa pun bisa dinilai di komponen itu); tidak ada mekanisme hapus nilai (score wajib).
- (5) Rata-rata berbobot: SAMA (`domain/grading.go:104-118`). `final_kktp`: tidak ditemukan (HILANG, kecil).
- (6) Publikasi: LEBIH BAIK. Per (tahun, term, kelas, mapel) (`0057:61`), publish memicu recompute (`reports.go:183-187`); siswa hanya lihat mapel terpublikasi (`reports.go:289`).
- (7) Analisis rapor: BERBEDA (regresi). `domain.ReportScore` (`domain/grading.go:135-147`): `final = raw + min(increase, scale.IncreaseMax)` lalu `max(final, previous)` lalu clamp. Lama: `previous + increase` (bukan `raw + increase`), dan hanya bila `previous > 0`. Warning danger/warning: tidak ditemukan. Manual score: `SetManualReportScore` set `final = coalesce(manual, final)` (`queries/reports.sql:10-13`), tetapi `UpsertReportScore` saat recompute menulis `final_score = excluded.final_score` (nilai hitung) sambil mempertahankan `manual_score` (`reports.sql:1-8`) sehingga override manual hilang dari `final_score` begitu ada nilai baru disimpan atau dipublikasikan; menghapus manual (null) juga membiarkan `final_score` tetap nilai manual lama. Klaim komentar "override wins until cleared" (`reports.go:134-135`) tidak terpenuhi.
- (8) Rentang: BERBEDA. Per tahun, opsional per mapel dan/atau guru (`reports.sql:25-38`, `reports.go:93-109`), create/delete satuan; validasi hanya `min<=max`, `increase>=0` (`reports.go:334`); tanpa cek tumpang tindih (yang dipakai: match pertama, `domain/grading.go:137-141`); batas kenaikan dari `scale.IncreaseMax` (default 5, `domain/grading.go:80`). Hak buat/hapus: `manage_settings` (admin), bukan guru (`openapi.yaml` create/deleteGradeRange).
- (9) TP mapping: HILANG. Tabel dan query ada (`0057:109-115`, `reports.sql:43-51`) tetapi tidak ada service/handler yang memakainya (grep `TPMapping` di `.go` grading: nol). Ekspor e-Rapor diganti format lain: baris NISN/kode mapel/nilai/predikat A-D per siswa per mapel untuk seluruh kelas, plus daftar "Dilewati" (`domain/erapor.go:61-103`, `service/erapor.go:210-332`), XLSX atau CSV, hanya mapel terpublikasi. Kolom T/R dan "Validasi" tidak ada. `docs/12-roadmap.md:26` hanya menyebut "ekspor e-Rapor" tanpa memutuskan format, jadi ini keputusan implementasi, bukan penghapusan yang didokumentasikan.
- (10) Bintang: SEBAGIAN. Ledger delta +/- dengan saldo >= 0 ditegakkan (`domain/grading.go:165-174`, `reports.go:376-383`): LEBIH BAIK dari LIFO tanpa guard. Tetapi: tanpa batas 1-999, tanpa cek siswa anggota kelas, tanpa cek guru mengajar; advisory lock per siswa yang diminta `docs/06` sec. 9 tidak ada (cek saldo lalu insert dalam tx tanpa lock -> dua pengurangan paralel bisa membuat saldo negatif). `MyGrades.Stars` memakai `StarBalance` yang menjumlahkan SEMUA event termasuk `visible_to_student=false` (`reports.sql:58-60`): regresi privasi. Endpoint `my-stars` per mapel/guru: tidak ditemukan (`GetStarLedger` butuh `manage_grades`).

**Tambahan di kode baru:** skala penilaian per tenant dengan versi (`service.go:182-233`); term/semester; pembulatan `round_decimal`; e-Rapor preview + laporan skip per baris + CSV; `PreviousTerm` untuk analytics; unit test domain.

**Verdict fitur: SEBAGIAN.** Fondasi (term, skala, ledger, publikasi) lebih baik, tetapi lima aturan penting hilang/regresi: scope guru pada gradebook dan bintang, guard hapus komponen bernilai, semantik kenaikan rapor + override manual, TP mapping/format e-Rapor, dan flag modul.

---

### Pengumuman (announcements)

**Referensi lama** (`announcements.go`):

1. Judul <= 180, pesan <= 500, audience `global|selected`, ID unik, `selected` wajib >= 1, maks 5.000 penerima (:110-132).
2. Fan-out `INSERT ... SELECT` ke `notifications` hanya user aktif, dalam transaksi; 0 penerima -> 400; `recipient_count` (:141-169).
3. List: pencarian judul/pesan/pengirim, page_size <= 100, `read_count` dari `notifications.read_at` (:18-63).
4. Endpoint pemilih penerima `/api/announcement-recipients` (:66-102).
5. Hapus keras tanpa cek pemilik (:178-190). Permission `create_announcements`, `delete_announcements`.

**Sekarang:**

- (1) LEBIH BAIK/BERBEDA. Judul <= 180 SAMA; body HTML <= 20.000 disanitasi bluemonday, plus body_text (`service/content.go:33-52`). Audience `all|roles|classes|users` dengan validasi list tidak kosong (`domain/announcement.go:42-62`), ID user divalidasi milik tenant (`queries/audience.sql:21-23`), dedupe (`service/audience.go:121-132`). Cap 5.000: HILANG (kecil).
- (2) SAMA/LEBIH BAIK. `publishLocked` (`service/announcements.go:128-155`): resolve audience saat publish, `ErrAudienceEmpty` bila kosong, set status + recipient_count, lalu `Notifier` dalam tx yang sama -> `notifications.Notify` (`wiring/announcements.go:19-30`, body dipotong 160 rune, href `/announcements/{id}`, kind `announcement_published`).
- (3) SEBAGIAN. List admin cursor + filter status, limit default 20 maks 100 (`service/service.go:83-132`); pencarian: HILANG. `read_count` sekarang dari tabel `announcement_reads` eksplisit (`service/announcements.go:60-75,269-280`), bukan dari notifikasi dibaca: BERBEDA (lebih akurat, tetapi butuh klien memanggil mark-read).
- (4) Endpoint pemilih penerima: tidak ditemukan (asumsi pakai list user identity).
- (5) Hapus jadi soft delete (`queries/announcements.sql:24-25`); notifikasi yang sudah terkirim tetap ada. Permission dipecah view/create/edit/delete/publish (`openapi.yaml:2741-2934`): LEBIH BAIK.

**Tambahan:** lifecycle draft/scheduled/published/archived, edit hanya draft/scheduled (`domain:83-85`), jadwal publish job tiap menit per tenant (`module.go:44-74`, `service:197-225`), window `starts_at/ends_at`, pinned, feed pembaca dengan `is_read` dan filter audience saat baca berdasarkan keanggotaan saat ini (`service/audience.go:38-119`). Ini memenuhi `docs/11-feature-recommendations.md` #16.

**Verdict fitur: LEBIH BAIK.** Semua aturan lama tercakup kecuali pencarian daftar dan pemilih penerima (keduanya fitur UI, bukan aturan bisnis).

---

### Notifikasi + Web Push + APNs

**Referensi lama** (`notifications.go`, `apns.go`):

1. List page <= 100, filter status, search; read/read-all (:338-344).
2. Subscribe web push: https saja, host whitelist FCM/Mozilla/Apple/WNS, p256dh+auth wajib, id = sha256(endpoint), expiry = max(exp token, 180 hari) (:259-319). Device token iOS: platform `ios`, token <= 255 (apns.go:230-263). Logout menghapus semua subscription user (main.go:825).
3. Worker: tick 3 s + wake, 20 pesan/putaran, klaim lock 2 menit, backoff `1<<min(attempts,8)` detik, menyerah setelah 8 (:78-174). Maintenance tiap jam: subscription kedaluwarsa atau `failure>=10` idle 30 hari, outbox > 7 hari, notifikasi dibaca > 180 hari (:102-107).
4. Web push TTL 3600, urgency high, `Topic` = hash jenis; 410/404 hapus; sukses reset failure (:216-237).
5. APNs token .p8, sandbox/prod, badge = jumlah belum dibaca, sound default, payload href/type/id; 410 atau reason BadDeviceToken/Unregistered/ExpiredToken -> hapus (:193-213, apns.go:158-208).
6. Setiap notifikasi juga dikirim realtime `notification_created` dengan payload id/type/title/message/href (:159).
7. Jenis: leave_review, leave_status, leave_issued, announcement, teacher_substitution_*, warning_letter_issued, student_sp_reached.

**Sekarang:**

- (1) SEBAGIAN. Cursor, limit maks 100, `unread_only` (`service/inbox.go:18-46`); search dan filter status lain: HILANG. Read/read-all SAMA; unread count tambahan.
- (2) SEBAGIAN (regresi keamanan kecil). Register `web|ios|android`, web wajib p256dh+auth (`transport/http/handler.go:173-196`), upsert by `endpoint_hash` (`queries/push_devices.sql:1-13`), TTL tetap 180 hari (`service/push_devices.go:15`). Whitelist host endpoint web push: tidak ditemukan (endpoint sembarang URL diterima -> server bisa dipakai memukul host arbitrer). Hapus device saat logout: tidak ditemukan (`identity/service/auth.go:227-231` hanya revoke sesi).
- (3) BERBEDA (disengaja, `docs/06` sec. 10 "tidak ada outbox buatan sendiri"). Satu River job per device/channel dalam tx yang sama dengan inbox (`service/notify.go:25-50,121-140`), `MaxAttempts 8` (`notify.go:18`) SAMA, backoff default River (eksponensial). Maintenance: notifikasi dibaca > 180 hari SAMA, deliveries > 90 hari, device kedaluwarsa atau `failure>=5` (lebih ketat dari 10+30 hari) (`service/retention.go:12-64`), jadwal prune 6 jam/retensi 24 jam (`transport/jobs/register.go:56-74`).
- (4) SAMA kecuali `Topic`. `notify/webpush.go:55-74`: TTL 3600, urgency high, 404/410 -> `ErrDeviceGone` -> hapus (`transport/jobs/deliver.go:57-60`), failure++ dan reset saat sukses (`deliver.go:50,62`). Topic (collapse key per jenis): HILANG.
- (5) SEBAGIAN. `notify/apns.go:35-81` via apns2 token .p8, sandbox/prod, sound default, Unregistered/BadDeviceToken -> gone; `ExpiredToken` tidak ditangani sebagai gone; badge unread: HILANG; payload tanpa `type`/`id`.
- (6) SEBAGIAN. `notification_created` dipublikasikan ke topic `user:<tenant>:<user>` (`notify.go:89-92`, `cmd/api/integrations.go:118-128`) hanya bila channel inapp aktif (default aktif); payload id/title/body/href tanpa `kind`.
- (7) SAMA/LEBIH BAIK. Kind di `domain/notification.go:19-32`; jembatan event `wiring/eventbridge.go` mengisi penerima (wali kelas, BK, keamanan) dari duty. `student_sp_reached` tidak ada padanannya (kemungkinan tercakup `warning_letter_issued`).

**Tambahan:** preferensi per kind x channel dengan default tenant (`domain/preferences.go:23-38`), quiet hours menunda push/WA (`notify.go:113-119`), digest email harian (`service/digest.go`), channel email SMTP dan WhatsApp (Meta/gateway, template per tenant, webhook status, backoff 30 s..1 jam `domain/whatsapp_retry.go`), FCM Android (`notify/fcm.go`), log `message_deliveries` per percobaan, partisi bulanan notifikasi. Ini `docs/11` #4.

**Verdict fitur: LEBIH BAIK.** Cakupan channel dan preferensi jauh lebih luas; gap yang perlu ditutup: whitelist endpoint web push, badge APNs, `kind` di payload realtime, pencarian inbox, hapus device saat logout.

---

### Realtime (websocket hub)

**Referensi lama** (`realtime.go`):

1. Auth via subprotocol `sion-auth.<jwt>`, HS256, user harus ada, bila `single_device` aktif `active_session_id` harus cocok (:189-223).
2. Origin: `APP_ORIGINS` exact match, atau loopback/host sama bila tidak dikonfigurasi; Origin kosong ditolak (:151-178).
3. Hub per user + Redis pub-sub `sion:realtime:user-events` dengan dedupe `envelope.Source != h.source` (:104-142).
4. Ping 30 s, read deadline 75 s, read limit 4096 (:232-255).
5. Event: notification_created, classroom_entry_scanned, late_arrival__, exit_permit_scanned (dengan tahap `scanned_by`), teacher_substitution__, presence_*, monitoring_ready/update.

**Sekarang:**

- (1) BERBEDA (regresi). `cmd/api/ws.go:41-65`: token dari header `Authorization` atau subprotocol `bearer.<token>` (`platform/realtime/http.go:21-32`), diverifikasi `VerifyAccessToken` saja + cocok tenant. Tidak ada cek revokasi sesi/single-device: socket tetap hidup sampai access token kedaluwarsa setelah logout/revoke.
- (2) BERBEDA. `http.go:39-51`: allowlist exact dari config; Origin kosong DIIZINKAN (klien native); tanpa fallback loopback. Wajar untuk mobile, tetapi lebih longgar dari lama untuk non-browser.
- (3) SEBAGIAN (bug). Hub topic generik (`hub.go:51-122`) + `RedisBroadcaster` (`redis.go:24-44`). `Publish` mengirim lokal (`hub.go:103`) lalu broadcast (`:105-107`), dan `watchRemote` (`:84-92`) mengirim ulang SEMUA pesan termasuk milik proses sendiri (`redis.go:28` "including this one"). Tanpa dedupe source -> di mode multi-replika klien lokal menerima pesan dua kali.
- (4) SAMA/LEBIH BAIK. `client.go:13-26`: ping 30 s, pong 75 s, limit 4096, write deadline 10 s, outbox 32 lalu drop klien lambat.
- (5) SEBAGIAN. Hanya `notification_created` (`integrations.go:118-128`) dan `MonitorUpdate` ke `monitor:<tenant>` (`attendance/service/entries.go:182`). Payload realtime spesifik scan/izin keluar (`scanned_by` per tahap) dan substitution: tidak ditemukan; informasi itu kini hanya sampai sebagai notifikasi inbox lewat event bridge.

**Tambahan:** topic-based hub reusable, test integrasi websocket nyata (`hub_test.go`), `Presence` + `RedisPresenceStore` (belum dipakai, lihat bawah).

**Verdict fitur: SEBAGIAN.** Infrastruktur rapi, tetapi ada bug duplikasi multi-replika, cek sesi hilang, dan event realtime kaya (scan/izin) belum dipetakan.

---

### Presence / Monitoring

**Referensi lama** (`monitoring.go`, presence di `realtime.go`/`admin_dashboard.go`):

1. `/api/monitoring` dan WS `/api/realtime/monitoring` publik; `monitoring.display_token` opsional, bila kosong akses terbuka; constant-time compare (:54-82).
2. Snapshot: tahun aktif, tanggal, hari, `current_period` (nama, jam), ringkasan H/I/S/A/D dari sesi tersubmit hari ini, kartu per jadwal berjalan (kelas, mapel, guru, periode, jam, pengganti diterima, submitted_at) + kartu "no-schedule" untuk kelas tanpa jadwal, diurutkan nama kelas (:152-301). WS kirim `monitoring_ready` saat connect, `monitoring_update` saat presensi berubah (:130-149).
3. Presence: heartbeat per user, TTL 90 s, in-memory + Redis ZSET/HASH, snapshot total dan per role.

**Sekarang:**

- (1) LEBIH KETAT. `attendance/transport/http/monitor.go:13-18` dan `cmd/api/ws.go:84-99`: token WAJIB dikonfigurasi dan cocok (constant-time); bila belum diset -> 401 (lama: terbuka). Sesuai `docs/07-ui-ux.md:53` "token tampilan".
- (2) SEBAGIAN. `attendance/service/monitor.go:28-66`: kartu kelas/mapel/guru + status `not_started|in_progress|submitted` untuk periode berjalan; hitungan status dari `daily_summary` (bukan entri sesi). Hilang: `current_period`, jam periode, nama pengganti, kartu kelas tanpa jadwal, tanggal/hari. WS monitor tidak mengirim snapshot awal saat connect (`ws.go:102-105`); `MonitorUpdate` saat submit ada.
- (3) HILANG. `realtime.Presence` (`hub.go:138-195`) dan `RedisPresenceStore` ada, tetapi tidak ada pemanggil `Heartbeat` (`attendance/module.go:51-55` mengakui ini). `GET /v1/monitor/presence` (`monitor.go:28-36`) hanya menghitung socket terbuka di topic monitor (`module.go:58-64`), bukan pengguna online per role.

**Tambahan:** permission `view_monitor_presence`; monitor terikat tenant dan timezone tenant.

**Verdict fitur: SEBAGIAN.** Monitor inti ada dan lebih aman, tetapi detail kartu berkurang dan presence per role belum diimplementasikan.

---

### Dashboard (user + admin)

**Referensi lama** (`main.go:828-1937`, `admin_dashboard.go`):

1. `GET /api/dashboard`: judul/ringkasan per role, lokasi, `has_homeroom_class`, periode berjalan (guru/siswa), jadwal hari ini (siswa), quick actions, metrik per role dari DB (user aktif, siswa berkelas, guru terjadwal, pengumuman 30 hari, kelas hari ini, presensi tersubmit, jurnal 7 hari, izin aktif, pinjaman buku), timeline 3 notifikasi terakhir.
2. `GET /api/admin-dashboard` (Admin/SuperAdmin): total user aktif per jenis, antrean pending (izin, izin keluar, terlambat), presence online per role, histogram login per jam 7 hari dari `user_login_events`.

**Sekarang:**

- (1) BERBEDA (disengaja). Tidak ada endpoint dashboard di `openapi/openapi.yaml` (hanya permission `view_dashboard`, `authz/permissions.go:16`). Beranda dirakit di klien: `apps/web/features/dashboard/components/dashboard-view.tsx:11-55` menggabungkan sesi hari ini, antrean terlambat, antrean review izin, unread count, feed pengumuman, gated per permission. Ini sesuai `docs/07-ui-ux.md:46` ("Beranda per peran: kartu sekarang, antrean tugas, ringkasan angka, pengumuman") dan `:96` yang membuang salam per jam, cuaca, dan metrik dummy. Metrik angka per role (jurnal 7 hari, pinjaman buku, dsb.) dan timeline: tidak ada padanan server, tergantung klien.
- (2) HILANG. Tidak ada endpoint agregat admin. Tidak ada tabel login event (hanya `users.last_login_at`, `migrations/0002_identity.up.sql:11`), jadi histogram login tidak bisa dibuat. Presence per role: HILANG (lihat atas). Pengganti parsial: konsol platform untuk superadmin memberi `user_count`, tahun aktif, `last_activity` dari audit_logs per tenant (`platform/queries/platform.sql:10-17`), dan modul analytics memberi siswa berisiko (`analytics/transport/http/handler.go:45-60`), bukan ringkasan operasional harian.

**Verdict fitur: SEBAGIAN.** Beranda pengguna dipindah ke komposisi klien sesuai docs; dashboard operasional admin (jumlah user per jenis, antrean pending, online, histogram login) belum ada penggantinya.

---

### Ringkasan

| Fitur                    | Verdict    | Gap terpenting                                                                                                                                                                        |
| ------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Penilaian                | SEBAGIAN   | Override manual hilang saat recompute (`reports.sql:1-8`) dan `Gradebook`/bintang tanpa cek scope guru (`gradebook.go:38`, `reports.go:366`); TP mapping dan flag modul tidak dipakai |
| Pengumuman               | LEBIH BAIK | Pencarian daftar dan pemilih penerima hilang (fitur UI)                                                                                                                               |
| Notifikasi + Push + APNs | LEBIH BAIK | Whitelist host endpoint web push hilang; badge APNs dan `kind` di payload realtime hilang; device tidak dihapus saat logout                                                           |
| Realtime                 | SEBAGIAN   | Duplikasi pesan di multi-replika (`hub.go:84-107` tanpa dedupe source); WS tidak cek revokasi sesi (`ws.go:48`)                                                                       |
| Presence / Monitoring    | SEBAGIAN   | Presence per role tidak diimplementasikan (`attendance/module.go:51-64`); kartu monitor kehilangan periode, pengganti, kelas tanpa jadwal                                             |
| Dashboard                | SEBAGIAN   | Admin dashboard (user per jenis, antrean pending, online, histogram login) tidak ada penggantinya; beranda user sengaja dirakit klien per `docs/07`                                   |

---

# Bagian 7

## Perbandingan logika: Perpustakaan bagian 1 (sirkulasi, anggota, kartu, pinjaman saya, kunjungan, pengaturan, OPAC, route)

Ringkasan konteks: modul lama (`reference/sion-rebuild-go/backend/cmd/api/library_*.go`) adalah port INLISLite dengan ~110 route; modul baru (`apps/api/internal/modules/library`, 2.167 baris + migrasi `0062_library.up.sql`) adalah model yang jauh lebih kecil: `library_titles`, `library_copies`, `library_loans`, `library_reservations`, `library_stocktakes`, `library_policies`. Tidak ada tabel anggota, jenis anggota, pelanggaran, kunjungan, hari libur, maupun aturan pinjam. `docs/12-roadmap.md:114` menyatakan perpustakaan "Selesai", tetapi `docs/12-roadmap.md:136` mengakui kartu/label baru PDF teks tanpa barcode. Tidak ada dokumen yang menyatakan fitur di bawah sengaja dibuang; `docs/06-database-schema.md:246-248` justru merencanakan `library_members`, `library_member_types`, `library_loan_rules`, `library_fines`, `library_visits`, `library_read_in_place` yang belum ada di migrasi.

---

### Sirkulasi: peminjaman (v1)

- Referensi lama (`library_circulation.go`):
  - Identifier anggota fleksibel: member_no, username, NIS, atau user_id (`library_members.go:350-382`); auto-register anggota bila `auto_register_members` (`:606-615`).
  - Kelayakan (`:369-403`): status anggota harus `aktif` (suspend lewat tanggal dianggap aktif), `valid_until` belum lewat, tidak ada denda `belum_lunas` bila `block_loans_with_unpaid_fines`, eksemplar `access=dapat_dipinjam` dan `status=tersedia` (atau `dipesan` oleh anggota yang sama), aturan pinjam mengizinkan, kuota `activeLoanCount < maxItems`.
  - Batas: prioritas aturan pinjam aktif berjangka > `library_material_types.max_*` > jenis anggota (`:296-346`).
  - Jatuh tempo = hari kerja (lewati Sabtu/Minggu sesuai setting + `library_holidays`) (`library_common.go:244-265`).
  - Batch banyak kode dalam satu transaksi, `FOR UPDATE`, hasil `{loan, rejected[]}`; 409 bila semua gagal (`:669-763`).
  - Menyimpan `channel` (desk/self_service/mobile), tahun ajaran aktif, operator, catatan, `library_item_events`; booking `siap_diambil` milik anggota otomatis `dipenuhi` (`:737-742`).
- Sekarang:
  - Eksemplar harus `available`: SAMA, `domain/library.go:92-100`, `domain/policy.go:74-82`.
  - Kuota pinjam aktif: SEBAGIAN, satu angka tenant `MaxActiveLoans` (`service/loans.go:35-41`), bukan per jenis anggota/bahan/aturan berjangka.
  - Satu pinjaman aktif per eksemplar dijamin skema: SAMA, `migrations/0062_library.up.sql:93-96` (`active_copy_id` unique) dan pemetaan ke `ErrCopyOnLoan` di `repository/loans.go:23-25`.
  - Jatuh tempo: BERBEDA (regresi), `policy.DueDate` = `AddDate(0,0,LoanDays)` kalender (`domain/policy.go:44-46`); tidak ada hari libur/akhir pekan. `docs/06-database-schema.md:246` merencanakan `library_holidays` digabung ke `academic_calendar_events`, tetapi modul tidak membacanya.
  - Status anggota / masa berlaku / suspend: HILANG, tidak ada entitas anggota; `MemberUserID` hanya UUID user (`service/loans.go:13-17`).
  - Blokir bila denda belum lunas: HILANG, komentar `domain/policy.go:70-73` menyerahkan ke pemanggil, tetapi `Borrow` tidak memuat denda.
  - Eksemplar `dipesan` boleh dipinjam pemesannya: HILANG (regresi), `CanBorrow` menolak semua status selain `available` (`domain/library.go:93-98`), sedangkan `Return` menyetel `reserved` untuk pemesan berikutnya (`service/loans.go:100`). Eksemplar `reserved` tidak bisa dipinjam siapa pun dan `FulfillReservation` tidak pernah dipanggil dari service (hanya dideklarasikan `service/service.go:59`).
  - Batch kode + laporan `rejected`: HILANG, satu barcode per panggilan (`transport/http/loans.go:11-20`).
  - Auto-register, resolusi member_no/NIS, channel, tahun ajaran, item events, catatan: HILANG.
- Tambahan di kode baru: transaksi per tenant dengan RLS (`0062:101-105`), kode error stabil + i18n (`platform/httpx/errors_library.go`, `platform/i18n/messages_library.go`), unit test fungsi murni (`domain/policy_test.go:50-76`).
- Verdict fitur: SEBAGIAN, inti "eksemplar tersedia + kuota + satu pinjaman aktif" ada, tetapi kelayakan anggota, batas bertingkat, hari kerja, dan alur pesanan-siap-ambil hilang.

### Sirkulasi: pengembalian, keterlambatan, denda

- Referensi lama (`libraryReturnOneCode`, `library_circulation.go:852-953`):
  - Cari pinjaman aktif lewat barcode/no_induk/rfid, `FOR UPDATE`.
  - `late_days` = hari buka saja (`library_common.go:268-281`).
  - Bila telat: buat `library_violations` jenis `terlambat`; penalti `denda` bila `fine_currency_enabled` (rumus `konstan` sekali atau `berkelipatan` per tenor, `library_common.go:284-296`), kalau tidak `suspend` sejumlah `suspend_days` jenis anggota (anggota jadi `suspend` + `suspended_until`), kalau keduanya 0 → `peringatan`.
  - `late_return_count` anggota naik; item → `tersedia` atau `dipesan` untuk booking `menunggu` tertua (+ `expires_at = now + booking_hold_days`, notifikasi `library_booking_ready`); tulis `library_item_events`.
- Sekarang:
  - Denda dihitung saat kembali: SEBAGIAN, `CalculateFine` = hari kalender telat × `FinePerDay` (`domain/policy.go:56-64`), disimpan di `library_loans.fine_amount` (`queries/library.sql:73-76`). Tidak ada hari kerja, tidak ada mode konstan/berkelipatan, tidak ada suspend/peringatan.
  - Antrean pesanan berikutnya jadi `ready` dengan hold days: SAMA, `service/loans.go:90-110`, `queries:129-132`.
  - Notifikasi ke pemesan: HILANG.
  - `late_return_count`, `library_item_events`, pelanggaran sebagai entitas: HILANG.
  - Pengembalian via barcode: BERBEDA, API butuh `loanId` (`transport/http/loans.go:22-33`); kiosk web memetakan barcode ke loan di klien dengan memuat semua copy judul yang dipinjam anggota (`apps/web/features/library/kiosk-session.ts:31-38, 79-87`).
- Tambahan di kode baru: kondisi fisik eksemplar dicatat saat kembali (`service/loans.go:58, 97-100`).
- Verdict fitur: SEBAGIAN, pengembalian + denda per hari + antrean bekerja; sanksi suspend, hari kerja, notifikasi, dan riwayat hilang.

### Sirkulasi: perpanjangan

- Referensi lama (`library_circulation.go:970-1078`): tolak bila `renewal_count >= max_renewals` (per jenis anggota), anggota `suspend` yang belum lewat, ada booking `menunggu` untuk judul, atau sudah telat; `new_due_on = addWorkingDays(max(today, due_on), renewal_days)`; catat `library_loan_renewals`.
- Sekarang:
  - Batas perpanjangan: SAMA (satu angka tenant), `domain/policy.go:91-93`.
  - Tolak bila telat: SAMA, `:94-96`, `domain/library.go:130-132`.
  - Tolak bila ada pemesan menunggu: SAMA, `:97-99`, `service/loans.go:129-135`.
  - Tolak bila anggota suspend: HILANG.
  - Tanggal baru: BERBEDA, `RenewedDueDate(now)` = `now + RenewalDays` kalender (`domain/policy.go:49-51`), bukan dari `due_on` dan bukan hari kerja; perpanjangan lebih awal memotong sisa masa pinjam.
  - Riwayat perpanjangan: HILANG (hanya `renewal_count`, `queries:83-86`).
- Tambahan: test `TestCanRenewRules` (`domain/policy_test.go:77-107`).
- Verdict fitur: SEBAGIAN, tiga aturan inti sama, tetapi basis tanggal berubah dan riwayat hilang.

### Sirkulasi: eksemplar hilang

- Referensi lama (`library_circulation.go:1263-1314`): loan item `hilang`, item `hilang`, event, `library_violations` jenis `hilang` dengan penalti `denda` atau `ganti_buku` + nominal + catatan.
- Sekarang: SEBAGIAN, loan `lost` + `fine_amount = replacement_cost` (`service/loans.go:146-169`, `queries:78-81`); copy → `withdrawn` kondisi `lost` (`:164-165`). Opsi `ganti_buku` (penalti non-uang) dan catatan: HILANG.
- Verdict fitur: SEBAGIAN.

### Pemesanan (booking / hold)

- Referensi lama (`createLibraryBookingForUser`, `library_circulation.go:1354-1426`; kadaluwarsa `:1909-1993`):
  - Tolak bila `booking_enabled=false`, kuota `booking_max` (default 2), anggota sedang meminjam judul itu, tidak ada eksemplar `dapat_dipinjam`.
  - Bila ada eksemplar `tersedia` → langsung `siap_diambil`, item `dipesan`, `expires_at = now + booking_hold_days`; jika tidak → `menunggu` (30 hari).
  - Job tiap jam: `siap_diambil` lewat `expires_at` → `kedaluwarsa`, item kembali `tersedia` atau diteruskan ke antrean berikutnya + notifikasi.
  - Batalkan: hanya `menunggu`/`siap_diambil`; item `dipesan` kembali `tersedia`.
- Sekarang:
  - Antrean FIFO deterministik + posisi: LEBIH BAIK, `domain/policy.go:107-147`, `service/reservations.go:56-69`.
  - Hold days saat eksemplar kembali: SAMA (`service/loans.go:108`).
  - Pesan saat masih ada eksemplar tersedia: BERBEDA, ditolak `ErrCopyAvailableForLoan` (`service/reservations.go:22-28`); lama justru langsung menahan eksemplar.
  - Kuota pesanan, cek "sudah meminjam judul ini", `booking_enabled`: HILANG.
  - Kadaluwarsa hold: HILANG (regresi), status `expired` didefinisikan (`domain/library.go:142`) tetapi tidak ada job/worker yang memakainya; tidak ada rujukan library di `platform/jobs`. Eksemplar `reserved` tidak pernah dilepas otomatis dan, digabung dengan `CanBorrow` yang menolak `reserved`, eksemplar macet sampai reservasi dibatalkan manual (`queries:139-142` tidak mengembalikan status copy ke `available`).
  - Notifikasi "siap diambil": HILANG.
  - Batalkan reservasi `ready` memulihkan copy: HILANG, `CancelReservation` hanya ubah status reservasi (`service/reservations.go:37-46`).
- Verdict fitur: SEBAGIAN, antrean ada, tetapi siklus hidup hold (ambil, kedaluwarsa, batal, lepas eksemplar) tidak tertutup.

### Pelanggaran dan denda (violations, pelunasan)

- Referensi lama (`library_circulation.go:1530-1678`): tabel `library_violations` (jenis terlambat/hilang/rusak/lainnya; penalti denda/suspend/peringatan/ganti_buku; status belum_lunas/lunas/dibebaskan); daftar dengan filter; catat manual (item → `rusak`, anggota → `suspend`); `settle` dengan aksi `lunas|dibebaskan`, dan bila semua lunas + suspend sudah lewat → anggota `aktif`.
- Sekarang: HILANG, denda hanya kolom `fine_amount`/`fine_paid_at` di loan. Query `MarkLoanFinePaid` ada (`queries:88-89`, `repository/loans.go:101-110`) tetapi tidak dipanggil service mana pun dan tidak ada route di `openapi/modules/library.yaml` (grep "fine" hanya di skema). Tidak ada pelanggaran manual, pembebasan, suspend.
- Tambahan: laporan `OverdueMembers` menghitung denda "seandainya dikembalikan hari ini" (`service/reports.go:28-55`).
- Verdict fitur: HILANG.

### Batas pinjam: jenis anggota, jenis bahan, aturan pinjam berjangka, hari libur

- Referensi lama: `library_member_types` (max_loan_items, max_loan_days, renewal_days, max_renewals, fine_type, fine_per_tenor, tenor_days, suspend_days, validity_months, registration_fee, due_reminder_days, default_for_role; validasi `library_members.go:151-169`); `library_loan_rules` berjangka per jenis anggota/bahan dengan `allow_loans=false` untuk menutup pinjaman (`library_circulation.go:1766-1868`); `library_holidays` CRUD (`:1684-1736`); setting Sabtu/Minggu tutup.
- Sekarang: HILANG semua, digantikan satu `Policy` tenant berversi (`domain/policy.go:13-33`; default 7 hari / 3 pinjaman / 1 perpanjangan / 7 hari / Rp1.000 per hari / hold 2 hari). Tidak ada perbedaan siswa vs guru, tidak ada penutupan pinjaman sementara, tidak ada hari libur.
- Tambahan: policy berversi dengan `created_by` (`0062:11-19`, `service/service.go:138-155`).
- Verdict fitur: HILANG, hanya angka default tenant yang tersisa.

### Sirkulasi v2: typeahead, buku paket kelas, telat, pengingat, mode mandiri

- Referensi lama (`library_circulation_v2.go`): `GET /lookup` anggota+eksemplar (≤8, cocok nama/nomor/NIS/username/barcode/judul, `:41-83`); `class-loans/preview` dan `class-loans` mode `auto` (pasangan siswa urut nama × eksemplar urut no_induk, `:241-250`) / `scan`, melewati kuota, tolak `tidak_aktif` dan yang sudah punya judul (`:252-476`); `class-returns` (`:488-621`); `overdues` dengan telepon wali + kelas (`:634-678`); `reminders/send` teks WA + notifikasi in-app, dedupe satu per user per hari (`:737-844`); pengingat harian jam 07:00 (`library_circulation.go:1998-2090`); self-service = loans/returns dengan channel `self_service`.
- Sekarang:
  - Typeahead: HILANG, `apps/mobile/src/app/library/lookup.tsx:10-14` menyatakan "tidak ada endpoint pencarian anggota", pustakawan menempel UUID; web `loan-desk-view.tsx:39-53` juga input UUID manual.
  - Buku paket per kelas, pengembalian kelas: HILANG.
  - Daftar telat: SEBAGIAN, `service/loans.go:175-177`, `queries:97-100`; tanpa kelas/telepon wali/hari telat (klien menghitung sendiri).
  - Pengingat WA/notifikasi dan job harian: HILANG (`docs/02-system-design.md:76` merencanakan River job "pengingat jatuh tempo perpustakaan"; belum ada).
  - Mode mandiri: SEBAGIAN, kiosk web (`apps/web/features/library/components/kiosk-view.tsx`) memakai endpoint borrow/return biasa: scan kartu = UUID (`kiosk-session.ts:11-15`), scan buku → return bila milik anggota, else borrow (`kiosk-view.tsx:78-102`), reset idle 20 detik (`:25`, lama 30 detik). Tidak ada `channel` di loan sehingga laporan tidak bisa membedakan mandiri vs meja.
- Verdict fitur: HILANG (kecuali telat dan kiosk sederhana).

### Anggota dan jenis anggota

- Referensi lama (`library_members.go`): profil `library_members` (member_no, tipe, registered_on, valid_until dari `validity_months`, status `belum_aktif|aktif|tidak_aktif|suspend|bebas_pustaka`, suspended_until, late_return_count, notes, clearance); `member_no` dari pola `library.member_no_format` (`PS-YYYY-99999`, `library_common.go:184-204`, urutan = jumlah anggota + 1, retry 5× bila duplikat `:596-614`); tipe default dari `default_for_role`; daftar dengan filter status/tipe/role; kandidat; bulk register per role/kelas (`:783-859`); bebas pustaka hanya bila tanpa pinjaman aktif dan denda (`:903-934`) + surat HTML (`:987-1034`); update status divalidasi (`:740-752`).
- Sekarang: HILANG, tidak ada tabel/entitas anggota; "anggota" = `users.id` (`0062:81`). Tidak ada nomor anggota, masa berlaku, status, bebas pustaka, pendaftaran massal. Permission `manage_library_members` ada (`platform/authz/permissions.go:57`) tetapi hanya dipakai untuk cetak kartu (`openapi/modules/library.yaml:184-188`). Halaman web `library/members/[userId]` hanya riwayat pinjaman + reservasi (`member-history-view.tsx`).
- Verdict fitur: HILANG.

### Kartu anggota

- Referensi lama (`library_cards.go:32-153`): batch `user_ids[]`, PDF A4 2×5 kartu ATM 85,6×54 mm: nama perpustakaan, nama, No. Anggota, kelas, berlaku s.d., QR `<origin>/library/member?no=<member_no>`, barcode Code128 member_no.
- Sekarang: SEBAGIAN, satu kartu per user (`service/print.go:60-78`), isi: nama sekolah kosong (`"SchoolName": ""`, `:72`), nama, "Batas pinjam: N judul, M hari" (`:27-32`). Tanpa nomor anggota, kelas, masa berlaku, QR, barcode, batch. Diakui di `docs/12-roadmap.md:136`. Konsekuensi: kiosk mengharap barcode UUID (`kiosk-session.ts:10-15`) yang tidak pernah tercetak, jadi kartu fisik tidak bisa dipindai.
- Verdict fitur: SEBAGIAN, endpoint ada, artefaknya tidak fungsional untuk scan.

### Pinjaman saya (tampilan mandiri anggota)

- Referensi lama (`library_my.go`): permission `view_own_library_loans` untuk semua user; `GET /api/my-library` = profil, pinjaman aktif, 20 riwayat, pesanan, pelanggaran, `settings.booking_enabled`; pesan judul sendiri dengan cek kuota/judul/sedang dipinjam (`:153-252`); batalkan pesanan milik sendiri saja (`:255-295`).
- Sekarang: HILANG sebagai fitur; BERBEDA (regresi privasi) pada penggantinya, `GET /v1/library/members/{userId}/loans` dan `/reservations` (`openapi/modules/library.yaml:344-376`) memakai `x-permission: view_library` tanpa pemeriksaan `userId == user login` (`transport/http/loans.go:63-74`, `reservations.go:38-48`), dan `view_library` diberikan ke siswa secara default (`platform/authz/role_defaults.go:36`). Siswa dapat membaca riwayat pinjaman anggota lain. Tidak ada layar "pinjaman saya" di `apps/web/app/(app)/library/*` maupun `apps/mobile/src/app/library/*`; membuat/membatalkan reservasi butuh `manage_library_circulation` (`library.yaml:397,425`), jadi anggota tidak bisa memesan sendiri.
- Verdict fitur: HILANG.

### Kunjungan (buku tamu), kiosk kunjungan, baca di tempat

- Referensi lama (`library_visits.go`): `library_visits` (anggota/non_anggota/rombongan, purpose, group_size, source manual/scan/kiosk, tahun ajaran); token kiosk acak 32 byte hash SHA-256 TTL 60 detik, dipakai berulang selama TTL (`:187-205`); scan oleh user login mana pun, dedupe satu kunjungan per user per 30 menit (`:235-242`), auto-register anggota; ringkasan hari ini; `library_read_in_place` per kode eksemplar (`:280-316`).
- Sekarang: HILANG, tidak ada tabel/endpoint kunjungan. Purpose `library_visit` disiapkan di `migrations/0045_scan_tokens.up.sql:13-15` dan `modules/permits/domain/scantoken.go:22-24` ("reserved"), belum dipakai. Modul `visitors` di kode baru adalah tamu sekolah/satpam, bukan perpustakaan. `docs/11-feature-recommendations.md:42` (#24 mode kiosk sekolah, scan kunjungan perpustakaan) masih rencana.
- Verdict fitur: HILANG.

### Pengaturan perpustakaan

- Referensi lama (`library_common.go:47-71`, `library_settings.go`): kunci `modules.library_enabled` (true), `library.name` ("Perpustakaan Sekolah", wajib ≤150), `npp`, `barcode_source` (`no_induk|item_id`), `no_induk_format` (`YYYY/99999`), `member_no_format` (`PS-YYYY-99999`), `saturday_closed`/`sunday_closed` (true), `booking_enabled` (true), `booking_max` (2), `booking_hold_days` (2), `fine_currency_enabled` (false), `block_loans_with_unpaid_fines` (true), `due_reminder_days` (2), `auto_register_members` (true); angka tidak boleh negatif; middleware `withLibraryModule` menolak 403 bila modul mati (`:123-136`).
- Sekarang:
  - `booking_hold_days`: SAMA → `ReservationHoldDays` default 2 (`domain/policy.go:31`).
  - Kunci baru: `loan_days`, `max_active_loans`, `max_renewals`, `renewal_days`, `fine_per_day` (`:13-21`), validasi `:35-41`, riwayat versi (`0062:11-19`).
  - Semua kunci lain: HILANG (nama perpustakaan, NPP, format nomor, hari tutup, booking on/off + kuota, mode denda, blokir denda, hari pengingat, auto-register).
  - Saklar modul: HILANG, `docs/03-layered-architecture.md:137` menjanjikan `library.enabled=false` → `404 MODULE_DISABLED`; modul lain punya (`modules/staffattendance/service/service.go:21`, `modules/visitors/service/service.go:123`), library tidak.
- Verdict fitur: SEBAGIAN, policy sirkulasi berversi lebih rapi, tetapi 12 dari 15 setting lama tidak ada.

### OPAC (katalog publik)

- Referensi lama (`library_opac.go`): tanpa auth, hanya `is_opac=TRUE` bibliografi dan eksemplar; `q` ≥3 karakter → MATCH AGAINST fulltext, <3 → LIKE judul/pengarang/ISBN; filter `ddc_class`, `material_type_id`; page_size ≤100 default 20; respons + `library_name`; detail judul dengan daftar eksemplar (no_induk, nomor panggil, lokasi, status, akses); `highlights` 10 terbaru + 10 terpopuler; ditolak bila modul mati.
- Sekarang:
  - Publik tanpa sesi, tenant lewat header: SAMA, `library.yaml:638-646` (`security: []`, `TenantHeader`), `service/opac.go:13-15`.
  - Pencarian: SEBAGIAN, LIKE judul/pengarang + ISBN persis (`queries/library.sql:22-28`); tidak ada fulltext (`docs/06:248,306` merencanakan `search_vector` GIN, belum ada di `0062`), tidak ada filter DDC/jenis bahan.
  - Ketersediaan per judul: SAMA, `service/catalogue.go:63-73`.
  - Filter `is_opac` (judul/eksemplar disembunyikan dari publik): HILANG, semua judul terlihat.
  - Detail judul + eksemplar/lokasi, highlights terbaru/populer, `library_name`, gate modul mati: HILANG.
- Verdict fitur: SEBAGIAN.

### Route dan permission

- Referensi lama (`library_routes.go`): setiap route = `withAuth` → `withLibraryModule` → `withAnyPermission` (OR beberapa permission, `library_common.go:139-149`). Permission: `manage_library_catalog`, `circulate_library`, `view_library_reports`, `manage_library_members`, `manage_library_settings`, `view_own_library_loans`; GET katalog boleh katalog ATAU sirkulasi; `visits/scan` cukup login; OPAC tanpa auth.
- Sekarang (`openapi/modules/library.yaml`, `platform/authz/permissions.go:54-59`):
  - `manage_library_catalog`, `manage_library_members`, `manage_library_settings`, `view_library_reports`: SAMA nama dan cakupan serupa.
  - `circulate_library` → `manage_library_circulation`: SAMA makna (`library.yaml:227,255,281,300,397,425`).
  - `view_own_library_loans`: HILANG, diganti `view_library` yang lebih luas (baca katalog, antrean, riwayat pinjaman/reservasi siapa pun; `library.yaml:6,40,86,126,206,329,348,376,444,494`).
  - Satu permission per route (`x-permission`), bukan OR: BERBEDA, lebih ketat tetapi menghilangkan "GET katalog untuk pustakawan sirkulasi", dipulihkan karena semua peran pustaka mendapat `view_library` (`role_defaults.go:43-45`).
  - Gate modul dinonaktifkan: HILANG (lihat Pengaturan).
  - Stocktake memakai `manage_library_catalog` (`library.yaml:468,512,541`), lama `circulate_library`: BERBEDA, wajar.
- Tambahan: kode error terstruktur per kasus (`platform/httpx/errors_library.go:6-21`) menggantikan string bebas.
- Verdict fitur: SEBAGIAN, pemetaan permission konsisten, tetapi hilangnya scoping "milik sendiri" membuka data pinjaman anggota lain ke siswa.

---

## Tabel ringkas

| Fitur                                            | Verdict  | Gap terpenting                                                                                                                                     |
| ------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Peminjaman (v1)                                  | SEBAGIAN | Tidak ada status/masa berlaku anggota, blokir denda, batas per jenis anggota/bahan, hari kerja; eksemplar `reserved` tidak bisa diambil pemesannya |
| Pengembalian, telat, denda                       | SEBAGIAN | Denda hanya per hari kalender di loan; sanksi suspend, notifikasi pemesan, riwayat/event hilang                                                    |
| Perpanjangan                                     | SEBAGIAN | Tanggal baru = now + renewal_days (bukan dari due_on, bukan hari kerja); cek suspend dan riwayat hilang                                            |
| Eksemplar hilang                                 | SEBAGIAN | Tidak ada pilihan `ganti_buku`/catatan, tidak ada catatan pelanggaran                                                                              |
| Pemesanan / hold                                 | SEBAGIAN | Tidak ada job kedaluwarsa dan pelepasan copy; kuota/booking_enabled/cek sudah meminjam hilang                                                      |
| Pelanggaran dan denda                            | HILANG   | Tidak ada entitas pelanggaran, pelunasan, pembebasan, suspend; `MarkLoanFinePaid` tanpa endpoint                                                   |
| Jenis anggota, aturan pinjam, hari libur         | HILANG   | Diganti satu policy tenant; tidak ada perbedaan siswa/guru atau penutupan berjangka                                                                |
| Sirkulasi v2 (lookup, kelas, pengingat, mandiri) | HILANG   | Tidak ada pencarian anggota, buku paket kelas, pengingat WA/harian; kiosk tanpa `channel`                                                          |
| Anggota                                          | HILANG   | Tidak ada tabel anggota, nomor anggota, masa berlaku, bebas pustaka, bulk register                                                                 |
| Kartu anggota                                    | SEBAGIAN | PDF tanpa nomor anggota/barcode/QR; kartu tidak bisa dipindai kiosk (diakui `docs/12-roadmap.md:136`)                                              |
| Pinjaman saya                                    | HILANG   | Tidak ada layar/endpoint "milik sendiri"; `members/{userId}/loans` dengan `view_library` bisa dibaca siswa untuk user lain                         |
| Kunjungan / kiosk kunjungan / baca di tempat     | HILANG   | Purpose `library_visit` disiapkan di `scan_tokens` tetapi tidak ada tabel/endpoint                                                                 |
| Pengaturan                                       | SEBAGIAN | 12 kunci hilang (nama, format nomor, hari tutup, booking, mode denda, auto-register); tidak ada saklar modul                                       |
| OPAC                                             | SEBAGIAN | Tidak ada `is_opac`, fulltext, filter DDC/jenis, detail eksemplar, highlights                                                                      |
| Route / permission                               | SEBAGIAN | `view_own_library_loans` hilang tanpa self-scoping; tidak ada gate modul nonaktif                                                                  |

---

# Bagian 8

# Perbandingan logika: Perpustakaan bagian 2 (Katalog, Eksemplar, Label, Opname, Laporan, Operasi)

Lingkup lama: `reference/sion-rebuild-go/backend/cmd/api/library_{catalog,catalog_v2,items,labels,opname,reports,monthly_report,operations,common}.go` (≈5.700 baris). Lingkup baru: `apps/api/internal/modules/library` (≈2.700 baris untuk _seluruh_ modul, termasuk sirkulasi dan reservasi), migrasi `apps/api/migrations/0062_library.up.sql`, spec `openapi/modules/library.yaml`.

Catatan lintas fitur yang penting untuk verdict di bawah:

- `docs/06-database-schema.md:246-248` merencanakan porting skema perpustakaan lokal secara penuh (`library_material_types`, `library_bibliographies` + tsvector, `library_items` unique `(tenant_id, accession_number)`, `library_item_events`, `library_stock_opname_items`, dst.). Migrasi 0062 hanya membuat 6 tabel (`library_policies`, `library_titles`, `library_copies`, `library_loans`, `library_reservations`, `library_stocktakes`, `library_stocktake_scans`). Jadi penyempitan ini **tidak** tercatat sebagai keputusan sengaja di docs; `docs/12-roadmap.md:114` justru menandai Perpustakaan "Selesai, termasuk OPAC publik dan opname".
- Satu-satunya pengurangan yang diakui docs: `docs/12-roadmap.md:136` "Label dan kartu perpustakaan tercetak sebagai PDF teks; perender dokumen belum bisa menggambar barcode."
- Gate modul: lama `withLibraryModule` (`library_common.go:123-136`) menolak semua route bila `modules.library_enabled=false`. Baru: `ModuleLibrary` ada (`platform/domain/platform.go:78`) dan `IsModuleEnabled` dipakai modul visitors/billing (`wiring/visitors.go:44`, `wiring/billing.go:50`), tetapi **tidak** dipanggil di mana pun oleh modul library. HILANG.
- Authz: lama `withAnyPermission` (union permission, `library_common.go:139-149`). Baru satu `x-permission` per route di `openapi/modules/library.yaml` (`view_library`, `manage_library_catalog`, `manage_library_settings`, `view_library_reports`), role `librarian` mendapat semuanya (`platform/authz/role_defaults.go:42-45`). Setara, dengan permission baca terpisah `view_library` yang lebih rapi.
- Multi-tenant + RLS di semua tabel (`0062_library.up.sql:45-49` dst.) adalah tambahan struktural di kode baru.

---

### Master data katalog (jenis bahan, kategori koleksi, sumber perolehan, mitra, lokasi, kelas DDC)

- Referensi lama:
  - CRUD 5 master data dengan `code` unik (409 saat duplikat), `is_active`, `sort_order`; `library_catalog.go:155-761`.
  - Hapus ditolak 409 bila masih dipakai (`libraryUsageCount`, `library_catalog.go:120-125`; contoh `:257-267`, `:383-392`).
  - `library_ddc_classes` read-only (`:767-791`) dan endpoint `options` gabungan untuk dropdown (`:793-894`).
  - Jenis bahan membawa `max_loan_items/max_loan_days/max_renewals` per jenis (`:19-28`).
- Sekarang: HILANG seluruhnya. Tidak ada tabel maupun endpoint; judul hanya menyimpan `classification text` bebas (`0062_library.up.sql:35`, `domain/library.go:72`). Aturan pinjam per jenis bahan digantikan satu `Policy` per tenant (`domain/policy.go:13-21`).
- Tambahan di kode baru: policy berversi (`service/service.go:101-155`).
- Verdict fitur: HILANG. Tidak ada satu pun master data; `docs/06` merencanakannya, jadi bukan pengurangan yang disengaja.

---

### Katalog v1: bibliografi

- Referensi lama:
  - Field lengkap ala INLISLite: control_number (unik, 409 `library_catalog.go:1186`), subtitle, responsibility, main/additional authors, publisher, place, year, edition, pages, illustration, dimensions, isbn, issn, ddc_number, call_number, subjects, language, literary_form, target_audience, notes, abstract, cover, material_type_id (wajib), is_opac (`:70-103`, `:1126-1231`).
  - ISBN dinormalisasi (hapus `-`/spasi, upper-case X) `libraryNormalizeISBN` (`:901-910`) saat create/update/search/lookup.
  - Nomor panggil otomatis bila kosong: DDC + 3 huruf pengarang kapital + 1 huruf judul kecil (`libraryCallNumber`, `library_common.go:207-241`; dipakai `:1155`, `:1252`).
  - Default bahasa `ind` (`:1163`).
  - Create boleh sekaligus membuat N eksemplar (`copies`) dalam satu transaksi (`:1136-1146`, `:1195-1210`), sampul diunduh dari `cover_image_url` tanpa menggagalkan create (`:1218-1223`).
  - Pencarian: FULLTEXT boolean mode (prefix `+kata*`) untuk ≥3 huruf, LIKE untuk <3 huruf, plus `isbn LIKE` ternormalisasi; filter `material_type_id`, `ddc_class` (digit pertama), `availability=available` (HAVING available_count>0), sort title/newest (`:998-1069`).
  - Detail mengembalikan bibliografi + daftar eksemplar (`:1083-1100`); `lookup?isbn=` untuk deteksi duplikat (`:1102-1124`).
  - Hapus ditolak 409 bila masih ada eksemplar (`:1294-1316`); unggah sampul jpeg/png/webp ≤3MB, konversi WebP (`:1318-1392`).
- Sekarang:
  - Field: SEBAGIAN. Hanya title, subtitle, author, publisher, publish_year, isbn, classification, language, cover_asset_id (`domain/library.go:63-77`, `library.yaml:734-746`). Hilang: control_number, responsibility, additional_authors, publish_place, edition, pages, illustration, dimensions, issn, subjects, literary_form, target_audience, notes, abstract, material_type, is_opac.
  - Normalisasi ISBN: HILANG. ISBN disimpan apa adanya; pencarian memakai `isbn = search` persis (`queries/library.sql:26`). "978-602-1" dan "9786021" jadi dua judul berbeda dan tidak saling ketemu.
  - Nomor panggil otomatis: HILANG. Tidak ada call number; `classification` diisi manual.
  - Default bahasa `ind`: SAMA (`service/catalogue.go:23-25`).
  - Judul wajib: SAMA (`service/catalogue.go:20`).
  - Create + N eksemplar sekaligus: HILANG (`CreateTitle` hanya judul, `transport/http/catalogue.go:43-57`).
  - Pencarian: BERBEDA (regresi). `lower(title) LIKE` / `lower(author) LIKE` / `isbn =` (`queries/library.sql:22-28`); tidak ada fulltext (docs/06 merencanakan tsvector + GIN), tidak ada filter jenis/DDC/ketersediaan, sort hanya `title`.
  - Detail + eksemplar: SEBAGIAN. Detail mengembalikan judul + total/available (`service/catalogue.go:36-45`), eksemplar lewat endpoint terpisah `/titles/{id}/copies`.
  - Lookup ISBN duplikat: HILANG (pencarian umum bisa dipakai bila ISBN diketik persis).
  - Hapus bibliografi: HILANG. Kolom `deleted_at` ada (`0062:40`) tetapi tidak ada route/operasi delete.
  - Unggah sampul: SEBAGIAN. Hanya menerima `cover_asset_id` dari modul aset (`library.yaml:746`); tidak ada validasi tipe/ukuran/konversi di modul ini.
  - Nomor kontrol unik: HILANG.
- Tambahan di kode baru: `available_copies` dihitung per judul di list (`service/catalogue.go:47-73`, N+1 query per baris); OPAC memakai listing yang sama (`service/opac.go:13-15`); RLS tenant.
- Verdict fitur: SEBAGIAN. Katalog hanya "judul minimal"; normalisasi ISBN, nomor panggil, pencarian fulltext dan hampir semua deskripsi bibliografi hilang tanpa catatan keputusan.

---

### Katalog v2: pencarian ISBN eksternal, unduh sampul, tambah eksemplar cepat, ubah status massal, ekspor XLSX, definisi field import

- Referensi lama (`library_catalog_v2.go`):
  - Lookup ISBN: lokal → Open Library → Google Books, cache in-memory positif 24 jam / negatif 2 menit, tidak pernah 500 (`:26-118`, `:67-86`); mapper murni OL (`:206-289`) dan GB (`:293-367`, prefer ISBN_13, `http`→`https` sampul); tahun diekstrak regex 4 digit (`:369-383`).
  - Unduh sampul eksternal: http/https saja, ≤3MB, jpeg/png/webp via magic bytes (`:392-436`).
  - `POST /bibliographies/{id}/copies` tambah N eksemplar ke judul yang sudah ada, `count≥1`, kategori wajib (`:442-500`).
  - Ubah status massal ≤1.000 item, hanya status manual, tolak bila ada pinjaman aktif, `FOR UPDATE`, tulis `library_item_events`, no-op bila status sama (`:517-593`).
  - Ekspor katalog XLSX dua sheet (Judul 26 kolom, Eksemplar 12 kolom) dengan header style dan freeze panes (`:599-748`).
  - Definisi 19 field import + alias header INLISLite dan normalisasi header (`:763-847`).
- Sekarang:
  - Lookup ISBN eksternal: HILANG. `docs/02-system-design.md:34` masih mencantumkan Open Library / Google Books sebagai sistem eksternal yang direncanakan, jadi ini belum dibangun, bukan dibuang.
  - Unduh sampul eksternal: HILANG.
  - Tambah eksemplar cepat: SEBAGIAN. `POST /titles/{id}/copies` menambah **satu** eksemplar dengan barcode manual (`transport/http/catalogue.go:96-110`); tidak ada `count`.
  - Ubah status massal: HILANG. Bahkan ubah status satu eksemplar pun tidak ada endpoint-nya (lihat Eksemplar).
  - Ekspor XLSX: HILANG.
  - Definisi field import: HILANG.
- Tambahan di kode baru: tidak ada.
- Verdict fitur: HILANG. Dari enam kemampuan, hanya "tambah eksemplar" yang ada dan itu pun tanpa jumlah.

---

### Eksemplar (nomor induk, barcode, status, riwayat)

- Referensi lama (`library_items.go`, `library_common.go`):
  - Nomor induk otomatis dari setting `library.no_induk_format` (default `YYYY/99999`): `YYYY`/`YY` diganti tahun, deretan `9` jadi nomor urut ber-padding (`libraryFormatNumber`, `library_common.go:184-204`); sequence = `COUNT(*) library_items + 1` global (`library_items.go:441-444`, `:479-480`); retry hingga 5x bila duplikat, hanya bila tidak ada no_induk/barcode eksplisit (`:475-514`).
  - Barcode default: `= no_induk` (setting `barcode_source=no_induk`) atau 11 digit dari sequence (`item_id`) (`libraryGenerateBarcode`, `:330-335`).
  - Unik `no_induk` dan `barcode` di DB, 409 "Nomor induk atau barcode sudah digunakan" (`:600-603`, `:687-690`).
  - Set status 10 nilai: tersedia, dipinjam, dipesan, rusak, hilang, dalam_perbaikan, diolah, dihibahkan, tandon, tidak_diketahui (`library_common.go:17-26`); akses 3 nilai: dapat_dipinjam, baca_di_tempat, referensi (`:27-29`).
  - Status saat pembuatan: semua kecuali dipinjam/dipesan (`libraryItemCreatableStatuses`, `library_items.go:356-359`); status yang boleh diubah manual: sama minus tidak_diketahui (`:361-364`); `dipinjam`/`dipesan` hanya lewat sirkulasi.
  - Ubah status manual (`PUT /items/{id}/status`) ditolak 409 bila ada pinjaman aktif; menulis event `status_diubah` dalam transaksi (`:711-767`).
  - Setiap pembuatan menulis event `dibuat` (`:516-519`); riwayat event + riwayat pinjam ditampilkan di detail (`:236-302`).
  - Hapus ditolak 409 bila ada riwayat pinjam, disarankan status `dihibahkan` (weeding) (`:769-790`).
  - `copy_number` = jumlah eksemplar judul + i + 1 (`:437-440`, `:454`); nomor panggil eksemplar mewarisi bibliografi (`:446-449`).
  - Validasi referensi kategori (wajib), lokasi, sumber, mitra ada di DB (`:368-414`); harga, is_opac, notes, rfid, partner, source_note.
  - Cari by-code: `barcode OR no_induk OR rfid` (`:149-159`, `:304-323`); list dengan filter status/kategori/lokasi/bibliografi dan search 4 kolom (`:178-234`); update penuh (`:619-704`).
- Sekarang:
  - Nomor induk: HILANG. Tidak ada kolom accession/no_induk (`0062:53-65`); `docs/06:248` merencanakan unique `(tenant_id, accession_number)`.
  - Barcode otomatis: HILANG. Barcode wajib diketik manual (`library.yaml:767-769`, `service/catalogue.go:76-78`; form di `apps/web/features/library/components/title-copies-view.tsx:144-181`).
  - Unik barcode per tenant: SAMA (`0062:64`, `repository/repository.go:118-120` → `ErrCopyBarcodeExists`).
  - Set status: BERBEDA (regresi). Status 4 nilai `available/on_loan/reserved/withdrawn` + kondisi 4 nilai `good/fair/damaged/lost` (`domain/library.go:36-61`, `0062:58-59`). Tidak ada padanan untuk dalam_perbaikan, diolah, dihibahkan, tandon, tidak_diketahui; `docs/06:246` merencanakan 10 kode English (`repair`, `processing`, `donated`, `reserve_stack`, `unknown`) yang tidak dibangun. Akses (referensi/baca di tempat) HILANG.
  - Ubah status manual: HILANG. `UpdateCopyStatus` ada di repo (`repository/repository.go:173-186`) tetapi hanya dipanggil dari sirkulasi: Borrow→`on_loan` (`service/loans.go:50`), Return→`available`/`reserved` (`:97-100`), MarkLost→`withdrawn`+`lost` (`:164-165`). Pustakawan tidak bisa menandai rusak/perbaikan/hibah tanpa peminjaman. Guard "tolak bila sedang dipinjam" jadi tidak relevan (tidak ada jalannya).
  - Riwayat event eksemplar: HILANG. Tidak ada `library_item_events`.
  - Hapus eksemplar + guard riwayat pinjam: HILANG (tidak ada route delete; `on delete cascade` di loans `0062:79` malah akan menghapus riwayat bila baris dihapus manual).
  - copy_number, call_number, kategori, lokasi, sumber, mitra, harga, is_opac, rfid: HILANG. Tersisa `condition`, `acquired_on`, `notes` (`domain/library.go:79-90`).
  - Cari by-code: SEBAGIAN. `GetCopyByBarcode` hanya barcode (`queries/library.sql:44-45`) dan tidak diekspos sebagai endpoint; dipakai internal loans/stocktake.
  - List/filter/update eksemplar: HILANG. Hanya list per judul urut barcode (`queries/library.sql:47-48`); tidak ada update.
  - Validasi judul ada: SAMA (`service/catalogue.go:83-87`).
- Tambahan di kode baru: `condition` sebagai dimensi terpisah dari status; kondisi bisa diset saat pengembalian (`service/loans.go:58`).
- Verdict fitur: SEBAGIAN. Eksemplar menyusut menjadi barcode manual + kondisi; nomor induk (buku induk), status perawatan/weeding, dan jejak audit hilang.

---

### Import eksemplar/koleksi (template, preview, commit)

- Referensi lama (`library_items.go:796-1317`, `library_catalog_v2.go:754-847`):
  - Template XLSX 18 kolom + sheet `Referensi` tersembunyi berisi kode master, dropdown data-validation untuk jenis/kategori/akses/lokasi/sumber (`:1244-1317`).
  - Preview: maks 2.000 baris (`:1050-1053`), validasi murni per baris: judul wajib, jenis bahan + kategori harus dikenal, akses valid, lokasi/sumber bila diisi harus dikenal, tahun & harga numerik, copies ≥1 default 1 (`libraryValidateImportRow`, `:898-939`); status baris `new_title|existing_title|error` dengan ringkasan (`:1041-1113`).
  - Dedupe: ISBN ternormalisasi lebih dulu, lalu `LOWER(title)=` dan `LOWER(main_author)=` (`:947-968`); di commit dicari dalam transaksi yang sama agar baris baru terlihat.
  - Commit satu transaksi: buat bibliografi (call number otomatis bila kosong) lalu N eksemplar via `createLibraryItemsTx` (no_induk/barcode eksplisit hanya bila copies=1) (`:1118-1242`).
  - `mapping` opsional field→nama kolom sumber dengan alias INLISLite dan pencocokan header tidak peka huruf/tanda baca (`:983-1039`, v2 `:793-833`).
- Sekarang: HILANG seluruhnya. Tidak ada endpoint import/template/preview di `library.yaml` maupun service. `docs/02:76` merencanakan "import besar" via River; belum dibangun.
- Tambahan di kode baru: tidak ada.
- Verdict fitur: HILANG. Sekolah yang memigrasi katalog INLISLite tidak punya jalur masuk kecuali entry satu per satu.

---

### Label eksemplar (PDF, barcode)

- Referensi lama (`library_labels.go`):
  - `POST /labels.pdf` body `item_ids` 1..500 (`:94-100`), model `a4-3x8`: A4, 3 kolom x 8 baris, label 70x25 mm, margin Y 8,5 mm (`:21-32`, `libraryLabelPosition :46-52`).
  - Isi: nomor panggil dipecah maks 3 baris rata tengah (`libraryLabelLines :55-61`, render `:155-162`), barcode Code 128 sebagai PNG 300x60 (`generateLibraryCode128PNG :69-86`, `:164-177`), teks barcode di bawah (`:178-180`); nilai barcode fallback ke `no_induk` (`:165-168`).
  - Urutan label mengikuti urutan `item_ids` (`ORDER BY FIELD`, `:113-115`); 404 bila tidak ada item.
- Sekarang:
  - Batch ≤500: HILANG. Hanya satu label per request `GET /copies/{copyId}/label` (`library.yaml:166-173`, `transport/http/catalogue.go:112-118`).
  - Grid A4 3x8 / ukuran 70x25 mm: HILANG. Dirender lewat `documents.EngineHTML` dari template 4 baris teks (`service/print.go:20-25`, `:34-57`).
  - Code 128: HILANG. Roadmap mengakui: `docs/12-roadmap.md:136`. Barcode hanya ditulis sebagai teks.
  - Nomor panggil 3 baris: HILANG (tidak ada call number; yang dicetak `Classification` mentah).
  - Fallback nilai barcode: tidak relevan (barcode selalu ada, wajib).
- Tambahan di kode baru: judul dan pengarang ikut tercetak; renderer bersama dengan modul dokumen lain.
- Verdict fitur: SEBAGIAN. Ada endpoint cetak, tetapi hasilnya belum bisa ditempel di punggung buku maupun dipindai; kekurangannya diakui di roadmap.

---

### Opname / stock opname (sesi, scan, selisih, penyelesaian)

- Referensi lama (`library_opname.go`):
  - Buat sesi butuh tahun ajaran aktif (`requireActiveAcademicYear`, `:92-95`), `name` wajib, `started_on` default hari ini, notes ≤500, status awal `berjalan`, koordinator = user pembuat (`:91-127`).
  - Cakupan (expected) = semua item dengan `status NOT IN (dihibahkan, hilang)` (`:47`, `:191`).
  - Scan batch `codes[]` + `location_id` opsional; kode dicari via barcode/no_induk/rfid (`libOpsFindItemByCode`, `library_operations.go:47-55`); sesi bukan `berjalan` → 409 (`:276-279`); per kode: tidak ditemukan → `rejected`, di luar cakupan (dihibahkan/hilang) → `rejected`, sudah discan → `duplicate` (idempoten), selain itu simpan `previous_status`, `found_location_id`, `scanned_by` (`:293-327`).
  - Progres: expected, scanned, missing = expected−scanned, misplaced = found_location ≠ location item (`:189-257`); daftar item dengan `is_misplaced` per baris.
  - Finish: hanya dari `berjalan`; `mark_missing_as` ∈ {hilang, tidak_diketahui, none}; item dalam cakupan yang tidak discan diubah statusnya + event `opname` dengan catatan berisi id/nama opname (`:363-391`); sesi → `selesai`, `ended_on = CURDATE()` (`:392`); respons `missing_count`.
  - Laporan XLSX per sesi 9 kolom termasuk Status Sebelumnya, Waktu Scan, Lokasi Ditemukan, Salah Rak (`:412-459`).
  - Authz `circulate_library` (kontrak §C).
- Sekarang:
  - Buat sesi: SEBAGIAN. `name` wajib, `started_on = now`, koordinator = actor, notes (`service/stocktake.go:11-18`; `library.yaml:476-479` notes ≤500). Tidak ada `started_on` custom, tidak ada keterkaitan tahun ajaran (tidak masalah, `academic_year_id` tidak dipakai di logika lama selain disimpan).
  - State machine: SAMA. `open` → `closed`, scan/close ditolak bila bukan open (`service/stocktake.go:47-49`, `:81-83`; `ErrStocktakeClosed`); SQL `CloseStocktake` hanya dari `open` (`queries/library.sql:155-158`).
  - Cakupan: BERBEDA (regresi). Expected = `status != 'on_loan'` (`queries/library.sql:50-52`). Eksemplar `withdrawn` (hilang/hibah) **ikut** diharapkan, jadi tiap opname akan melaporkan buku yang sudah hilang sebagai "missing" lagi; lama sengaja mengecualikannya.
  - Scan: SEBAGIAN. Satu barcode per request (`library.yaml:522-524`), hanya barcode (tanpa no_induk/rfid). Barcode tak dikenal → **error 404** `ErrCopyNotFound` (`service/stocktake.go:54-60`) bukan daftar `rejected`; komentar di kode mengakui skema tidak bisa menyimpannya. Duplikat: idempoten via `on conflict (stocktake_id, copy_id) do update scanned_at` (`queries/library.sql:160-164`), SAMA secara efek. Tidak ada `location_id`/`previous_status`.
  - Progres selama sesi: HILANG. `GetStocktake` hanya header (`transport/http/stocktake.go:30-36`); hitungan scan di UI dijaga di state klien (`stocktake-session-view.tsx:26,35-37`) dan hilang saat reload.
  - Salah rak / lokasi: HILANG (tidak ada lokasi).
  - Reconciliation: SEBAGIAN/LEBIH BAIK di satu sisi. `DiffStocktake` murni dan diuji (`domain/library.go:199-227`, `domain/policy_test.go:144-158`) menghasilkan `missing` dan `unexpected` (barcode discan tapi tidak expected, praktis = eksemplar `on_loan` yang ternyata ada di rak; lama tidak melaporkan ini).
  - Finish mengubah status item: HILANG. `Close` hanya set `closed`, `ended_on`, `notes` (`service/stocktake.go:97`). Tidak ada `mark_missing_as`, tidak ada event; `missing` hanya dikembalikan sekali di respons dan tidak disimpan, setelah halaman ditutup, hasil opname tidak bisa dilihat lagi (tidak ada endpoint hasil/scans).
  - Laporan XLSX per sesi: HILANG.
  - Authz: BERBEDA. `manage_library_catalog` untuk start/scan/close (`library.yaml:468`, `:512`, `:541`), lama `circulate_library`. Bukan regresi, tapi berbeda.
- Tambahan di kode baru: `unexpected` list; fungsi diff murni yang diuji; unik `(stocktake_id, copy_id)` di skema (`0062:163`).
- Verdict fitur: SEBAGIAN. Alur buka–scan–tutup ada dan benar, tetapi opname tidak "mengubah apa pun" (tidak menandai hilang), hasilnya tidak tersimpan, dan eksemplar yang sudah hilang selalu terhitung missing lagi.

---

### Laporan (summary SNP, overdue, loans, visits, accession, members, popular; XLSX)

- Referensi lama (`library_reports.go`):
  - Rentang `from`/`to` default 30 hari terakhir, inklusif `DATE(...) BETWEEN` (`:16-33`); semua mendukung `format=xlsx` (`writeLibraryXlsx :35-57`, header biru + freeze panes).
  - Summary (`:73-188`): titles_by_ddc (kelas = digit pertama DDC, join `library_ddc_classes`), items_by_category, items_by_material_type, fiction_ratio (kategori `code='fiksi'` vs sisanya, `:131-133`), students_total (role siswa aktif), members_total, `items_per_student`, additions_in_period, loans/visits_in_period, `loans_per_student`, `visits_per_student` (`libReportsSafeDiv :65-70`), active_borrowers (distinct user pinjaman aktif), overdue_now, last_stock_opname `{name, ended_on, missing_count}` (missing dihitung dari event `opname` dengan note `LIKE 'Opname <id>:%'`, `:146-150`).
  - Overdue (`:191-209`): daftar loan item `dipinjam` & `due_on < CURDATE()` urut jatuh tempo, hari telat = kalender.
  - Loans periode (`:212-235`), Visits periode + per_day + per_class (`:238-282`), Accession/Buku Induk per `acquired_on` (`:285-334`), Members + per_type + per_class (`:337-389`), Popular: top 20 judul dan top 20 peminjam (dengan kelas) dalam periode (`:392-475`).
  - Authz `view_library_reports`.
- Sekarang:
  - Rentang: BERBEDA. `from`/`to` wajib (`library.yaml:570-571`), tanpa default 30 hari; `borrowed_at >= from AND < to` setengah terbuka (`queries/library.sql:102-105`), hari `to` tidak ikut, UI mengirim `to = hari ini` (`library-reports-view.tsx:27-29`, `:41`) sehingga pinjaman hari ini tidak pernah tampil di laporan.
  - Loans periode: SEBAGIAN (`service/reports.go:14-16`; hanya id-id, tanpa nama peminjam/judul, tanpa xlsx).
  - Overdue: BERBEDA/LEBIH BAIK di isi, SEBAGIAN di bentuk. Dikelompokkan per anggota dengan `loan_count` dan `total_fine` yang dihitung dari policy "seolah dikembalikan hari ini" (`service/reports.go:28-55`, `domain.CalculateFine`); lama per-item dengan hari telat. Tidak ada nama anggota (hanya `member_user_id`, `transport/http/reports.go:28`), tidak ada xlsx.
  - Popular: SEBAGIAN. Hanya judul terpopuler (`service/reports.go:63-84`, limit ≤100), tanpa peminjam teraktif/kelas, tanpa xlsx.
  - Summary SNP/akreditasi (DDC, kategori, jenis, rasio fiksi, per siswa, opname terakhir): HILANG.
  - Visits, Accession/Buku Induk, Members: HILANG (tidak ada tabel kunjungan/anggota/nomor induk di modul ini).
  - XLSX untuk semua laporan: HILANG. Modul `reports` umum ada (`docs/12-roadmap.md:111`), tetapi laporan perpustakaan tidak dirutekan ke sana.
  - Authz `view_library_reports`: SAMA (`library.yaml:567`, `:587`, `:606`).
- Tambahan di kode baru: estimasi denda per anggota di laporan overdue.
- Verdict fitur: SEBAGIAN. Tiga dari tujuh laporan ada dalam bentuk minimal; laporan akreditasi (summary) dan buku induk yang paling dibutuhkan pustakawan hilang.

---

### Laporan bulanan siap cetak (HTML A4)

- Referensi lama (`library_monthly_report.go`):
  - `GET /reports/monthly.html?month=YYYY-MM`, default bulan berjalan, rentang `[awal bulan, awal bulan berikutnya)` (`parseLibraryReportMonth :23-35`).
  - 12 indikator: total judul/eksemplar, penambahan judul/eksemplar bulan ini, total anggota, kunjungan bulan ini, rata-rata kunjungan/hari (dibagi jumlah hari kalender bulan itu, `:99-100`), peminjaman, pengembalian, pengembalian telat (`late_days>0`), total denda tercatat (violations `denda` yang loan item-nya dikembalikan bulan itu, `:104-107`).
  - Top 10 judul, top 10 peminjam + kelas (tahun ajaran aktif), kunjungan per kelas ("Lainnya" untuk tanpa kelas) (`:109-173`).
  - Kop sekolah dari general settings/gambar header, nama perpustakaan dari setting, kolom tanda tangan Pustakawan/Kepala Sekolah, auto `window.print()` (`:190-329`); format angka `libraryFormatFloat` koma desimal, `libraryFormatRupiah` titik ribuan (`:216-253`).
- Sekarang: HILANG. Tidak ada endpoint, template, maupun padanan di modul reports umum.
- Tambahan di kode baru: tidak ada.
- Verdict fitur: HILANG.

---

### Operasi (`library_operations.go`: dashboard dan helper bersama) dan operasi massal/weeding

Catatan: di kode lama "operasi massal" hidup di `library_catalog_v2.go` (bulk status), dan "weeding" tidak punya endpoint khusus, dilakukan lewat ubah status `dihibahkan` (`library_items.go:777` menyarankannya) dan larangan hapus item yang punya riwayat. `library_operations.go` sendiri berisi dashboard dan helper.

- Referensi lama:
  - Dashboard `GET /library/dashboard` untuk semua permission perpustakaan (`libOpsAnyLibraryPermission :256-259`): summary 11 angka (titles, items, available, on_loan, overdue, members, active_members, visits_today, loans_today, returns_today, unpaid_fines_total) (`:278-290`), 10 pinjaman terbaru, 10 telat terlama, 10 judul populer sepanjang masa, deret 30 hari pinjam/kembali dan kunjungan (`:292-380`).
  - Helper: `libOpsFindItemByCode` barcode/no_induk/rfid (`:47-55`), `libOpsRecordItemEvent` (`:75-85`), `libOpsResolveMemberUserID` (user_id/username/member_no/NIS, `:58-72`), auto-register anggota dengan nomor anggota berformat + retry (`:90-125`), `libOpsScanLoanItemRow` hitung `is_overdue`/`days_left` (`:216-236`).
  - Bulk status (v2 `:517-593`) dan weeding via status `dihibahkan` + `dihapus` hanya bila tanpa riwayat (`items.go:769-790`).
  - Setting `library.*` dari `app_settings` (`library_common.go:47-120`): format no_induk, sumber barcode, hari tutup, booking, denda, pengingat, auto-register.
- Sekarang:
  - Dashboard perpustakaan: HILANG. Tidak ada endpoint ringkasan; UI mengarah langsung ke katalog/sirkulasi/opname/laporan.
  - Cari item by code multi-kolom: SEBAGIAN (barcode saja, `queries/library.sql:44-45`).
  - Riwayat event item: HILANG.
  - Resolve anggota multi-identitas & auto-register: di luar lingkup bagian ini (anggota), tetapi `MemberDirectory` hanya mengembalikan nama (`service/service.go:78-80`, `wiring/library.go:15-21`).
  - Bulk status: HILANG. Weeding (dihibahkan/rusak/perbaikan) HILANG, satu-satunya jalan keluar dari sirkulasi adalah `MarkLost` dari pinjaman aktif (`service/loans.go:146-169`); buku yang rusak di rak tidak bisa ditarik.
  - Setting perpustakaan: BERBEDA. Digantikan `Policy` berversi 6 angka (`domain/policy.go:13-33`); tidak ada format nomor induk, sumber barcode, hari tutup, atau modul on/off yang ditegakkan.
  - Gate modul nonaktif: HILANG (lihat catatan lintas fitur).
- Tambahan di kode baru: policy berversi dengan `Validate()` (`domain/policy.go:35-41`), `clock.Clock` injeksi untuk pengujian.
- Verdict fitur: HILANG. Dashboard, operasi massal, dan jalur weeding tidak ada; helper yang tersisa hanya sebagian kecil.

---

## Ringkasan

| Fitur                                                                   | Verdict  | Gap terpenting                                                                                                                         |
| ----------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Master data katalog (jenis bahan, kategori, sumber, mitra, lokasi, DDC) | HILANG   | Tidak ada tabel/endpoint; `classification` teks bebas menggantikan semuanya                                                            |
| Katalog v1: bibliografi                                                 | SEBAGIAN | ISBN tidak dinormalisasi dan pencarian `isbn =` persis (`queries/library.sql:26`); nomor panggil otomatis dan fulltext hilang          |
| Katalog v2: ISBN eksternal, bulk status, ekspor, mapping import         | HILANG   | Lookup Open Library/Google Books (`docs/02:34` direncanakan) dan bulk status tidak ada                                                 |
| Eksemplar: nomor induk, barcode, status, riwayat                        | SEBAGIAN | Nomor induk hilang, barcode wajib manual, tidak ada endpoint ubah status manual/hapus, tidak ada `item_events`                         |
| Import koleksi (template/preview/commit)                                | HILANG   | Tidak ada jalur migrasi dari INLISLite/XLSX                                                                                            |
| Label eksemplar                                                         | SEBAGIAN | PDF teks satu label per request tanpa Code 128 dan grid A4 (diakui `docs/12:136`)                                                      |
| Opname / stocktake                                                      | SEBAGIAN | Close tidak mengubah status item dan hasil tidak tersimpan; `withdrawn` ikut expected (`queries/library.sql:52`) jadi selalu "missing" |
| Laporan                                                                 | SEBAGIAN | Summary SNP, buku induk, kunjungan, anggota, dan XLSX hilang; rentang `[from,to)` melewatkan hari `to`                                 |
| Laporan bulanan cetak                                                   | HILANG   | Tidak ada padanan sama sekali                                                                                                          |
| Operasi (dashboard, bulk, weeding, setting, gate modul)                 | HILANG   | Tidak ada dashboard, tidak ada cara menarik buku rusak dari rak, gate `modules.library_enabled` tidak ditegakkan untuk library         |

Tiga hal yang paling merugikan pengguna harian dan tidak tercatat sebagai keputusan di `docs/README.md`/`docs/11`: (1) tidak ada nomor induk dan status perawatan/weeding, (2) opname tidak menandai buku hilang dan hasilnya hilang setelah halaman ditutup, (3) ISBN tidak dinormalisasi sehingga dedupe judul tidak bekerja.
