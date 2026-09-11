package i18n

// init-merge: staff attendance module error codes.
func init() {
	catalog["MODULE_DISABLED"] = map[string]string{Indonesian: "Modul ini belum diaktifkan untuk sekolah Anda.", English: "This module is not enabled for your school."}
	catalog["STAFF_ATTENDANCE_SCHEDULE_DAY_INVALID"] = map[string]string{Indonesian: "Jadwal kerja tidak berlaku untuk hari ini.", English: "The work schedule does not apply to this day."}
	catalog["STAFF_ATTENDANCE_ALREADY_SCANNED"] = map[string]string{Indonesian: "Presensi masuk dan pulang untuk hari ini sudah tercatat.", English: "Both clock-in and clock-out for today have already been recorded."}
	catalog["STAFF_ATTENDANCE_CORRECTION_REASON_REQUIRED"] = map[string]string{Indonesian: "Alasan wajib diisi saat mengoreksi presensi staf.", English: "A reason is required when correcting staff attendance."}
	catalog["STAFF_ATTENDANCE_INVALID_MONTH"] = map[string]string{Indonesian: "Format bulan harus YYYY-MM.", English: "Month must be formatted as YYYY-MM."}
}
