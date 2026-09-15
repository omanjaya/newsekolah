# Dokumentasi Rencana Rebuild

Platform sistem informasi sekolah multi-tenant, dibangun ulang dari SION (Go + Next.js) menjadi monorepo Go + Next.js + Expo dengan PostgreSQL. Dokumen dibaca berurutan; setiap dokumen berdiri sendiri.

| No  | Dokumen                                                | Isi                                                                                                  |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 01  | [Analisis aplikasi lama](01-analisis-aplikasi-lama.md) | Ringkasan fitur, kekuatan, masalah, keputusan rebuild                                                |
| 02  | [System design](02-system-design.md)                   | Konteks, multi-tenancy, komponen, workflow engine, policy, alur kunci, NFR, deployment, migrasi data |
| 03  | [Layered architecture](03-layered-architecture.md)     | Modular monolith Go, lapisan per modul, aturan dependensi, struktur web dan mobile                   |
| 04  | [Clean code](04-clean-code.md)                         | Aturan Go, TypeScript, SQL, API, checklist review                                                    |
| 05  | [Shared components](05-shared-components.md)           | Token, primitif, komponen data dan domain, shell, paket bersama, mobile                              |
| 06  | [Database schema](06-database-schema.md)               | Konvensi Postgres, RLS, semua domain, ERD, index, migrasi, pemetaan dari skema lama                  |
| 07  | [UI/UX](07-ui-ux.md)                                   | Persona, arsitektur informasi, pola layar, alur utama, standar interaksi, aksesibilitas, ikon        |
| 08  | [Security](08-security.md)                             | Model ancaman, autentikasi, otorisasi, isolasi tenant, UU PDP, file, HTTP, rahasia, audit            |
| 09  | [Tech stack](09-tech-stack.md)                         | Pilihan teknologi dengan alasan dan alternatif yang ditolak, struktur monorepo                       |
| 10  | [Mobile strategy](10-mobile-strategy.md)               | Expo untuk iOS dan Android, prasyarat backend, arsitektur, fitur v1, rilis                           |
| 11  | [Rekomendasi fitur](11-feature-recommendations.md)     | Fitur baru bertingkat dan fitur lama yang dirombak                                                   |
| 12  | [Roadmap](12-roadmap.md)                               | Fase kerja, definisi selesai, risiko, keputusan yang dibutuhkan                                      |
| 13  | [ETL dari SION](13-etl-sion.md)                        | Migrasi data dari MySQL SION, apa yang dimigrasikan dan yang sengaja tidak                           |
| 14  | [API publik](14-public-api.md)                         | Kunci API dan webhook untuk integrasi pihak ketiga                                                   |
| 14  | [Rilis store](14-store-release.md)                     | Persiapan rilis aplikasi mobile ke App Store dan Play Store                                          |
| 15  | [Paritas dengan SION](15-paritas-sion.md)              | Posisi pekerjaan menyamakan logika dengan SION: yang selesai, keputusan, dan sisa pekerjaan          |

Mulai dari dokumen 15 untuk tahu posisi pekerjaan terkini.

Lampiran (sumber kebenaran fitur lama, sangat rinci):

- [A. Inventaris frontend](analysis/frontend-inventory.md)
- [B. Inventaris database dan PRD](analysis/database-inventory.md)
- [C. Inventaris backend](analysis/backend-inventory.md)
- [D. Perbandingan logika SION dan newsekolah, sebelum perbaikan](analysis/parity-sion-before.md)

Arah desain visual: [DESIGN.md](../DESIGN.md). Aturan kerja agen: [CLAUDE.md](../CLAUDE.md). Kode lama: `reference/sion` dan `reference/sion-rebuild-go` (hanya dibaca).
