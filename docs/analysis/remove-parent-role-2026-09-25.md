# Penghapusan akun orang tua (backend), 25 Sep 2026

Keputusan pemilik produk: akun login orang tua ("orang tua", role slug
`parent`) dan setiap fitur untuk orang tua yang masuk dihapus dari produk
sepenuhnya. Data kontak wali (nama wali, telepon, alamat, hubungan) pada
profil siswa **dipertahankan**, karena surat peringatan, surat izin,
laporan, dan pesan WhatsApp ke wali masih memakainya. Yang hilang hanya:
akun login orang tua, tautan akun orang tua-siswa, dan fitur yang ada
khusus untuk orang tua yang login.

Sesi ini mengerjakan separuh backend (API, database, OpenAPI, seed, ETL,
authz, docs). Web dan mobile dikerjakan agen lanjutan terpisah; kode
sumber `apps/web`/`apps/mobile` tidak disentuh di sini kecuali file klien
API hasil generate (`packages/api-client/src/gen/schema.d.ts`).

## 1. Inventaris: fitur akun orang tua (dihapus) vs data kontak wali (tetap)

### 1.1 Modul `family` (Go) -- dihapus seluruhnya

`apps/api/internal/modules/family/` adalah _satu-satunya_ modul yang
seluruh isinya adalah "tampilan orang tua": baca presensi/nilai/disiplin
anak yang tertaut, dan mengajukan izin atas nama anak. Tidak ada bagian
modul ini yang berisi data kontak wali -- seluruh modul dihapus:
`module.go`, `service/service.go`, `service/service_test.go`,
`transport/http/handler.go`.

### 1.2 authz -- role, permission, profile kind

- `platform/authz/role_defaults.go`: `RoleSlugParent = "parent"` dan
  seluruh entri `RoleDefault` untuk `parent` (Orang Tua) dihapus dari
  `RoleDefaults()`. Ini otomatis membuat `migrator.EnsureTenantDefaults`
  (yang membaca `RoleDefaults()` secara dinamis) berhenti menciptakan
  ulang role `parent` untuk tenant manapun, tanpa menyentuh
  `tenant_defaults.go` itu sendiri.
- Permission khusus orang tua, dihapus dari katalog (`permissions.go`,
  `permissions_billing.go`, `permissions_permits.go`) setelah dikonfirmasi
  tidak dipakai role lain: `view_child_attendance`, `view_child_grades`,
  `view_child_billing`, `approve_child_leave_requests`.
- `identity/domain/user_admin.go`: `ProfileParent` dihapus dari
  `ProfileKind` dan `Valid()`.

### 1.3 identity -- tautan akun orang tua-siswa

- `identity/service/parents.go`: dihapus seluruhnya (`Child`, `Guardian`,
  `ParentsRepository`, `LinkChild`, `UnlinkChild`, `MyChildren`,
  `GuardiansOf`, `IsParentOf`). `ClassRef` dan `ActiveClassForStudent`
  (dipakai `/v1/me` untuk kelas aktif siswa sendiri -- fitur umum, bukan
  fitur orang tua) dipindah ke `identity/service/me.go` sebagai
  `StudentClassRepository`.
- `identity/transport/http/parents.go`: dihapus seluruhnya
  (`ListMyChildren`, `ListUserChildren`, `LinkChild`, `UnlinkChild`,
  `ListStudentGuardians`).
- `identity/repository/repository.go`: method `LinkParentStudent`,
  `UnlinkParentStudent`, `ListChildren`, `ListGuardians`, `IsParentOf`
  dihapus; `ActiveClassForStudent` dipertahankan.
- `identity/queries/parents.sql`: dihapus, digantikan
  `identity/queries/student_class.sql` (hanya `GetActiveClassForStudent`).
- Bulk import user (`identity/domain/import.go`,
  `identity/service/import_template.go`): `profile_kind` tidak lagi
  menerima `parent`; alias role `orangtua`/`orang_tua`/`ortu`/`wali` ->
  `parent` dihapus dari `roleAliases` dan dari lembar referensi template
  impor. Kolom **kontak** (`guardian_name`, `guardian_phone`,
  `father_name`, `mother_name`, `parent_occupation`) di baris impor
  **dipertahankan** -- itu tetap ditulis ke `student_profiles`.

### 1.4 permits -- tahap orang tua di alur izin, dan pengajuan atas nama anak

- `domain/approver_rule.go`: `RuleGuardianOfStudent` ("guardian_of_student")
  dihapus. Aturan ini **bukan** bagian dari `domain.DefaultStages` untuk
  `leave_request` (default sudah homeroom -> counselor sejak awal) --
  tenant harus opt-in lewat `ReplaceDefinition` untuk memakainya. Live DB
  tidak memakainya (dikonfirmasi tidak ada tenant yang mengaktifkannya),
  tapi migrasi 0119 tetap menangani instalasi lain yang mungkin sudah
  opt-in (lihat 2.3 di bawah).
- `service/leaverequest.go`: cabang "guardian mengajukan atas nama anak" di
  `SubmitLeaveRequest` dihapus (siswa selalu mengajukan izinnya sendiri
  sekarang); `ReviewLeaveRequestAsGuardian` dan
  `ListLeaveRequestsForGuardianReview` dihapus.
- `service/service.go`, `module.go`: interface `GuardianLinks`, field
  `guardians`, dan stub `noGuardians` dihapus.
- `domain/leaverequest.go`: field `ParentApprovedAt` dihapus (kolom
  `leave_requests.parent_approved_at` di database tidak pernah ditulis
  kode manapun -- selalu `null` -- jadi ini murni pembersihan kolom mati,
  bukan penghapusan data yang pernah dipakai). `GuardianNameSnapshot`
  **dipertahankan** -- ini snapshot nama wali dari `student_profiles.
guardian_name` untuk cetak surat, bukan tautan akun.
- `transport/http/handler.go`, `convert.go`: handler
  `ListLeaveRequestsForGuardianReview`/`ReviewLeaveRequestAsGuardian` dan
  error map `ErrLeaveRequestGuardianNotLinked` dihapus.

### 1.5 attendance -- notifikasi ke orang tua saat siswa Alpha

- `service/events.go`: field `Submitted.GuardianUserIDs` dihapus.
- `service/entries.go`: blok yang memanggil `ListGuardianUserIDs` saat
  status = Alpha dan meneruskannya ke event `Submitted` dihapus.
- `service/service.go`: method `ListGuardianUserIDs` dihapus dari
  interface Repository.
- `repository/cross_reads.go`, `queries/cross_reads.sql`:
  `ListGuardianUserIDs`/`ListGuardianUserIDsForAttendance` (query ke
  `parent_students`) dihapus.
- `module.go`: `busPublisher.Publish` tidak lagi mengisi `Subject` dari
  guardian (Subject kosong untuk event ini sekarang -- lihat catatan di
  bawah soal bug pre-existing yang tidak disentuh).
- `attendance.yaml`'s `guardian_name`/`guardian_phone` pada status harian
  wali kelas (data kontak, bukan akun) **dipertahankan** tanpa perubahan.

### 1.6 discipline -- notifikasi ke orang tua saat surat peringatan terbit

- `service/letters.go`: field `WarningLetterIssued.GuardianIDs` dan method
  `guardianIDs()` dihapus.
- `service/service.go`, `module.go`: interface `GuardianReader`, field
  `guardians`, parameter `Guardians` di `Dependencies` dihapus.
- `wiring/discipline.go`: adapter `DisciplineGuardians` dihapus.
- `wiring/eventbridge.go`: baris yang menambahkan `e.GuardianIDs` ke
  daftar penerima notifikasi surat peringatan dihapus (penerima sekarang
  hanya siswa dan wali kelas).
- `GuardianName` (pada `StudentSnapshot`, dari `student_profiles.
guardian_name`) dan `guardian_name` di template surat **dipertahankan**
  tanpa perubahan -- itu data kontak untuk isi surat, bukan akun.

### 1.7 billing -- tampilan tagihan anak untuk orang tua

- `service/bills.go`: `ChildBillHistory` dan `ErrNotLinked` dihapus.
- `service/service.go`, `module.go`: interface `ParentLinkChecker`,
  field `links`, parameter `Links` di `Dependencies` dihapus.
- `transport/http/handler.go`: handler `GetChildBilling` dan entri
  `service.ErrNotLinked` di `errorMap` dihapus.
- `guardian_name` di template kuitansi (dari `StudentDisplay`, sumbernya
  tetap `student_profiles.guardian_name`) **dipertahankan**.

### 1.8 library -- role `parent` di tipe anggota

- `domain/members.go`: `RoleParent Role = "parent"` dihapus (tidak
  dipakai di tempat lain selain deklarasinya -- `librarydomain.
MemberTypeDefaults()` sudah hanya berisi `student`/`teacher` sejak
  awal, jadi tidak ada default tipe anggota untuk `parent` yang perlu
  dihapus). `GuardianPhone` di laporan pinjaman terlambat (data kontak,
  dari `student_profiles.guardian_phone`) **dipertahankan**.

### 1.9 Yang secara sengaja TIDAK disentuh

- `discipline` module's `CounselingKind` enum (`individual, group, parent,
referral` di `discipline.yaml` dan `domain/discipline.go`'s
  `CounselingParent`): ini label **format sesi konseling** ("sesi bersama
  orang tua hadir"), bukan referensi ke akun/role login. Dikonfirmasi
  lewat pembacaan kode -- tidak terkait tautan akun orang tua manapun.
  Dibiarkan apa adanya.
- "Wali kelas" (homeroom teacher) di mana pun -- istilah berbeda, bukan
  orang tua/wali murid.
- `cmd/etl`: tidak ada perubahan kode. `mapping/role.go` tidak pernah, dan
  tidak akan pernah, meresolusi role SION manapun ke `parent` (SION sendiri
  tidak punya entity "akun orang tua" terpisah untuk dipetakan). Hanya
  `docs/13-etl-sion.md` diperbarui untuk menyatakan ini eksplisit.

## 2. Migrasi 0119 (`apps/api/migrations/0119_remove_parent_role.{up,down}.sql`)

Live DB tidak punya role/akun `parent` sama sekali, tapi migrasi ditulis
generik untuk instalasi lain yang mungkin punya:

1. User yang satu-satunya profilnya `parent` (`user_profiles.kind =
'parent'`) dinonaktifkan (`status = 'inactive'`, bukan hapus paksa) dan
   seluruh sesinya dicabut (`sessions.revoked_at`/`revoked_reason`),
   sebelum baris `user_profiles`-nya dihapus (kind `parent` tidak lagi
   valid setelah langkah 3).
2. Tabel `parent_students` (tautan akun orang tua-siswa) di-drop. Migrasi
   down membuatnya ulang kosong.
3. `user_profiles.kind` check constraint diperbarui: tidak lagi menerima
   `'parent'`.
4. Role `parent` dihapus dari setiap tenant (`delete from roles where
slug = 'parent'`) -- `role_permissions`/`user_roles` cascade lewat FK
   yang sudah ada (migrasi 0002), sama seperti pola
   `0117_principal_role.up.sql`.
5. Permission `view_child_attendance`, `view_child_grades`,
   `approve_child_leave_requests`, `view_child_billing` dihapus dari
   katalog `permissions` (cascade ke `role_permissions`/
   `duty_permissions`).
6. `leave_requests.parent_approved_at` di-drop (kolom mati, tidak pernah
   ditulis).
7. Setiap `workflow_definitions` row (kind apa pun, bukan cuma
   `leave_request` -- `guardian_of_student` secara teknis bisa dipasang di
   stage kind mana pun) yang stage-nya memuat `approver_rule =
'guardian_of_student'` diperbaiki: stage itu dihapus dari array
   `stages`-nya (jsonb `-` index), dan setiap `workflow_instances` yang
   sedang `in_progress` di stage itu **dimajukan** ke stage berikutnya
   (index yang sama setelah array mengecil), atau **diselesaikan**
   (`status = 'completed'`) kalau itu tadinya stage terakhir. Setiap
   instance dengan `current_stage_index` di atas stage yang dihapus
   digeser turun satu. Sebuah baris `workflow_events` (`verification =
'auto'`) dicatat untuk tiap instance yang disentuh, sebagai jejak
   audit.

Diverifikasi lewat Postgres sungguhan (bukan `-short`): `migrate up`,
`migrate down 1`, `migrate up` lagi (roundtrip bersih), lalu `cmd/seed`
dan pemeriksaan SQL langsung yang mengonfirmasi tidak ada role/akun
`parent` tersisa.

## 3. Seed (`cmd/seed`)

- `main.go`: baris `{"ortu", "Orang Tua Contoh", "parent"}` di
  `systemUsers` dihapus; entri `"parent": "parent"` di
  `profileKindByRole` dihapus. `GuardianName: text("Orang Tua Contoh")`
  pada profil siswa demo **dipertahankan** (kini cuma string kontak biasa,
  tidak terikat ke akun `ortu`).
- `phase2.go`: fungsi `ensureParentLink` (memanggil
  `LinkParentStudent`) dan pemanggilnya dihapus.

## 4. OpenAPI

- `openapi/modules/family.yaml` dihapus seluruhnya (4 operasi:
  `getChildAttendance`, `getChildGrades`, `getChildDiscipline`,
  `submitChildLeaveRequest`; skema `ChildCalendarDay`, `ChildSubjectGrade`,
  `ChildGrades`, `ChildViolation`, `ChildWarningLetter`, `ChildDiscipline`).
- `openapi/base.yaml`: tag `family` dihapus.
- `openapi/modules/identity-admin.yaml`: operasi `listMyChildren`
  (`GET /v1/me/children`), `listUserChildren`/`linkChild`
  (`GET`/`POST /v1/users/{userId}/children`), `unlinkChild`
  (`DELETE /v1/users/{userId}/children/{studentId}`),
  `listStudentGuardians` (`GET /v1/students/{studentId}/guardians`)
  dihapus; skema `ParentRelation`, `LinkedChild`, `Guardian` dihapus;
  `ProfileKind` enum kehilangan `parent`. Kolom `UserImportRow` untuk data
  kontak (`guardian_name`, `guardian_phone`, `parent_occupation`, dst.)
  **dipertahankan**.
- `openapi/modules/permits.yaml`: operasi
  `listLeaveRequestsForGuardianReview`
  (`GET /v1/leave-requests/guardian-queue`) dan
  `reviewLeaveRequestAsGuardian`
  (`POST /v1/leave-requests/{instanceId}/guardian-review`) dihapus.
- `openapi/modules/billing.yaml`: operasi `getChildBilling`
  (`GET /v1/children/{studentId}/billing`) dihapus.
- `openapi/modules/library-members.yaml`: `parent` dihapus dari 3 enum
  role/`default_for_role`.
- `openapi/modules/identity.yaml`: `parent` dihapus dari `profile_kind`
  enum pada `/v1/me`.
- `openapi/modules/analytics.yaml`: teks deskripsi disesuaikan (tidak lagi
  menyebut `parent` sebagai salah satu `profile_kind`).
- `openapi/modules/discipline.yaml`'s `CounselingKind` enum (format sesi,
  lihat 1.9) **tidak diubah**.
- `pnpm openapi:bundle` dan `pnpm openapi:check` bersih setelahnya.

## 5. Regenerasi kode

- `go generate ./internal/gen/api/...` (oapi-codegen dari
  `openapi/openapi.yaml`).
- `sqlc generate` (setelah migrasi 0119 mengubah skema): menghasilkan
  ulang `internal/gen/db/*`, termasuk menghapus
  `ListGuardianUserIDsForAttendance`, `LinkParentStudent`,
  `UnlinkParentStudent`, `ListChildrenForParent`, `ListParentsForStudent`,
  `IsParentOfStudent`, dan field `ParentApprovedAt`. File generated lama
  yang jadi yatim (`internal/gen/db/parents.sql.go`) dihapus manual --
  sqlc tidak membersihkan file generated yang sumbernya sudah tidak ada.
- `pnpm api:gen` (openapi-typescript, `packages/api-client/src/gen/
schema.d.ts`) -- satu-satunya perubahan di `packages/api-client`, dan
  memang file hasil generate yang diizinkan disentuh sesuai batasan tugas.

## 6. Verifikasi

- `cd apps/api && go build ./... && go vet ./...`: bersih.
- `go test ./... -count=1` (Postgres sungguhan lewat testcontainers,
  bukan `-short`): seluruh paket lulus. Dua test yang tadinya gagal
  karena ekspektasi lama diperbarui ke perilaku baru:
  `identity/domain/import_test.go`'s `TestValidateImportRow/invalid_profile_kind`
  (pesan error tidak lagi menyebut `parent`) dan `TestResolveRoleAlias`
  (`"wali"` tidak lagi meresolusi ke `"parent"`, lewat sebagai slug custom).
  Dua file test yang seluruhnya tentang `guardian_of_student` dihapus
  (`permits/service/rules_test.go`, `permits/service/workflow_test.go`).
- `bash infra/scripts/check-migrations.sh apps/api/migrations`: bersih,
  0001-0119.
- `pnpm openapi:check`: bersih.
- Migrasi diverifikasi manual dengan Postgres sekali pakai: `migrate up`,
  `migrate down 1`, `migrate up` lagi, `cmd/seed`, lalu query SQL langsung
  yang mengonfirmasi tabel `roles` tidak punya slug `parent`, tidak ada
  user `ortu`, dan `user_profiles` tidak punya baris `kind = 'parent'`.

## 7. Catatan: bug pre-existing yang TIDAK disentuh

Saat menelusuri fan-out notifikasi `attendance.submitted`, ditemukan
bahwa `attendance/module.go`'s `busPublisher.Publish` dan
`wiring/eventbridge.go`'s `RegisterNotificationBridge` sama-sama
subscribe ke nama event yang identik ("attendance.submitted") --
`attendanceservice.Submitted{}.EventName()` kebetulan sama persis dengan
konstanta kanonik `events.AttendanceSubmitted`, berbeda dari pola modul
lain (mis. permits selalu memberi prefix `permits.` di
`EventName()`-nya, beda dari konstanta kanonik tanpa prefix). Ini
berpotensi membuat `eventbridge.go`'s handler untuk event itu melakukan
type assertion yang gagal terhadap `events.Envelope` yang sudah dibungkus
`busPublisher`. Ini bug independen dari penghapusan role orang tua (juga
berlaku identik untuk `scheduling`'s `SubstitutionRequested`/
`SubstitutionResponded`), tidak tercakup test manapun sebelum maupun
sesudah sesi ini, dan di luar cakupan tugas ini -- **tidak diperbaiki**,
hanya field `Subject` (dulu `GuardianUserIDs`) yang dikosongkan sesuai
tugas. Perlu sesi terpisah untuk memperbaiki tabrakan nama event ini.

## 8. Pecahan di web/mobile (untuk agen lanjutan)

`apps/web`/`apps/mobile` **tidak disentuh** kecuali
`packages/api-client/src/gen/schema.d.ts` (hasil `pnpm api:gen`).
`pnpm typecheck` (lewat turbo, dengan `@newsekolah/i18n` sudah ter-build
lebih dulu) menunjukkan pecahan berikut, seluruhnya karena operasi/skema
OpenAPI yang dihapus atau enum yang kehilangan nilai `parent`:

**Web** (`apps/web`):

- `features/family/api.ts`, `features/family/components/
child-record-sections.tsx`, `child-today-card.tsx`, `children-view.tsx`
  -- seluruh fitur `family` memakai operasi yang sudah dihapus
  (`/v1/me/children`, `/v1/children/{studentId}/attendance|grades|
discipline|billing`, `/v1/children/{studentId}/leave-requests`) dan
  skema (`LinkedChild`, `ParentRelation`, `ChildCalendarDay`, dst.).
  Kandidat kuat untuk dihapus seluruhnya.
- `apps/web/app/(app)/children/page.tsx` -- route yang merender
  `ChildrenView`; tidak muncul error tsc langsung tapi bergantung penuh
  pada `features/family`.
- `features/dashboard/components/dashboard-view.tsx` (baris 165, cek
  `profile_kind === "parent"`) dan `parent-child-summary.tsx` (+ test-nya,
  `parent-child-summary.test.tsx`) -- widget dashboard ringkasan anak
  untuk orang tua.
- `features/school/guardians-api.ts`, `features/school/components/
guardians-dialog.tsx`, `manage-children-dialog.tsx` -- layar admin
  "kelola tautan orang tua-siswa" (bukan data kontak wali), memakai
  operasi yang sama yang sudah dihapus di `identity-admin.yaml`.
- `features/school/components/user-form.tsx` (baris 20), `users-view.tsx`
  (baris 47, 160) -- literal `"parent"` untuk `profile_kind` di form dan
  daftar user.
- `features/permits/api.ts` (baris 335, 349), `features/permits/
components/leave-guardian-queue.tsx` -- antrean review izin sebagai
  guardian, memakai operasi permits yang sudah dihapus.
  `features/permits/components/leave-requests-view.tsx` mengimpor
  `GuardianQueue` dari file itu -- perlu dicek juga saat komponen itu dihapus.
- `features/library/components/member-register-form.tsx` (baris 35),
  `features/library/members-api.ts` (baris 138) -- opsi role `"parent"`
  saat mendaftar anggota perpustakaan.

**Mobile** (`apps/mobile`):

- `src/components/screens/ParentHome.tsx`, `src/app/(parent)/home.tsx`,
  `src/app/children/[studentId].tsx` -- layar utama & detail anak untuk
  orang tua.
- `src/lib/api/hooks/family.ts`, `src/lib/api/hooks/types.ts` -- hook API
  keluarga, memakai operasi/skema yang sama yang sudah dihapus.
- `src/lib/auth/roles.ts`, `src/components/screens/ProfileScreen.tsx` --
  `ProfileKind`/label peran masih menyertakan `"parent"`.
- `__tests__/roles.test.ts` -- test yang membuat user dengan
  `profile_kind: "parent"`.

Catatan: menjalankan `pnpm --filter @newsekolah/web typecheck` (atau
`@newsekolah/mobile`) secara terisolasi, tanpa `@newsekolah/i18n`
ter-build lebih dulu, memunculkan puluhan error tambahan
`Cannot find module '@newsekolah/i18n'` yang **tidak terkait** sesi ini
(masalah urutan build workspace) -- jalankan lewat `pnpm typecheck` di
root (pakai turbo, yang membangun dependency dulu) untuk sinyal yang
bersih.
