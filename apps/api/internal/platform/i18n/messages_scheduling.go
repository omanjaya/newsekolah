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
		Indonesian: "Jadwal ini sudah memiliki riwayat presensi atau guru pengganti. Ubah jadwal mulai tanggal tertentu agar riwayatnya tetap tersimpan.",
		English:    "This schedule already has attendance or substitution history. Change it from a given date so the history is kept.",
	}
	catalog["SCHEDULE_YEAR_ARCHIVED"] = map[string]string{
		Indonesian: "Tahun ajaran jadwal ini sudah diarsipkan, jadi jadwalnya tidak bisa diubah.",
		English:    "This schedule's academic year is archived, so it cannot be changed.",
	}
	catalog["SCHEDULE_DAY_NOT_SCHOOL_DAY"] = map[string]string{
		Indonesian: "Hari ini bukan hari sekolah aktif. Pilih hari lain atau aktifkan harinya di pengaturan hari sekolah.",
		English:    "This day is not an active school day. Pick another day or enable it in the school-day settings.",
	}
	catalog["SCHEDULE_PERIOD_INVALID"] = map[string]string{
		Indonesian: "Jam pelajaran yang dipilih tidak berlaku untuk hari ini atau merupakan jam istirahat.",
		English:    "The selected period does not apply to this day or is a break.",
	}
	catalog["SUBSTITUTION_WEEKDAY_MISMATCH"] = map[string]string{
		Indonesian: "Tanggal yang dipilih tidak jatuh pada hari jadwal pelajaran ini.",
		English:    "The selected date does not fall on this lesson's weekday.",
	}
	catalog["SUBSTITUTION_DATE_IN_PAST"] = map[string]string{
		Indonesian: "Tanggal yang dipilih sudah lewat. Pilih tanggal hari ini atau yang akan datang.",
		English:    "The selected date has passed. Pick today or a later date.",
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
}
