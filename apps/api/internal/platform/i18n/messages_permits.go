package i18n

// init-merge: permits module error codes.
func init() {
	for code, msg := range map[string][2]string{
		"SCAN_TOKEN_GONE":                {"Kode QR tidak valid, sudah dipakai, atau kedaluwarsa. Minta kode baru.", "The QR code is invalid, already used, or expired. Ask for a new one."},
		"WORKFLOW_APPROVER_NOT_ELIGIBLE": {"Orang yang memindai tidak berwenang menyetujui tahap ini.", "The scanned approver is not eligible for this stage."},
		"WORKFLOW_ALREADY_IN_PROGRESS":   {"Masih ada pengajuan yang sedang berjalan.", "A request of this kind is already in progress."},
		"WORKFLOW_NOT_IN_PROGRESS":       {"Pengajuan ini sudah selesai atau dibatalkan.", "This request is no longer in progress."},
		"WORKFLOW_NOT_SUBJECT":           {"Hanya pemilik pengajuan yang dapat melakukan aksi ini.", "Only the request owner may perform this action."},
		"WORKFLOW_DEFINITION_INVALID":    {"Definisi alur tidak valid.", "The workflow definition is invalid."},
		"ACADEMIC_YEAR_REQUIRED":         {"Tahun ajaran aktif belum diatur. Hubungi admin sekolah.", "No active academic year is set. Contact the school admin."},
		"ENROLLMENT_NOT_FOUND":           {"Siswa belum terdaftar di kelas pada tahun ajaran aktif.", "The student is not enrolled in a class this academic year."},
		"PERIOD_RANGE_INVALID":           {"Jam pelajaran akhir harus setelah jam pelajaran awal.", "The end period must come after the start period."},
		"EXIT_PERMIT_NOT_ISSUED":         {"Izin keluar belum disetujui sepenuhnya.", "The exit permit has not been fully approved yet."},
		"LEAVE_DATE_RANGE_INVALID":       {"Tanggal selesai tidak boleh sebelum tanggal mulai.", "The end date must not be before the start date."},
		"LEAVE_REQUEST_NOT_REVIEWABLE":   {"Pengajuan izin tidak sedang menunggu review wali kelas.", "The leave request is not awaiting homeroom review."},
		"LEAVE_REQUEST_NOT_ISSUABLE":     {"Pengajuan izin belum siap diterbitkan.", "The leave request is not ready for issuance."},
		"EVIDENCE_TOO_LARGE":             {"Ukuran berkas bukti melebihi batas 6 MB.", "The evidence file exceeds the 6 MB limit."},
		"EVIDENCE_INVALID_TYPE":          {"Berkas bukti harus berupa gambar JPEG atau PNG.", "The evidence file must be a JPEG or PNG image."},
	} {
		catalog[code] = map[string]string{Indonesian: msg[0], English: msg[1]}
	}
}
