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
}
