package i18n

// init-merge: the attendance module's own transport-local error codes,
// added to the shared catalog without editing internal/platform/i18n/i18n.go
// (which every module touches), mirroring
// internal/platform/i18n/messages_scheduling.go's additive pattern. The
// codes below are constructed directly in
// internal/modules/attendance/transport/http/handler.go rather than in
// internal/platform/httpx/errors.go, since they are specific to this
// module's responses.
func init() {
	// WsMe and WsMonitor's strict-handler stub still returns this: a
	// strict handler cannot hijack the connection for a WebSocket upgrade,
	// so those two operations are an honest 501 here even though the rest
	// of the module is implemented -- see handler.go's doc comment.
	catalog["NOT_IMPLEMENTED"] = map[string]string{
		Indonesian: "Fitur ini belum tersedia.",
		English:    "This feature is not yet available.",
	}
	catalog["ATTENDANCE_WINDOW_CLOSED"] = map[string]string{
		Indonesian: "Waktu penyimpanan absensi untuk sesi ini sudah ditutup.",
		English:    "The same-day save window for this attendance session has closed.",
	}
	catalog["ATTENDANCE_CORRECTION_WINDOW_CLOSED"] = map[string]string{
		Indonesian: "Waktu koreksi absensi untuk sesi ini sudah ditutup.",
		English:    "The correction window for this attendance session has closed.",
	}
	catalog["ATTENDANCE_CORRECTION_NOT_ALLOWED"] = map[string]string{
		Indonesian: "Anda tidak berwenang mengoreksi absensi kelas ini.",
		English:    "You are not permitted to correct attendance for this class.",
	}
	catalog["ATTENDANCE_CORRECTION_REASON_REQUIRED"] = map[string]string{
		Indonesian: "Alasan wajib diisi saat menyimpan dalam mode koreksi.",
		English:    "A reason is required when saving in correction mode.",
	}
	catalog["ATTENDANCE_STATUS_INVALID"] = map[string]string{
		Indonesian: "Kode status kehadiran tidak dikenal oleh sekolah ini.",
		English:    "That attendance status code is not part of this school's configured policy.",
	}
	catalog["ATTENDANCE_FORBIDDEN_SCHEDULE"] = map[string]string{
		Indonesian: "Anda tidak memiliki akses ke jadwal ini.",
		English:    "You do not have access to this schedule occurrence.",
	}
	catalog["ATTENDANCE_STUDENT_NOT_IN_CLASS"] = map[string]string{
		Indonesian: "Siswa tersebut tidak terdaftar di kelas sesi ini.",
		English:    "That student does not belong to this session's class.",
	}
	catalog["ATTENDANCE_NOT_HOMEROOM"] = map[string]string{
		Indonesian: "Anda bukan wali kelas dan tidak dapat melihat data ini.",
		English:    "You do not hold the homeroom duty required to view this.",
	}
	catalog["ATTENDANCE_NO_ACTIVE_YEAR"] = map[string]string{
		Indonesian: "Sekolah belum memiliki tahun ajaran aktif.",
		English:    "This school has no active academic year.",
	}
	catalog["ATTENDANCE_INVALID_MONTH"] = map[string]string{
		Indonesian: "Format bulan harus YYYY-MM.",
		English:    "Month must be formatted as YYYY-MM.",
	}
	catalog["ATTENDANCE_MONITOR_TOKEN_INVALID"] = map[string]string{
		Indonesian: "Token layar monitor tidak valid atau belum dikonfigurasi.",
		English:    "The monitor display token is invalid or not configured.",
	}
}
