package i18n

// init-merge: the scheduling module's own transport-local error codes,
// added to the shared catalog without editing internal/platform/i18n/i18n.go
// (which every module touches), mirroring
// internal/platform/authz/permissions_scheduling.go's additive pattern.
// The three codes below are constructed directly in
// internal/modules/scheduling/transport/http/handler.go rather than in
// internal/platform/httpx/errors.go, since they are specific to this
// module's 409 responses; domain/errors.go's doc comment on
// ErrConflictClass / ErrConflictTeacher requires the first two exact
// codes.
func init() {
	catalog["SCHEDULE_CONFLICT_CLASS"] = map[string]string{
		Indonesian: "Kelas sudah memiliki jadwal yang tumpang tindih pada hari dan jam ini.",
		English:    "The class already has a schedule overlapping this day and period range.",
	}
	catalog["SCHEDULE_CONFLICT_TEACHER"] = map[string]string{
		Indonesian: "Guru sudah memiliki jadwal yang tumpang tindih pada hari dan jam ini.",
		English:    "The teacher already has a schedule overlapping this day and period range.",
	}
	catalog["SUBSTITUTION_CONFLICT"] = map[string]string{
		Indonesian: "Permintaan ini bertentangan dengan status pergantian guru yang ada.",
		English:    "This request conflicts with the substitution's existing state.",
	}
	catalog["SCHEDULE_HAS_HISTORY"] = map[string]string{
		Indonesian: "Jadwal ini sudah punya riwayat presensi, guru pengganti, atau kunjungan supervisi, jadi perubahannya harus berlaku mulai suatu tanggal. Pertemuan sebelum tanggal itu tetap tercatat dengan jadwal lama.",
		English:    "This schedule has attendance, substitution or supervision history, so a change must take effect from a date. Lessons before that date keep the old schedule.",
	}
	catalog["SCHEDULE_CHANGE_BEFORE_HISTORY"] = map[string]string{
		Indonesian: "Tanggal berlaku terlalu awal: jadwal ini sudah punya riwayat sampai tanggal tersebut, pelajarannya hari ini sudah dimulai, atau tanggalnya sudah lewat. Pilih tanggal yang lebih akhir.",
		English:    "The effective date is too early: this schedule has history up to that date, its lesson today has already begun, or the date has passed. Pick a later date.",
	}
	catalog["SCHEDULE_EFFECTIVE_FROM_INVALID"] = map[string]string{
		Indonesian: "Tanggal berlaku harus berada di dalam tahun ajaran jadwal ini.",
		English:    "The effective date must fall within this schedule's academic year.",
	}
	catalog["SCHEDULE_ENDED"] = map[string]string{
		Indonesian: "Jadwal ini sudah tidak berlaku, jadi tidak bisa diubah atau dihapus lagi.",
		English:    "This schedule is no longer in effect, so it can no longer be changed or removed.",
	}
	catalog["SUBSTITUTION_LESSON_NOT_ON_DATE"] = map[string]string{
		Indonesian: "Pelajaran ini tidak ada di jadwal pada tanggal yang dipilih.",
		English:    "This lesson is not on the timetable on the selected date.",
	}
	catalog["SCHEDULE_YEAR_ARCHIVED"] = map[string]string{
		Indonesian: "Tahun ajaran jadwal ini sudah diarsipkan, jadi jadwalnya tidak bisa diubah.",
		English:    "This schedule's academic year is archived, so it cannot be changed.",
	}
	catalog["SCHEDULE_DAY_NOT_SCHOOL_DAY"] = map[string]string{
		Indonesian: "Hari yang dipilih bukan hari sekolah aktif. Pilih hari lain atau aktifkan harinya di pengaturan hari sekolah.",
		English:    "The selected day is not an active school day. Pick another day or enable it in the school-day settings.",
	}
	catalog["SCHEDULE_PERIOD_INVALID"] = map[string]string{
		Indonesian: "Jam pelajaran yang dipilih tidak berlaku untuk hari tersebut atau merupakan jam istirahat. Pilih jam lain.",
		English:    "The selected period does not apply to that day or is a break. Pick another period.",
	}
	catalog["SUBSTITUTION_WEEKDAY_MISMATCH"] = map[string]string{
		Indonesian: "Tanggal yang dipilih tidak jatuh pada hari jadwal pelajaran ini.",
		English:    "The selected date does not fall on this lesson's weekday.",
	}
	catalog["SUBSTITUTION_DATE_IN_PAST"] = map[string]string{
		Indonesian: "Tanggal yang dipilih sudah lewat. Pilih tanggal hari ini atau yang akan datang.",
		English:    "The selected date has passed. Pick today or a later date.",
	}
	catalog["SUBSTITUTION_CANCEL_PAST"] = map[string]string{
		Indonesian: "Permintaan guru pengganti yang tanggalnya sudah lewat tidak bisa dibatalkan oleh pengelola jadwal, karena pelajarannya sudah berlangsung.",
		English:    "A schedule manager cannot cancel a substitute request whose date has passed: the lesson has already taken place.",
	}
	catalog["SUBSTITUTION_NOT_SCHOOL_DAY"] = map[string]string{
		Indonesian: "Tanggal yang dipilih adalah hari libur atau tidak ada KBM.",
		English:    "The selected date is a holiday or has no lessons.",
	}
	catalog["SUBSTITUTE_IS_REQUESTER"] = map[string]string{
		Indonesian: "Guru pengganti tidak boleh Anda sendiri.",
		English:    "The substitute cannot be yourself.",
	}
	catalog["SUBSTITUTE_NOT_TEACHER"] = map[string]string{
		Indonesian: "Guru pengganti harus guru aktif pada tahun ajaran ini.",
		English:    "The substitute must be an active teacher this academic year.",
	}
	catalog["JOURNAL_CONFLICT"] = map[string]string{
		Indonesian: "Jurnal untuk guru, kelas, mata pelajaran, dan tanggal ini sudah ada.",
		English:    "A journal already exists for this teacher, class, subject, and date.",
	}
	catalog["JOURNAL_REPORT_UNKNOWN_COLUMN"] = map[string]string{
		Indonesian: "Ada kolom laporan yang tidak dikenali. Muat ulang halaman lalu pilih kolom lagi.",
		English:    "A report column is not recognized. Reload the page and pick the columns again.",
	}
}
