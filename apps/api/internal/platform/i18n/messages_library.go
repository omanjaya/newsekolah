package i18n

func init() {
	catalog["LIBRARY_TITLE_NOT_FOUND"] = map[string]string{Indonesian: "Judul buku tidak ditemukan.", English: "Title not found."}
	catalog["LIBRARY_COPY_NOT_FOUND"] = map[string]string{Indonesian: "Eksemplar tidak ditemukan.", English: "Copy not found."}
	catalog["LIBRARY_COPY_BARCODE_EXISTS"] = map[string]string{Indonesian: "Barcode eksemplar sudah dipakai.", English: "Copy barcode already in use."}
	catalog["LIBRARY_COPY_NOT_AVAILABLE"] = map[string]string{Indonesian: "Eksemplar ini tidak tersedia untuk dipinjam.", English: "This copy is not available to borrow."}
	catalog["LIBRARY_COPY_ON_LOAN"] = map[string]string{Indonesian: "Eksemplar ini sedang dipinjam.", English: "This copy is already on loan."}
	catalog["LIBRARY_LOAN_NOT_FOUND"] = map[string]string{Indonesian: "Peminjaman tidak ditemukan.", English: "Loan not found."}
	catalog["LIBRARY_LOAN_ALREADY_RETURNED"] = map[string]string{Indonesian: "Peminjaman ini sudah dikembalikan.", English: "This loan is already returned."}
	catalog["LIBRARY_LOAN_LIMIT_REACHED"] = map[string]string{Indonesian: "Anggota sudah mencapai batas jumlah pinjaman aktif.", English: "The member has reached the active loan limit."}
	catalog["LIBRARY_RENEWAL_LIMIT_REACHED"] = map[string]string{Indonesian: "Peminjaman ini sudah mencapai batas perpanjangan.", English: "This loan has reached the renewal limit."}
	catalog["LIBRARY_RENEWAL_BLOCKED_OVERDUE"] = map[string]string{Indonesian: "Peminjaman yang terlambat tidak dapat diperpanjang.", English: "An overdue loan cannot be renewed."}
	catalog["LIBRARY_RENEWAL_BLOCKED_RESERVED"] = map[string]string{Indonesian: "Judul ini sedang ditunggu oleh anggota lain, tidak dapat diperpanjang.", English: "This title has a waiting reservation and cannot be renewed."}
	catalog["LIBRARY_RESERVATION_NOT_FOUND"] = map[string]string{Indonesian: "Reservasi tidak ditemukan.", English: "Reservation not found."}
	catalog["LIBRARY_RESERVATION_NOT_WAITING"] = map[string]string{Indonesian: "Reservasi ini tidak lagi menunggu.", English: "This reservation is no longer waiting."}
	catalog["LIBRARY_COPY_AVAILABLE_FOR_LOAN"] = map[string]string{Indonesian: "Eksemplar sudah tersedia, tidak perlu memesan.", English: "A copy is already available, no need to reserve."}
	catalog["LIBRARY_STOCKTAKE_NOT_FOUND"] = map[string]string{Indonesian: "Sesi opname tidak ditemukan.", English: "Stocktake session not found."}
	catalog["LIBRARY_STOCKTAKE_CLOSED"] = map[string]string{Indonesian: "Sesi opname ini sudah ditutup.", English: "This stocktake session is already closed."}
	catalog["LIBRARY_TITLE_HAS_COPIES"] = map[string]string{Indonesian: "Judul ini masih memiliki eksemplar, hapus atau pindahkan dulu eksemplarnya.", English: "This title still has copies; remove or move them first."}
	catalog["LIBRARY_CONTROL_NUMBER_EXISTS"] = map[string]string{Indonesian: "Nomor kontrol sudah dipakai.", English: "Control number already in use."}
	catalog["LIBRARY_COPY_ACCESSION_EXISTS"] = map[string]string{Indonesian: "Nomor induk eksemplar sudah dipakai.", English: "Copy accession number already in use."}
	catalog["LIBRARY_COPY_HAS_LOAN_HISTORY"] = map[string]string{Indonesian: "Eksemplar ini punya riwayat pinjam, ubah statusnya (mis. hilang/dihibahkan) alih-alih menghapus.", English: "This copy has loan history; change its status (e.g. lost/donated) instead of deleting it."}
	catalog["LIBRARY_COPY_STATUS_NOT_MANUAL"] = map[string]string{Indonesian: "Status ini hanya bisa diubah lewat sirkulasi (dipinjam/dipesan), bukan secara manual.", English: "This status can only be set through circulation (on loan/reserved), not manually."}
	catalog["LIBRARY_MASTER_DATA_NOT_FOUND"] = map[string]string{Indonesian: "Data induk tidak ditemukan.", English: "Master data entry not found."}
	catalog["LIBRARY_MASTER_DATA_CODE_EXISTS"] = map[string]string{Indonesian: "Kode ini sudah dipakai.", English: "This code is already in use."}
	catalog["LIBRARY_MASTER_DATA_IN_USE"] = map[string]string{Indonesian: "Data induk ini masih dipakai, tidak dapat dihapus.", English: "This master data entry is still in use and cannot be deleted."}

	catalog["LIBRARY_MODULE_DISABLED"] = map[string]string{Indonesian: "Modul perpustakaan belum diaktifkan untuk sekolah ini.", English: "The library module is not enabled for this school."}
	catalog["LIBRARY_LOANS_CLOSED"] = map[string]string{Indonesian: "Peminjaman sedang ditutup untuk tanggal ini.", English: "Lending is closed for this date."}
	catalog["LIBRARY_UNPAID_FINE"] = map[string]string{Indonesian: "Anggota memiliki denda yang belum dibayar.", English: "The member has an unpaid fine."}
	catalog["LIBRARY_FORBIDDEN"] = map[string]string{Indonesian: "Anda tidak berhak melihat data anggota ini.", English: "You are not permitted to view this member's records."}

	catalog["LIBRARY_MEMBER_NOT_FOUND"] = map[string]string{Indonesian: "Anggota perpustakaan tidak ditemukan.", English: "Library member not found."}
	catalog["LIBRARY_MEMBER_ALREADY_EXISTS"] = map[string]string{Indonesian: "Pengguna ini sudah menjadi anggota perpustakaan.", English: "This user is already a library member."}
	catalog["LIBRARY_MEMBER_NOT_ACTIVE"] = map[string]string{Indonesian: "Anggota perpustakaan tidak aktif.", English: "The library member is not active."}
	catalog["LIBRARY_MEMBER_SUSPENDED"] = map[string]string{Indonesian: "Anggota perpustakaan sedang diskors.", English: "The library member is suspended."}
	catalog["LIBRARY_MEMBER_EXPIRED"] = map[string]string{Indonesian: "Keanggotaan perpustakaan sudah kedaluwarsa.", English: "The library membership has expired."}
	catalog["LIBRARY_MEMBER_NOT_CLEARABLE"] = map[string]string{Indonesian: "Anggota masih memiliki pinjaman aktif atau denda yang belum lunas.", English: "The member still has an active loan or an unpaid fine."}
	catalog["LIBRARY_MEMBER_TYPE_NOT_FOUND"] = map[string]string{Indonesian: "Jenis anggota perpustakaan tidak ditemukan.", English: "Library member type not found."}
	catalog["LIBRARY_MEMBER_TYPE_IN_USE"] = map[string]string{Indonesian: "Jenis anggota ini masih dipakai oleh anggota lain.", English: "This member type is still in use."}
	catalog["LIBRARY_MEMBER_NO_EXHAUSTED"] = map[string]string{Indonesian: "Gagal membuat nomor anggota unik, coba lagi.", English: "Could not generate a unique member number, try again."}
	catalog["LIBRARY_MEMBER_NO_COLLISION"] = map[string]string{Indonesian: "Nomor anggota sudah dipakai.", English: "This member number is already in use."}

	catalog["LIBRARY_VIOLATION_NOT_FOUND"] = map[string]string{Indonesian: "Pelanggaran tidak ditemukan.", English: "Violation not found."}
	catalog["LIBRARY_VIOLATION_ALREADY_SETTLED"] = map[string]string{Indonesian: "Pelanggaran ini sudah diselesaikan.", English: "This violation is already settled."}

	catalog["LIBRARY_VISIT_NOT_FOUND"] = map[string]string{Indonesian: "Kunjungan tidak ditemukan.", English: "Visit not found."}

	catalog["LIBRARY_COVER_TOO_LARGE"] = map[string]string{Indonesian: "Ukuran sampul melebihi 3 MB.", English: "Cover image exceeds 3 MB."}
	catalog["LIBRARY_COVER_INVALID_TYPE"] = map[string]string{Indonesian: "Tipe berkas sampul tidak didukung. Gunakan JPEG, PNG, atau WebP.", English: "Unsupported cover file type. Use JPEG, PNG, or WebP."}
	catalog["LIBRARY_STORAGE_UNAVAILABLE"] = map[string]string{Indonesian: "Penyimpanan berkas belum dikonfigurasi.", English: "File storage is not configured."}
}
