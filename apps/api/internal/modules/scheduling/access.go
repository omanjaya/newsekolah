// Package scheduling wires the module's repository, service, and HTTP
// transport together, and exports the interfaces other modules consume:
// AccessChecker lets the attendance module (and, once merged, the permits
// module) ask "may this user act on this schedule occurrence" without
// importing scheduling's repository, per docs/03-layered-architecture.md
// section 1 ("Interface yang diekspor modul, disuntik saat wiring").
package scheduling

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
)

// AccessChecker reports whether userID may record attendance or a journal
// entry for scheduleID on date: true for the schedule's own teacher, and
// true for a teacher holding an accepted substitution covering that exact
// schedule and date.
type AccessChecker interface {
	HasAccess(ctx context.Context, tenantID, scheduleID, userID uuid.UUID, date time.Time) (bool, error)
}

// ScheduleRef is the minimal shape of a schedule the attendance module
// needs: enough to open a session and compute expected-session counts,
// without attendance importing scheduling/domain's fuller Schedule type.
// It is a type alias to service.ScheduleRef (defined there, not here)
// because service.ScheduleReaderAdapter needs package-private access to
// Service's repo and withTx to build one; this package importing service,
// instead of the reverse, is what keeps this package free of an import
// cycle back through module.go, which must import service to wire it.
type ScheduleRef = service.ScheduleRef

// ScheduleReader lets the attendance module read schedule data it needs
// (today's schedules for a teacher, a schedule by ID) without importing
// scheduling's repository directly, per the same "interface yang diekspor
// modul" pattern as AccessChecker.
type ScheduleReader interface {
	GetSchedule(ctx context.Context, tenantID, scheduleID uuid.UUID) (ScheduleRef, error)
	ListSchedulesForTeacherDay(ctx context.Context, tenantID, academicYearID, teacherUserID uuid.UUID, dayOfWeek int16) ([]ScheduleRef, error)
	// ListAcceptedSubstitutionsForSubstituteDate returns the schedule each
	// accepted substitution for substituteUserID on date covers, so
	// attendance's "today's sessions" list can merge in a teacher's
	// accepted substitutions alongside their own schedules.
	ListAcceptedSubstitutionsForSubstituteDate(ctx context.Context, tenantID, substituteUserID uuid.UUID, date time.Time) ([]ScheduleRef, error)
	CountSchedulesForClassDay(ctx context.Context, tenantID, academicYearID, classID uuid.UUID, dayOfWeek int16) (int64, error)
}

// JournalInput and JournalRef are type aliases to their service package
// counterparts, for the same import-cycle reason ScheduleRef is (see its
// doc comment above).
type JournalInput = service.JournalInput
type JournalRef = service.JournalRef

// JournalService lets the attendance module read and write class journals
// through scheduling's own validation and teacher/substitute authorship
// rules (domain/journal.go's CanWrite), instead of duplicating them --
// attendance's SaveAttendanceEntries upserts the lesson journal alongside
// attendance entries when the caller supplies one.
type JournalService interface {
	UpsertJournal(ctx context.Context, tenantID, teacherUserID, writerUserID uuid.UUID, in JournalInput) (JournalRef, error)
	GetJournalForLesson(ctx context.Context, tenantID, academicYearID, teacherUserID, classID, subjectID uuid.UUID, lessonDate time.Time) (JournalRef, bool, error)
}
