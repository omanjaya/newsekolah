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
}
