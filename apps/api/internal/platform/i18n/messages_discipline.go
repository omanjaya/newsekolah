package i18n

func init() {
	catalog["VIOLATION_TYPE_NOT_FOUND"] = map[string]string{Indonesian: "Jenis pelanggaran tidak ditemukan.", English: "Violation type not found."}
	catalog["VIOLATION_TYPE_CODE_EXISTS"] = map[string]string{Indonesian: "Kode pelanggaran sudah dipakai.", English: "Violation code already in use."}
	catalog["VIOLATION_TYPE_INACTIVE"] = map[string]string{Indonesian: "Jenis pelanggaran ini sudah tidak aktif.", English: "This violation type is inactive."}
	catalog["VIOLATION_RECORD_NOT_FOUND"] = map[string]string{Indonesian: "Catatan pelanggaran tidak ditemukan.", English: "Violation record not found."}
	catalog["VIOLATION_RECORD_VOIDED"] = map[string]string{Indonesian: "Catatan pelanggaran sudah dibatalkan.", English: "Violation record already voided."}
	catalog["WARNING_LETTER_NOT_FOUND"] = map[string]string{Indonesian: "Surat peringatan tidak ditemukan.", English: "Warning letter not found."}
	catalog["WARNING_LETTER_NOT_DUE"] = map[string]string{Indonesian: "Poin siswa belum mencapai ambang level ini, atau level sebelumnya belum diterbitkan.", English: "The student's points have not reached this level, or an earlier level is still unissued."}
	catalog["WARNING_LETTER_ALREADY_ISSUED"] = map[string]string{Indonesian: "Surat peringatan level ini sudah diterbitkan.", English: "This warning letter level was already issued."}
	catalog["COUNSELING_NOT_FOUND"] = map[string]string{Indonesian: "Catatan konseling tidak ditemukan.", English: "Counseling note not found."}
	catalog["COUNSELING_FORBIDDEN"] = map[string]string{Indonesian: "Catatan konseling ini tidak dibagikan kepada Anda.", English: "This counseling note is not shared with you."}
	catalog["STUDENT_NOT_ENROLLED"] = map[string]string{Indonesian: "Siswa tidak memiliki penugasan kelas aktif di tahun ajaran aktif.", English: "The student has no active class enrollment in the active academic year."}
	catalog["STUDENT_INACTIVE"] = map[string]string{Indonesian: "Akun siswa ini tidak aktif.", English: "This student's account is not active."}
	catalog["ATTACHMENT_NOT_FOUND"] = map[string]string{Indonesian: "Lampiran tidak ditemukan.", English: "Attachment not found."}
	catalog["ATTACHMENT_TOO_LARGE"] = map[string]string{Indonesian: "Ukuran berkas lampiran melebihi batas.", English: "The attachment file exceeds the size limit."}
	catalog["ATTACHMENT_INVALID_TYPE"] = map[string]string{Indonesian: "Berkas lampiran harus berupa gambar JPEG atau PNG.", English: "The attachment file must be a JPEG or PNG image."}
	catalog["ATTACHMENT_LIMIT_REACHED"] = map[string]string{Indonesian: "Catatan pelanggaran ini sudah punya maksimal 3 foto bukti.", English: "This violation record already has the maximum of 3 photos."}
	catalog["REPORT_UNAVAILABLE"] = map[string]string{Indonesian: "Pembuatan laporan PDF belum diaktifkan di server ini.", English: "PDF report generation is not enabled on this server."}
}
