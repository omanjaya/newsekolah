package i18n

// init-merge: supervision module error codes (errors_supervision.go).
func init() {
	catalog["SUPERVISION_CYCLE_NOT_FOUND"] = map[string]string{Indonesian: "Siklus supervisi tidak ditemukan.", English: "Supervision cycle not found."}
	catalog["SUPERVISION_INSTRUMENT_INVALID"] = map[string]string{Indonesian: "Instrumen supervisi tidak valid.", English: "The supervision instrument is invalid."}
	catalog["SUPERVISION_SCHEDULED_NOT_FOUND"] = map[string]string{Indonesian: "Jadwal supervisi tidak ditemukan.", English: "Scheduled supervision not found."}
	catalog["SUPERVISION_SCHEDULED_ALREADY_DONE"] = map[string]string{Indonesian: "Supervisi ini sudah dilaksanakan.", English: "This supervision has already been carried out."}
	catalog["SUPERVISION_OBSERVATION_NOT_FOUND"] = map[string]string{Indonesian: "Hasil observasi supervisi tidak ditemukan.", English: "Supervision observation not found."}
	catalog["SUPERVISION_OBSERVATION_FORBIDDEN"] = map[string]string{Indonesian: "Anda tidak berwenang mengakses observasi ini.", English: "You are not permitted to access this observation."}
	catalog["SUPERVISION_SCORE_COUNT_MISMATCH"] = map[string]string{Indonesian: "Jumlah skor tidak sesuai dengan jumlah butir instrumen.", English: "The number of scores does not match the number of instrument items."}
	catalog["SUPERVISION_SCORE_OUT_OF_RANGE"] = map[string]string{Indonesian: "Skor berada di luar rentang yang diizinkan.", English: "The score is outside the allowed range."}
	catalog["SUPERVISION_LESSON_NOT_RESOLVED"] = map[string]string{Indonesian: "Jam pelajaran yang diobservasi belum dapat ditentukan.", English: "The observed lesson could not be resolved."}
	catalog["SUPERVISION_MODULE_DISABLED"] = map[string]string{Indonesian: "Modul supervisi belum diaktifkan untuk sekolah Anda.", English: "The supervision module is not enabled for your school."}
}
