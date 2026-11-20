package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
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
		// A tenant someone is rescoring right now (a policy save or an
		// overseer's "recompute now") is already being brought up to date.
		_, err := s.Recompute(ctx, tenantID)
		if err != nil && !errors.Is(err, ErrNoActiveAcademicYear) && !errors.Is(err, ErrRecomputeInProgress) {
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
// to call on a schedule, for UpdatePolicy right after a save, and for an
// on-demand "recompute now". It returns how many students were scored.
//
// One rescore of a tenant runs at a time, whichever of those started it,
// across every API process: a second one while the first is running
// returns ErrRecomputeInProgress at once instead of scoring the whole
// school again alongside it.
//
// The roster and policy are read in one short transaction; the students
// are then scored recomputeBatchSize at a time, each batch in its own
// short tenant transaction. Storing is an upsert, so a run interrupted
// between batches leaves every finished batch current and the rest as the
// previous run left them.
func (s *Service) Recompute(ctx context.Context, tenantID uuid.UUID) (int, error) {
	return s.lockedRecompute(ctx, tenantID, s.clock.Now())
}

// lockedRecompute is recomputeAt under the tenant's recompute lock.
func (s *Service) lockedRecompute(ctx context.Context, tenantID uuid.UUID, now time.Time) (int, error) {
	release, acquired, err := database.TryAdvisoryLock(ctx, s.pool, RecomputeLockKey(tenantID))
	if err != nil {
		return 0, err
	}
	if !acquired {
		return 0, ErrRecomputeInProgress
	}
	defer release()
	return s.recomputeAt(ctx, tenantID, now)
}

// RecomputeLockKey names the advisory lock that keeps one rescore per
// tenant at a time.
func RecomputeLockKey(tenantID uuid.UUID) string {
	return "analytics_recompute:" + tenantID.String()
}

func (s *Service) recomputeAt(ctx context.Context, tenantID uuid.UUID, now time.Time) (int, error) {

	var scope recomputeScope
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		scope, err = s.loadScope(ctx, tenantID, now)
		return err
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

// RecomputeNow is Recompute for an overseer's "recompute now", also
// returning the time the results are stamped with.
func (s *Service) RecomputeNow(ctx context.Context, tenantID uuid.UUID) (int, time.Time, error) {
	now := s.clock.Now()
	scored, err := s.lockedRecompute(ctx, tenantID, now)
	return scored, now, err
}

// RecomputeStudents scores just these students now and stores the result,
// so a change to one student's record (a violation recorded or voided, a
// warning letter issued) shows on the early-warning screens at once rather
// than after the nightly run. Only these students' enrollments are read,
// never the whole roster, and a student without an active enrollment is
// skipped. It runs in the caller's transaction when there is one, so the
// stored score commits together with the change that caused it.
func (s *Service) RecomputeStudents(ctx context.Context, tenantID uuid.UUID, studentIDs []uuid.UUID) error {
	if len(studentIDs) == 0 {
		return nil
	}
	now := s.clock.Now()
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		scope, err := s.loadSettings(ctx, tenantID, now)
		if err != nil {
			return err
		}
		scope.students, err = s.repo.ListActiveStudentsByIDs(ctx, tenantID, scope.yearID, studentIDs)
		if err != nil {
			return fmt.Errorf("list active students: %w", err)
		}
		if len(scope.students) == 0 {
			return nil
		}
		return s.scoreBatch(ctx, tenantID, scope, scope.students, now)
	})
}

// loadScope reads what a recompute run shares across its batches: the
// active year, the scoring policy, today's date and the enrolled roster.
func (s *Service) loadScope(ctx context.Context, tenantID uuid.UUID, now time.Time) (recomputeScope, error) {
	scope, err := s.loadSettings(ctx, tenantID, now)
	if err != nil {
		return recomputeScope{}, err
	}
	scope.students, err = s.repo.ListActiveStudents(ctx, tenantID, scope.yearID)
	if err != nil {
		return recomputeScope{}, fmt.Errorf("list active students: %w", err)
	}
	return scope, nil
}

// loadSettings is loadScope without the roster: the active year, the
// scoring policy and today's date.
func (s *Service) loadSettings(ctx context.Context, tenantID uuid.UUID, now time.Time) (recomputeScope, error) {
	yearID, err := s.activeYear(ctx, tenantID)
	if err != nil {
		return recomputeScope{}, err
	}
	policy, err := s.loadPolicy(ctx, tenantID)
	if err != nil {
		return recomputeScope{}, fmt.Errorf("load policy: %w", err)
	}
	today, err := s.tenantToday(ctx, tenantID, now)
	if err != nil {
		return recomputeScope{}, err
	}
	return recomputeScope{yearID: yearID, policy: policy, today: today}, nil
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
				current, ok := signals[id]
				if !ok {
					continue
				}
				// The active term's standing and average count on their
				// own, even in a first term with no previous term to
				// compare with; the scorer reads the average only with a
				// trend. Without a scored subject there is no average to
				// show, whatever the reader sent.
				current.ScoredSubjects, current.SubjectsBelowKKTP = trend.ScoredSubjects, trend.SubjectsBelowKKTP
				if trend.ScoredSubjects > 0 || trend.Available {
					current.CurrentAverage = trend.CurrentAverage
				}
				if trend.Available {
					current.HasGradeTrend = true
					current.PreviousAverage = trend.PreviousAverage
				}
				signals[id] = current
			}
		}
	}

	return signals
}
