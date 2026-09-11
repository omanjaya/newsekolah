// Package attendance wires the module's repository, service, and HTTP
// transport together, and declares the two extension points the
// not-yet-merged permits module will implement: Blocker (an unfinished
// late-arrival workflow should stop a student from being marked present)
// and Overrider (an issued leave letter or exit permit forces a student's
// status for a date). Both default to a no-op so attendance is fully
// functional before permits exists, per docs/03-layered-architecture.md
// section 1's "Interface yang diekspor modul" pattern.
package attendance

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
)

// Blocker reports whether studentUserID has an unresolved workflow (e.g. a
// late-arrival still pending duty-teacher review) that should prevent
// recording a normal attendance status for date, mirroring the old
// system's "siswa dengan terlambat belum selesai dilewati" rule
// (docs/analysis/backend-inventory.md section 1.9).
type Blocker interface {
	IsBlocked(ctx context.Context, tenantID, studentUserID uuid.UUID, date time.Time) (blocked bool, reason string, err error)
}

// NoOpBlocker never blocks anyone; it is the default until permits is
// merged and wired in.
type NoOpBlocker struct{}

func (NoOpBlocker) IsBlocked(context.Context, uuid.UUID, uuid.UUID, time.Time) (bool, string, error) {
	return false, "", nil
}

// Overrider reports a status that must take precedence over whatever a
// teacher records, because a higher-priority workflow already decided the
// student's status for that date (an issued leave letter, an exited exit
// permit), mirroring docs/analysis/backend-inventory.md section 1.9's "surat
// izin issued menimpa status menjadi S/D/I".
type Overrider interface {
	Override(ctx context.Context, tenantID, studentUserID uuid.UUID, date time.Time) (statusCode string, source domain.EntrySource, ok bool, err error)
}

// NoOpOverrider never overrides anything; it is the default until permits
// is merged and wired in.
type NoOpOverrider struct{}

func (NoOpOverrider) Override(context.Context, uuid.UUID, uuid.UUID, time.Time) (string, domain.EntrySource, bool, error) {
	return "", "", false, nil
}

// ViolationRecorder lets SaveEntries record a session's per-student
// discipline violations (the "violation_ids" field of a save-entries
// payload) through the not-yet-merged discipline module, mirroring
// Blocker/Overrider's rationale.
type ViolationRecorder interface {
	ReplaceSessionViolations(ctx context.Context, tenantID, sessionID, studentUserID uuid.UUID, violationTypeIDs []uuid.UUID, occurredOn time.Time, reporterUserID uuid.UUID) error
}

// NoOpViolationRecorder records nothing; it is the default until discipline
// is wired in.
type NoOpViolationRecorder struct{}

func (NoOpViolationRecorder) ReplaceSessionViolations(context.Context, uuid.UUID, uuid.UUID, uuid.UUID, []uuid.UUID, time.Time, uuid.UUID) error {
	return nil
}

// DisciplineReader lets the homeroom roster show each student's violation
// count and total points, mirroring Blocker/Overrider/ViolationRecorder's
// rationale. Kept identical to service.DisciplineReader (down to
// service.ViolationSummary) so a value of this type is also accepted where
// service.New expects the latter.
type DisciplineReader interface {
	ViolationSummary(ctx context.Context, tenantID, academicYearID, studentUserID uuid.UUID) (count, points int, err error)
	ViolationSummaryForClass(ctx context.Context, tenantID, classID uuid.UUID) (map[uuid.UUID]ViolationSummary, error)
}

// ViolationSummary aliases service.ViolationSummary so a Dependencies.
// Discipline implementation built outside this module (cmd/api's
// late-bound adapter) does not need its own import of attendance/service
// just to name the result type.
type ViolationSummary = service.ViolationSummary

// NoOpDisciplineReader always reports zero; it is the default until
// discipline is wired in.
type NoOpDisciplineReader struct{}

func (NoOpDisciplineReader) ViolationSummary(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) (int, int, error) {
	return 0, 0, nil
}

func (NoOpDisciplineReader) ViolationSummaryForClass(context.Context, uuid.UUID, uuid.UUID) (map[uuid.UUID]service.ViolationSummary, error) {
	return nil, nil
}
