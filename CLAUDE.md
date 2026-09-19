# newsekolah

Rebuild platform sistem informasi sekolah (asal: SION, Go + Next.js) menjadi platform multi-sekolah dengan web, iOS, dan Android.

- Rencana lengkap: `docs/README.md` (mulai dari sana).
- Arah desain: `DESIGN.md`.
- Kode lama sebagai referensi logika (jangan diedit): `reference/sion` (snapshot GitHub arimartana/sion) dan `reference/sion-rebuild-go` (versi lokal lebih baru, menambah modul perpustakaan).

## Aturan kerja

- Bahasa kode dan commit: English. Teks pengguna lewat i18n, default Bahasa Indonesia.
- Tidak ada emoji di UI, kode, komentar, commit, dokumen. Ikon memakai Lucide.
- Ikuti `docs/03-layered-architecture.md` dan `docs/04-clean-code.md`; komponen bersama di `packages/ui` sebelum membuat yang baru.
- Validasi: `go test ./...` untuk Go, `pnpm typecheck && pnpm lint && pnpm test` untuk TypeScript.
- Lingkungan lokal: `pnpm dev:docker` (hot reload API dan web); detail di `infra/docker/README.dev.md`.
