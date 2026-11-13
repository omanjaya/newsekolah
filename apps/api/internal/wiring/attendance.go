package wiring

import (
	"context"
	"time"

	"github.com/google/uuid"

	attendancedomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	attendanceservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
)

// PermitsBlocker exposes permits' in-progress late-arrival flows to
// attendance as its Blocker: a student with one open for a date is left
// out of that date's attendance saves until the flow finishes. While the
// tenant has permits turned off nobody can finish such a flow, so the
// student is not blocked; the flow itself is kept and blocks again once
// permits is back on.
//
// Approved leave is deliberately not gated here: PermitsOverrider keeps
// reading already-issued leave letters with permits off, so an approved
// absence never flips to alfa.
type PermitsBlocker struct {
	Svc *permitsservice.Service
	// Flags reads the permits feature flag; nil leaves permits on.
	Flags ModuleFlagReader
}

func (b PermitsBlocker) IsBlocked(ctx context.Context, tenantID, studentUserID uuid.UUID, date time.Time) (bool, string, error) {
	if on, err := moduleEnabled(ctx, b.Flags, tenantID, platformdomain.ModulePermits); err != nil || !on {
		return false, "", err
	}
	blocked, err := b.Svc.HasBlockingLateArrival(ctx, tenantID, studentUserID, date)
	if err != nil || !blocked {
		return false, "", err
	}
	return true, "late_arrival_in_progress", nil
}

// homeroomClassPointTotalsLimit is passed to PointTotals in place of a
// per-student ID list: it must cover every student a homeroom class can
// hold, which is always far below PointTotals' own cap of 500.
const homeroomClassPointTotalsLimit = 500

// AttendanceDiscipline is attendance's DisciplineReader (the homeroom
// roster's violation count and points per student). Attendance is always
// on; while the tenant has discipline turned off every student reads as
// having no violations, and the roster leaves the discipline columns out
// rather than showing zeros.
//
// ViolationSummaryForClass is built over discipline's existing per-class
// PointTotals: a homeroom roster is always exactly one class, so scoping by
// classID gets the same one-query result a per-student batch query would.
type AttendanceDiscipline struct {
	Svc *disciplineservice.Service
	// Flags reads the discipline feature flag; nil leaves discipline on.
	Flags ModuleFlagReader
}

func (d AttendanceDiscipline) ViolationSummary(ctx context.Context, tenantID, academicYearID, studentUserID uuid.UUID) (int, int, error) {
	if on, err := moduleEnabled(ctx, d.Flags, tenantID, platformdomain.ModuleDiscipline); err != nil || !on {
		return 0, 0, err
	}
	return d.Svc.ViolationSummary(ctx, tenantID, academicYearID, studentUserID)
}

func (d AttendanceDiscipline) ViolationSummaryForClass(ctx context.Context, tenantID, classID uuid.UUID) (map[uuid.UUID]attendanceservice.ViolationSummary, error) {
	if on, err := moduleEnabled(ctx, d.Flags, tenantID, platformdomain.ModuleDiscipline); err != nil || !on {
		return nil, err
	}
	totals, err := d.Svc.PointTotals(ctx, tenantID, uuid.NullUUID{UUID: classID, Valid: true}, homeroomClassPointTotalsLimit)
	if err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID]attendanceservice.ViolationSummary, len(totals))
	for _, t := range totals {
		out[t.StudentUserID] = attendanceservice.ViolationSummary{Count: t.RecordCount, Points: t.Total}
	}
	return out, nil
}

// PermitsOverrider exposes permits' issued leave letters to attendance as
// its Overrider: a letter covering a date forces the student's status for
// it. It also implements attendance's BatchOverrider so tenant-level jobs
// resolve many students and dates in one query.
type PermitsOverrider struct{ Svc *permitsservice.Service }

func (o PermitsOverrider) Override(ctx context.Context, tenantID, studentUserID uuid.UUID, date time.Time) (string, attendancedomain.EntrySource, bool, error) {
	status, ok, err := o.Svc.LeaveOverride(ctx, tenantID, studentUserID, date)
	if err != nil || !ok {
		return "", "", false, err
	}
	return status, attendancedomain.SourceLeave, true, nil
}

func (o PermitsOverrider) OverridesForDates(ctx context.Context, tenantID uuid.UUID, studentIDs []uuid.UUID, dates []time.Time) ([]attendanceservice.DateOverride, error) {
	rows, err := o.Svc.LeaveOverridesForDates(ctx, tenantID, studentIDs, dates)
	if err != nil {
		return nil, err
	}
	out := make([]attendanceservice.DateOverride, len(rows))
	for i, r := range rows {
		out[i] = attendanceservice.DateOverride{StudentUserID: r.StudentUserID, Date: r.Date, StatusCode: r.StatusCode}
	}
	return out, nil
}
