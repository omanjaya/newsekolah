# 02. System Design

## 1. Tujuan sistem

Platform sistem informasi sekolah yang:

- dipakai banyak sekolah sekaligus (SaaS multi-tenant) **dan** bisa dipasang sendiri oleh satu sekolah (self-host) dari image yang sama;
- melayani web, iOS, dan Android dari satu API;
- mempertahankan seluruh fitur SION dan menambah onboarding, orang tua, WhatsApp, laporan terpusat;
- aman untuk data anak (UU PDP) sejak hari pertama.

Nama produk sementara: NouSchool (kode repo `newsekolah`). Nama akhir tidak memengaruhi desain karena semua branding per tenant.

## 2. Konteks

```
                +-------------------+      +-------------------+
                |  Web (Next.js)    |      |  Mobile (Expo)    |
                |  guru/siswa/admin |      |  iOS + Android    |
                +---------+---------+      +---------+---------+
                          |  HTTPS/WSS (OpenAPI SDK)  |
                          v                           v
   Caddy (TLS, wildcard *.nouschool.id, custom domain) ----> Next.js (SSR halaman publik/OPAC)
                          |
                          v
                 +-------------------+     Redis (cache sesi, rate limit, pub-sub WS)
                 |  API Go           | --> PostgreSQL 16 (RLS per tenant)
                 |  modular monolith | --> S3/MinIO (file privat, URL bertanda tangan)
                 |  + River worker   | --> Push: Web Push, APNs, FCM
                 +-------------------+ --> WhatsApp Business API / SMTP
                          ^
        Konsol platform (operator SaaS): onboarding sekolah, billing, kesehatan
```

Sistem eksternal: Dapodik (import Excel), e-Rapor (ekspor XLSX), Google Workspace (SSO opsional), Open Library / Google Books (ISBN), Indonesia OneSearch (OAI-PMH, fase lanjut), payment gateway (modul SPP, fase lanjut).

## 3. Multi-tenancy

| Aspek           | Keputusan                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model data      | Shared database, shared schema, kolom `tenant_id` + Row Level Security. Dedicated database untuk tenant besar dimungkinkan lewat konfigurasi DSN per tenant tanpa perubahan kode                              |
| Resolusi tenant | Host: `<slug>.nouschool.id` atau custom domain terverifikasi (CNAME + TXT). Mobile: pengguna memilih sekolah (pencarian slug) sekali; klaim `tid` di token                                                    |
| Identitas       | Pengguna milik satu tenant (`UNIQUE (tenant_id, username)`, `UNIQUE (tenant_id, email)`). Orang tua dengan anak di dua sekolah mempunyai dua akun; penggabungan identitas global adalah pekerjaan fase lanjut |
| Konfigurasi     | `tenant_settings` bertipe (JSON Schema per kunci) + `platform_settings` default; feature flag per tenant per modul                                                                                            |
| Isolasi lain    | Prefix `tenant_id` di kunci Redis, path S3 `tenants/<id>/...`, job queue args, log dan metrik berlabel tenant                                                                                                 |
| Mode self-host  | `TENANCY_MODE=single` membuat satu tenant saat bootstrap dan mematikan konsol platform; kode sama                                                                                                             |
| Offboarding     | Ekspor lengkap (SQL + file) dan penghapusan terjadwal per tenant sebagai fitur konsol                                                                                                                         |

## 4. Komponen

### 4.1 API (Go)

Modular monolith, satu binary dengan dua mode proses: `api` dan `worker` (bisa digabung untuk sekolah kecil). Detail lapisan di [03-layered-architecture.md](03-layered-architecture.md).

Modul: identity, school, academic, scheduling, attendance, permits, discipline, grading, journal, announcements, notifications, library, reporting, parent (baru), onboarding (baru), platform (konsol SaaS).

### 4.2 Workflow engine ringan

Izin keluar, terlambat, dan izin terencana sekarang berupa enum tahap hardcoded. Desain baru: tabel `workflow_definitions` per tenant per jenis dengan daftar tahap terurut; setiap tahap punya `approver_rule` (contoh: `duty:piket`, `teacher_of_class_now`, `duty:bk`, `duty:leadership`, `homeroom_of_student`) dan `verification` (`qr_scan`, `manual`, `auto`). Instance workflow menyimpan `current_stage_index` dan event. Definisi default identik dengan alur SION sehingga migrasi perilaku nol, tetapi sekolah lain dapat menghapus atau menambah tahap tanpa perubahan kode.

### 4.3 Aturan yang dapat diatur (policy)

Tabel `tenant_policies` bertipe, dengan default platform:

- `attendance.statuses`: daftar kode, label, warna, apakah dihitung hadir (default H/S/I/D/A).
- `attendance.correction_days`, `attendance.default_status`.
- `discipline.sp_levels`: array `{level, min_points, label}` (default 3 level 25/50/75).
- `late_arrival.actions`: peta hitungan ke aksi (default 2 dan 5 telepon, 3 dan 6 pulangkan).
- `grading.scale` (0-100 default), `grading.component_types`, `grading.report_increase_max`.
- `calendar.terms` (semester/trimester), `calendar.active_days`, `calendar.timezone`.
- `documents.numbering`: template per jenis dokumen dengan sequence per tenant per tahun.
- `permits.categories`, `permits.max_per_day`, `permits.evidence_required`.

### 4.4 Web (Next.js)

App Router; halaman aplikasi client-side dengan TanStack Query; halaman publik (login, OPAC, verifikasi dokumen, monitor) server-rendered. PWA tetap ada. Detail komponen di [05-shared-components.md](05-shared-components.md).

### 4.5 Mobile (Expo)

Lihat [10-mobile-strategy.md](10-mobile-strategy.md).

### 4.6 Worker dan job

River (Postgres) untuk: pengiriman notifikasi (push web/APNs/FCM, WhatsApp, email), pengingat jatuh tempo perpustakaan, penutupan otomatis alur terlambat dan izin keluar di akhir hari, pembersihan token, ekspor laporan besar, import besar, backup harian per tenant, agregasi statistik harian, retensi data.

### 4.7 Realtime

WebSocket per pengguna (notifikasi, hasil scan, status izin) dan per layar monitor (token tampilan). Pub-sub Redis untuk multi-instance. Klien mobile memakai WebSocket yang sama dengan bearer header.

### 4.8 File

Semua unggahan ke S3 privat lewat presigned upload dari API (klien tidak lewat API untuk byte file). Gambar diproses oleh worker (decode ulang, strip EXIF, WebP, ukuran varian). Dokumen resmi (surat, SP, kartu, label) dirender server sebagai PDF dan disimpan dengan hash isi.

## 5. Model domain inti (ringkas)

```
Tenant 1..* AcademicYear 1..* Term
Tenant 1..* User *..* Role (per tenant) ; User 1..1 Profile (student|teacher|staff|parent)
AcademicYear 1..* Class (grade_level, track, homeroom_teacher) 1..* Enrollment (student, status, history)
AcademicYear 1..* Subject, Room, Period (+ day overrides), DutyType 1..* DutyAssignment (user, scope)
Schedule (class, subject, teacher, room?, day, period range) 1..* AttendanceSession (date) 1..* AttendanceEntry (student, status)
WorkflowDefinition (kind, stages) 1..* WorkflowInstance (subject: exit permit | late arrival | leave request) 1..* WorkflowEvent
ViolationType 1..* ViolationRecord (student, points, session?) ; WarningLetter (level, number, snapshot)
Counseling (student, counselor, type, encrypted notes)
AssessmentComponent 1..* Grade ; GradePublication ; ReportAnalysis ; StarEvent
Announcement 1..* Notification ; PushDevice ; NotificationPreference
Library: Bibliography 1..* Item ; Member ; Loan 1..* LoanItem ; Booking ; Fine ; StockOpname ; Visit
ScanToken (purpose, context, hash, expires, consumed) ; DocumentTemplate ; DocumentSequence ; AuditLog
```

Skema lengkap di [06-database-schema.md](06-database-schema.md).

## 6. Alur kunci

### 6.1 Presensi guru

1. Guru membuka beranda; API `GET /me/home` mengembalikan jadwal hari ini dengan status sesi.
2. Guru membuka sesi; service membuat `attendance_session` idempoten (`INSERT ... ON CONFLICT DO NOTHING RETURNING`).
3. Guru mengubah status siswa; klien menyimpan draf lokal (offline) dan mengirim batch dengan Idempotency-Key.
4. Service menerapkan policy: izin terbit menimpa, siswa dalam workflow terlambat aktif hari ini dilewati, validasi jendela waktu/koreksi.
5. Event `AttendanceSubmitted` memicu pembaruan monitor, statistik harian, dan (bila diaktifkan) notifikasi orang tua untuk status A.

### 6.2 Izin keluar dengan QR

1. Siswa membuat instance workflow `exit_permit`; service memeriksa kuota dan izin aktif.
2. Setiap tahap: guru menampilkan QR (scan token `purpose=approve_stage`, konteks jenis workflow); siswa memindai; service memverifikasi token, evaluasi `approver_rule` tahap saat ini, catat event, maju ke tahap berikutnya.
3. Tahap terakhir menghasilkan gate token (purpose `gate_exit`, kedaluwarsa akhir periode); satpam memindai; instance selesai.
4. Job akhir hari menutup instance yang menggantung sebagai `expired` sehingga tidak memblokir presensi esok hari.

### 6.3 Onboarding sekolah baru (SaaS)

1. Operator platform membuat tenant (slug, jenjang, zona waktu, paket modul) di konsol; admin sekolah menerima tautan set-password.
2. Wizard admin: profil dan logo, tahun ajaran, template jam pelajaran, import guru dan siswa (Excel/Dapodik), penugasan wali kelas, undang pengguna.
3. Checklist kesiapan menampilkan yang belum lengkap; sekolah bisa mencoba dengan data contoh yang dapat dihapus satu klik.

## 7. Non-fungsional

| Aspek          | Target                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Kinerja        | p95 API < 300 ms untuk daftar berpaginasi; beranda mobile satu request < 500 ms; presensi 40 siswa tersimpan < 1 detik     |
| Skala          | 500 sekolah x 1.500 pengguna pada 3 instance API + 1 Postgres primary + replica baca; sekolah tunggal pada VPS 2 vCPU/4 GB |
| Ketersediaan   | 99,5% SaaS; deploy tanpa downtime (rolling), migrasi kompatibel mundur                                                     |
| Data           | Backup harian per tenant + PITR 7 hari; uji restore otomatis bulanan; retensi sesuai kebijakan                             |
| Observability  | Trace per request dengan `tenant_id`; dashboard error rate, latency, antrean job; alert per tenant                         |
| Aksesibilitas  | WCAG 2.2 AA pada web; VoiceOver/TalkBack pada alur utama mobile                                                            |
| Bahasa         | `id` default, `en`; format tanggal/angka mengikuti locale tenant                                                           |
| Kompatibilitas | Browser 2 versi terakhir + Android WebView 100+; iOS 16+; Android 8+                                                       |

## 8. Deployment

- **SaaS**: Kubernetes kecil atau Nomad; Postgres terkelola (atau Patroni), Redis, MinIO/R2; Caddy dengan on-demand TLS untuk custom domain; GitHub Actions membangun image dan menjalankan migrasi sebagai job sebelum rollout.
- **Self-host**: `docker compose up` dengan Postgres, Redis, MinIO, api, worker, web, caddy; skrip `bootstrap` membuat tenant tunggal dan admin pertama; backup ke S3 milik sekolah.
- Environment identik antara keduanya; perbedaan hanya `TENANCY_MODE` dan skala.

## 9. Migrasi data dari SION lama

Skrip ETL Go sekali jalan: baca MySQL SION, tulis ke Postgres dalam satu tenant, pemetaan ID lama ke UUID baru disimpan di tabel `legacy_id_map` untuk verifikasi dan tautan lama. Urutan: users dan detail, tahun ajaran, master data, penugasan, jadwal, presensi, workflow (status enum dipetakan ke tahap definisi default), disiplin, penilaian, notifikasi (hanya 90 hari terakhir), perpustakaan, file (salin ke S3). Validasi jumlah baris per tabel dan sampel acak dibandingkan lewat laporan otomatis.
