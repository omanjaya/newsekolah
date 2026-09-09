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
	catalog["JOURNAL_CONFLICT"] = map[string]string{
		Indonesian: "Jurnal untuk guru, kelas, mata pelajaran, dan tanggal ini sudah ada.",
		English:    "A journal already exists for this teacher, class, subject, and date.",
	}
}
