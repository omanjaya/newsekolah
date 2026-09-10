package service

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/domain"
)

// RecomputeAllTenants runs Recompute for every active tenant, one tenant
// transaction at a time, for the periodic River job (transport/jobs) to
// call. A tenant with no active academic year yet is skipped rather than
// failing the whole run -- a school that has not started its year is not
// an error condition for every other school's recompute.
func (s *Service) RecomputeAllTenants(ctx context.Context) error {
	tenants, err := s.repo.ListActiveTenants(ctx)
	if err != nil {
		return fmt.Errorf("list active tenants: %w", err)
	}
	var errs []error
	for _, tenantID := range tenants {
		if _, err := s.Recompute(ctx, tenantID); err != nil && !errors.Is(err, ErrNoActiveAcademicYear) {
			errs = append(errs, fmt.Errorf("recompute tenant %s: %w", tenantID, err))
		}
	}
	return errors.Join(errs...)
}

// Recompute scores every actively enrolled student in tenantID's active
// academic year and stores the result, for the River job (transport/jobs)
// to call on a schedule and for a manual re-run in a support flow. It
// returns how many students were scored.
func (s *Service) Recompute(ctx context.Context, tenantID uuid.UUID) (int, error) {
	now := s.clock.Now()
	scored := 0
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		policy, err := s.loadPolicy(ctx, tenantID)
		if err != nil {
			return fmt.Errorf("load policy: %w", err)
		}
		students, err := s.repo.ListActiveStudents(ctx, tenantID, yearID)
		if err != nil {
			return fmt.Errorf("list active students: %w", err)
		}
		for _, student := range students {
			signals := s.buildSignals(ctx, tenantID, student.StudentUserID, policy, now)
			result := domain.Score(signals, policy)
			err := s.repo.UpsertResult(ctx, tenantID, StoredResult{
				AcademicYearID: yearID, StudentUserID: student.StudentUserID, ClassID: student.ClassID,
				Level: result.Level, Score: result.Score, Signals: signals, Reasons: result.Reasons,
				PolicyVersion: policy.Version, ComputedAt: now,
			})
			if err != nil {
				return fmt.Errorf("store result for student %s: %w", student.StudentUserID, err)
			}
			scored++
		}
		return nil
	})
	return scored, err
}

// buildSignals reads the three cross-module adapters for one student. A
// failed read (the owning module has nothing for this student, or an
// unrelated error) degrades that one signal to "unavailable" rather than
// failing the whole batch: a nightly recompute across a whole school must
// not stop at the first student whose grading data is still mid-migration,
// and domain.Score already treats an unavailable signal as contributing
// nothing, per its own doc comment.
func (s *Service) buildSignals(ctx context.Context, tenantID, studentID uuid.UUID, policy domain.Policy, now time.Time) domain.Signals {
	var signals domain.Signals

	if s.attendance != nil {
		if considered, absent, ok := s.attendanceWindow(ctx, tenantID, studentID, policy.WindowDays, now); ok {
			signals.HasAttendance = true
			signals.ConsideredDays = considered
			signals.AbsentDays = absent
		}
	}

	if s.discipline != nil {
		if summary, err := s.discipline.StudentSummary(ctx, tenantID, studentID); err == nil {
			signals.ActiveViolationCount = summary.ActiveViolationCount
			signals.DisciplinePoints = summary.TotalPoints
			signals.WarningLetterCount = summary.WarningLetterCount
		}
	}

	if s.grading != nil {
		if trend, err := s.grading.ReportTrend(ctx, tenantID, studentID); err == nil && trend.Available {
			signals.HasGradeTrend = true
			signals.PreviousAverage = trend.PreviousAverage
			signals.CurrentAverage = trend.CurrentAverage
		}
	}

	return signals
}

// attendanceWindow counts absences over the trailing windowDays calendar
// days by walking back one month at a time from now until it has seen at
// least windowDays days that attendance actually recorded a status for
// (school days), or has looked back far enough that continuing would not
// be a meaningful "recent" window. Attendance's own reader only exposes a
// month at a time (family's adapter uses the same shape), so a rolling
// window is assembled from whole months rather than reading attendance's
// tables directly.
func (s *Service) attendanceWindow(ctx context.Context, tenantID, studentID uuid.UUID, windowDays int, now time.Time) (considered, absent int, ok bool) {
	const maxMonthsBack = 3 // three months comfortably covers windowDays school days for any realistic policy

	var days []DayStatus
	cursor := now
	for i := 0; i < maxMonthsBack && len(days) < windowDays; i++ {
		month := cursor.Format("2006-01")
		monthDays, err := s.attendance.MonthlySummary(ctx, tenantID, studentID, month)
		if err != nil {
			break
		}
		days = append(days, monthDays...)
		cursor = cursor.AddDate(0, -1, 0)
	}
	if len(days) == 0 {
		return 0, 0, false
	}

	sort.Slice(days, func(i, j int) bool { return days[i].Date.After(days[j].Date) })

	limit := windowDays
	if limit > len(days) {
		limit = len(days)
	}
	for _, d := range days[:limit] {
		if d.StatusCode == "" {
			continue // no session recorded that day (not a school day, or not yet submitted)
		}
		considered++
		if d.StatusCode == "absent" {
			absent++
		}
	}
	return considered, absent, considered > 0
}
