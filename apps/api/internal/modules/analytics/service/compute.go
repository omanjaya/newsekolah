package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/domain"
)

// recomputeBatchSize is how many students one recompute transaction scores
// and stores. A whole school is therefore never held in a single
// transaction: each batch reads its signals with a handful of aggregate
// queries, writes its results with one statement and commits.
const recomputeBatchSize = 500

// RecomputeAllTenants runs Recompute for every active tenant, one tenant
// at a time, for the periodic River job (transport/jobs) to call. A tenant
// with no active academic year yet is skipped rather than failing the
// whole run -- a school that has not started its year is not an error
// condition for every other school's recompute.
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

// recomputeScope is what one recompute run reads once up front and shares
// across its batches.
type recomputeScope struct {
	yearID   uuid.UUID
	policy   domain.Policy
	students []StudentRef
	// today is the current calendar date in the tenant's timezone (as a
	// UTC-midnight date), the last day the attendance window may include.
	today time.Time
}

// Recompute scores every actively enrolled student in tenantID's active
// academic year and stores the result, for the River job (transport/jobs)
// to call on a schedule and for a manual re-run in a support flow. It
// returns how many students were scored.
//
// The roster and policy are read in one short transaction; the students
// are then scored recomputeBatchSize at a time, each batch in its own
// short tenant transaction. Storing is an upsert, so a run interrupted
// between batches leaves every finished batch current and the rest as the
// previous run left them.
func (s *Service) Recompute(ctx context.Context, tenantID uuid.UUID) (int, error) {
	now := s.clock.Now()

	var scope recomputeScope
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
		today, err := s.tenantToday(ctx, tenantID, now)
		if err != nil {
			return err
		}
		scope = recomputeScope{yearID: yearID, policy: policy, students: students, today: today}
		return nil
	})
	if err != nil {
		return 0, err
	}

	scored := 0
	for start := 0; start < len(scope.students); start += recomputeBatchSize {
		batch := scope.students[start:min(start+recomputeBatchSize, len(scope.students))]
		err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
			return s.scoreBatch(ctx, tenantID, scope, batch, now)
		})
		if err != nil {
			return scored, err
		}
		scored += len(batch)
	}
	return scored, nil
}

// scoreBatch reads the signals of every student in batch at once, scores
// them with the pure domain rule and stores the results with one upsert.
func (s *Service) scoreBatch(ctx context.Context, tenantID uuid.UUID, scope recomputeScope, batch []StudentRef, now time.Time) error {
	ids := make([]uuid.UUID, len(batch))
	for i, student := range batch {
		ids[i] = student.StudentUserID
	}
	signals := s.buildSignals(ctx, tenantID, ids, scope.policy, scope.today)

	results := make([]StoredResult, len(batch))
	for i, student := range batch {
		studentSignals := signals[student.StudentUserID]
		scored := domain.Score(studentSignals, scope.policy)
		results[i] = StoredResult{
			AcademicYearID: scope.yearID, StudentUserID: student.StudentUserID, ClassID: student.ClassID,
			Level: scored.Level, Score: scored.Score, Signals: studentSignals, Reasons: scored.Reasons,
			PolicyVersion: scope.policy.Version, ComputedAt: now,
		}
	}
	if err := s.repo.UpsertResults(ctx, tenantID, results); err != nil {
		return fmt.Errorf("store results: %w", err)
	}
	return nil
}

// buildSignals reads the three cross-module adapters once for every
// student in studentIDs. A failed read (the owning module has nothing to
// say, or an unrelated error) degrades that one signal to "unavailable"
// for the batch rather than failing the recompute: a nightly run across a
// whole school must not stop because, for example, grading data is still
// mid-migration, and domain.Score already treats an unavailable signal as
// contributing nothing, per its own doc comment.
func (s *Service) buildSignals(ctx context.Context, tenantID uuid.UUID, studentIDs []uuid.UUID, policy domain.Policy, today time.Time) map[uuid.UUID]domain.Signals {
	signals := make(map[uuid.UUID]domain.Signals, len(studentIDs))
	for _, id := range studentIDs {
		signals[id] = domain.Signals{}
	}

	if s.attendance != nil {
		dates := attendanceLookbackDates(policy.WindowDays, today)
		if rows, err := s.attendance.DayStatuses(ctx, tenantID, studentIDs, dates); err == nil {
			applyAttendance(signals, rows, dates, policy.WindowDays)
		}
	}

	if s.discipline != nil {
		if summaries, err := s.discipline.StudentSummaries(ctx, tenantID, studentIDs); err == nil {
			for id, summary := range summaries {
				if current, ok := signals[id]; ok {
					current.ActiveViolationCount = summary.ActiveViolationCount
					current.DisciplinePoints = summary.TotalPoints
					current.WarningLetterCount = summary.WarningLetterCount
					signals[id] = current
				}
			}
		}
	}

	if s.grading != nil {
		if trends, err := s.grading.ReportTrends(ctx, tenantID, studentIDs); err == nil {
			for id, trend := range trends {
				if current, ok := signals[id]; ok && trend.Available {
					current.HasGradeTrend = true
					current.PreviousAverage = trend.PreviousAverage
					current.CurrentAverage = trend.CurrentAverage
					signals[id] = current
				}
			}
		}
	}

	return signals
}
