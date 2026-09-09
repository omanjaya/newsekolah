# 14. API publik: kunci API dan webhook

Dokumen ini menutup bagian "API publik + webhook" dari Fase 5 (`docs/12-roadmap.md`). Modul `apps/api/internal/modules/integrations` memberi sekolah akses mesin ke datanya sendiri lewat dua mekanisme: kunci API untuk memanggil endpoint yang sudah ada, dan endpoint webhook untuk menerima notifikasi peristiwa secara push. Keduanya memakai jalur autentikasi dan otorisasi yang sama dengan sesi pengguna biasa; tidak ada aturan akses kedua yang terpisah untuk dijaga konsistensinya.

## 1. Kunci API

### 1.1 Membuat kunci

Admin sekolah dengan permission `manage_integrations` membuat kunci lewat `POST /v1/integrations/api-keys`: nama, daftar permission yang diberikan ke kunci itu, dan opsional daftar IP yang diizinkan, batas kedaluwarsa, dan batas laju per menit.

Aturan yang ditegakkan di `service.CreateKey` (`internal/modules/integrations/service/apikeys.go`), sebelum baris apa pun ditulis:

1. Setiap kode permission yang diminta harus ada di katalog statis (`authz.Codes()`).
2. **Permission kunci tidak pernah boleh melebihi permission efektif penciptanya sendiri, dicek pada saat pembuatan** lewat `authz.PermissionsProvider.EffectivePermissions`. Meminta satu saja permission yang tidak dimiliki pembuat menggagalkan seluruh permintaan (`API_KEY_PERMISSION_EXCEEDS_USER`), bukan memberikan subset yang berhasil sebagian.
3. Daftar IP (bila diisi) divalidasi sebagai alamat IP atau blok CIDR yang sah.

Rahasia kunci (secret) dibuat acak 256-bit (`auth.NewRandomPassword`), di-hash dengan Argon2id (`auth.HashPassword`, algoritma yang sama dengan password pengguna) sebelum disimpan, dan dikembalikan ke pemanggil **hanya satu kali**, digabung dengan id kunci menjadi satu token:

```
nsk_<key id uuid>.<secret>
```

Token ini dipakai sebagai bearer token biasa:

```
Authorization: Bearer nsk_018f2c1a-....<secret>
```

Setelah respons ini, hanya hash yang tersimpan; tidak ada cara memulihkan token asli. Kalau hilang, buat kunci baru dan cabut yang lama.

### 1.2 Bagaimana permintaan dengan kunci diautentikasi

`platform/auth.Authenticator.Middleware` mengenali token berawalan `nsk_` dan mengalihkannya ke jalur `APIKeyLookup` (diimplementasi oleh modul ini, `service.Authenticate`) alih-alih verifikasi JWT biasa. Untuk setiap permintaan:

1. Token diurai menjadi id kunci dan secret (`auth.ParseAPIKeyToken`).
2. Kunci dicari dalam transaksi tenant yang sudah diresolusi dari host (RLS tetap berlaku).
3. Ditolak bila: kunci tidak ditemukan, sudah dicabut (`API_KEY_REVOKED`), sudah kedaluwarsa (`API_KEY_EXPIRED`), secret tidak cocok, atau alamat IP pemanggil tidak ada dalam daftar izin kunci (`API_KEY_IP_NOT_ALLOWED`).
4. Bila valid, identitas yang dihasilkan **sama persis dengan identitas sesi**: `tenant_id` dan `user_id` (pemilik kunci) yang sama dipakai untuk resolusi tenant dan setiap keputusan otorisasi berikutnya (`platform/authz.Authorize`). Yang membedakan hanyalah `Identity.KeyPermissions`, yang mempersempit izin efektif ke subset yang diberikan ke kunci saat dibuat -- kunci tidak pernah bisa melakukan lebih dari yang bisa dilakukan penciptanya hari itu, bahkan bila permission penciptanya berubah setelahnya (irisan dicek pada setiap permintaan, bukan hanya saat pembuatan).
5. Setiap keberhasilan memperbarui `last_used_at` kunci.

Kunci yang dicabut (`POST /v1/integrations/api-keys/{apiKeyId}/revoke`) berhenti berfungsi pada permintaan berikutnya: langkah 3 di atas gagal sebelum otorisasi apa pun dievaluasi.

### 1.3 Audit

Setiap entri audit log yang dibuat lewat permintaan berbasis kunci menamai kunci itu: `platform/audit.Record` menyisipkan `api-key:<nama kunci>` ke kolom `user_agent` bila permintaan diautentikasi lewat kunci (dibaca dari `httpx.APIKeyNameFromContext`). Aktor yang tercatat tetap pemilik kunci -- kunci tidak punya identitas terpisah dari pemiliknya untuk kebutuhan siapa-melakukan-apa, hanya untuk kebutuhan kredensial-mana-yang-dipakai.

### 1.4 Rate limit

Setiap kunci punya `rate_limit_per_minute` sendiri (bawaan 60, bisa diatur 1-6000 saat pembuatan). `platform/auth.APIKeyRateLimiter` menegakkannya dengan mekanisme yang sama dengan pembatas laju login (`platform/auth.LoginRateLimiter`): penghitung berjendela di `KVStore` (Redis di produksi, in-memory untuk dev tanpa Redis), bukan mekanisme kedua yang terpisah. Permintaan yang melebihi batas mendapat `429 API_KEY_RATE_LIMITED`.

## 2. Webhook

### 2.1 Mendaftarkan endpoint

`POST /v1/integrations/webhook-endpoints` (permission `manage_integrations`) menerima URL tujuan, deskripsi opsional, dan daftar jenis peristiwa yang ingin diterima (lihat katalog di bagian 3).

Sebelum endpoint disimpan, `service.RegisterEndpoint` menolak:

- URL yang bukan `http://` atau `https://` absolut.
- **URL yang hostnya diselesaikan (atau, sebagai alamat literal, memang berupa) alamat loopback, link-local, atau privat** (`domain.IsDisallowedAddress`, dicek lewat `net.LookupHost` pada host yang bukan alamat IP literal). Ini mencegah pendaftaran endpoint yang menjadikan worker pengiriman webhook sebagai alat probe jaringan internal API sendiri (SSRF). Pengecekan yang sama berjalan setiap kali endpoint diedit.
- Jenis peristiwa yang tidak ada di katalog.

Rahasia penandatanganan (signing secret) dibuat acak 256-bit sekali, dienkripsi saat disimpan dengan AES-256-GCM (`platform/crypto.Sealer`, kunci yang sama dipakai modul lain untuk data sensitif) sehingga tidak pernah tersimpan sebagai teks biasa, dan hanya dibuka kembali sesaat sebelum menandatangani satu pengiriman. Rahasia tidak pernah ditampilkan lagi setelah dibuat; sekolah yang ingin rahasia baru mendaftarkan endpoint baru.

### 2.2 Skema tanda tangan

Setiap pengiriman membawa header:

```
X-Newsekolah-Signature: t=<unix timestamp>,v1=<hex hmac-sha256>
```

Tanda tangan dihitung sebagai `HMAC-SHA256(signing_secret, "<timestamp>.<raw body>")`, di-hex-encode (`domain.SignPayload` / `domain.SignatureHeaderValue`). Konstruksi ini sama dengan yang dipakai Stripe dan GitHub, sehingga sebagian besar pustaka verifikasi webhook yang sudah ada bisa langsung dipakai.

**Cara penerima memverifikasi satu pengiriman:**

1. Ambil `t` dan `v1` dari header `X-Newsekolah-Signature`.
2. Tolak bila `t` terlalu lampau menurut kebijakan penerima sendiri (jendela replay yang disarankan: 5 menit) -- ini tanggung jawab penerima, bukan bagian dari perhitungan tanda tangan.
3. Hitung ulang `HMAC-SHA256(signing_secret, "<t>.<raw request body>")` dengan rahasia yang diberikan saat pendaftaran endpoint, dan bandingkan dengan `v1` dalam waktu konstan.
4. Tolak bila tidak cocok, atau bila body sudah diuraikan lalu diserialisasi ulang sebelum verifikasi (tanda tangan menutupi byte body persis seperti yang dikirim, bukan representasi JSON yang diuraikan).

Setiap pengiriman juga membawa `X-Newsekolah-Event` (jenis peristiwa) dan `X-Newsekolah-Delivery` (id pengiriman, untuk dedup di sisi penerima bila permintaan sama diterima dua kali akibat percobaan ulang jaringan).

### 2.3 Katalog peristiwa

Jenis peristiwa yang bisa didaftarkan diambil langsung dari nama peristiwa yang sudah ada di `platform/events` (`internal/modules/integrations/service/catalog.go`), sehingga menambah satu jenis baru cukup menambah satu konstanta di sana:

| Jenis peristiwa             | Dipicu oleh                          |
| --------------------------- | ------------------------------------ |
| `attendance.submitted`      | Presensi direkam                     |
| `substitution.requested`    | Permintaan pengganti mengajar dibuat |
| `substitution.responded`    | Permintaan pengganti direspons       |
| `leave_request.submitted`   | Pengajuan izin diajukan              |
| `leave_request.reviewed`    | Pengajuan izin ditinjau wali kelas   |
| `leave_request.issued`      | Surat izin diterbitkan               |
| `exit_permit.stage_changed` | Tahap izin keluar berubah            |
| `exit_permit.issued`        | Izin keluar diterbitkan              |
| `exit_permit.exited`        | Siswa tercatat keluar gerbang        |
| `late_arrival.opened`       | Catatan terlambat dibuka             |
| `late_arrival.updated`      | Catatan terlambat diperbarui         |
| `warning_letter.issued`     | Surat peringatan diterbitkan         |
| `announcement.published`    | Pengumuman dipublikasikan            |

Daftar yang sama tersedia lewat `GET /v1/integrations/event-types` untuk mengisi UI pemilihan peristiwa tanpa menduplikasi daftar di klien.

Setiap peristiwa di atas ada sebagai konstanta di `platform/events`; sebagian modul penerbit disambungkan lewat `internal/wiring/eventbridge.go` pada fase-fase sebelumnya, sebagian akan tersambung seiring modul terkait selesai -- endpoint yang berlangganan peristiwa yang penerbitnya belum aktif tidak menerima apa pun sampai penerbit itu ada, tanpa perlu perubahan pada modul ini.

### 2.4 Pengiriman, percobaan ulang, dan penonaktifan otomatis

Saat peristiwa terjadi, `Module.subscribeToEventCatalog` (di `module.go`) menerima peristiwa itu di bus in-process yang sama dipakai modul lain, mencari setiap endpoint aktif tenant tersebut yang berlangganan jenis peristiwa itu, dan untuk masing-masing endpoint menulis satu baris `integration_webhook_deliveries` plus satu job River (`integrations.deliver_webhook`) dalam transaksi yang sama -- baris log dan job pengiriman selalu konsisten satu sama lain.

Worker (`transport/jobs.DeliverWebhookWorker`):

- Mengirim `POST` ke URL endpoint dengan body JSON payload peristiwa, memberi waktu 10 detik.
- **Tidak pernah mengikuti redirect** (`http.Client.CheckRedirect` mengembalikan galat): endpoint yang ingin pindah URL harus didaftarkan ulang dengan URL baru, bukan diam-diam diikuti kemana pun redirect membawa (mencegah pengalihan payload bertanda tangan ke tujuan yang tidak diinginkan).
- Menganggap sukses hanya status `2xx`.

Jadwal percobaan ulang (`domain.BackoffDuration`, murni fungsi sehingga bisa diuji unit tanpa jam nyata): 30 detik, lalu berlipat dua setiap percobaan (1 menit, 2 menit, 4 menit, ...), dibatasi maksimum 1 jam antar percobaan, hingga maksimum 8 percobaan (`domain.MaxDeliveryAttempts`). Jadwal ini dipasang lewat `Worker.NextRetry`, bukan kebijakan retry bawaan River, supaya jadwal yang didokumentasikan di sini persis yang berjalan.

Setiap percobaan -- berhasil maupun gagal -- dicatat ke baris pengiriman yang sama: status (`pending` selagi masih menunggu percobaan berikut, `success`, atau `failed` setelah percobaan habis), jumlah percobaan, kode status terakhir, dan pesan galat terakhir. `GET /v1/integrations/webhook-deliveries` menampilkan log ini, bisa disaring per endpoint, dan `POST /v1/integrations/webhook-deliveries/{id}/retry` mengulang satu pengiriman yang sudah berhenti mencoba sendiri (`status = failed`).

Endpoint yang gagal total (percobaan habis tanpa satu pun sukses) menaikkan penghitung kegagalan beruntun endpoint itu. Setelah **5 pengiriman berturut-turut gagal total** (`domain.DisableAfterConsecutiveFailures`), endpoint otomatis dinonaktifkan (`status = disabled`) dan alasannya dicatat di `disabled_reason`; log pengiriman berikutnya untuk endpoint itu segera gagal dengan alasan "endpoint dinonaktifkan" tanpa mencoba jaringan sama sekali. Endpoint yang berhasil mengirim me-reset penghitung kegagalan beruntunnya ke nol.

## 3. Kode galat

| Kode                              | Arti                                                                   |
| --------------------------------- | ---------------------------------------------------------------------- |
| `API_KEY_INVALID`                 | Token tidak dikenali atau secret tidak cocok                           |
| `API_KEY_EXPIRED`                 | Kunci sudah melewati `expires_at`                                      |
| `API_KEY_REVOKED`                 | Kunci sudah dicabut                                                    |
| `API_KEY_IP_NOT_ALLOWED`          | Alamat pemanggil tidak ada dalam daftar izin kunci                     |
| `API_KEY_RATE_LIMITED`            | Kunci melebihi `rate_limit_per_minute`                                 |
| `API_KEY_PERMISSION_EXCEEDS_USER` | Permission yang diminta saat membuat kunci melebihi permission pembuat |
| `WEBHOOK_URL_NOT_ALLOWED`         | URL bukan http(s) absolut, atau resolusinya alamat privat/loopback     |
| `WEBHOOK_EVENT_TYPE_UNKNOWN`      | Jenis peristiwa tidak ada di katalog                                   |
| `WEBHOOK_ENDPOINT_DISABLED`       | Endpoint dinonaktifkan setelah gagal berulang                          |
| `WEBHOOK_DELIVERY_NOT_FAILED`     | Retry manual dipanggil pada pengiriman yang belum berstatus gagal      |

Setiap kode di atas memetakan ke pesan terlokalisasi di `platform/i18n/messages_integrations.go` dan status HTTP di `platform/httpx/errors_integrations.go`.
