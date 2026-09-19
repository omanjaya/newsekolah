package service

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
)

// Actor describes who is calling a mutating schedule operation: whether
// they hold manage_schedules (an admin, who may set any source and touch
// any teacher's schedule) or are a teacher acting on their own schedule
// under the self-service deadline.
type Actor struct {
	UserID    uuid.UUID
	CanManage bool
}

// ScheduleInput is what a caller supplies to create or update a schedule;
// Source and TeacherUserID are only honoured for a CanManage actor -- a
// teacher's own request always becomes source=teacher for themselves,
// regardless of what they pass.
type ScheduleInput struct {
	AcademicYearID uuid.UUID
	TermID         uuid.NullUUID
	ClassID        uuid.UUID
	SubjectID      uuid.UUID
	TeacherUserID  uuid.UUID
	RoomID         uuid.NullUUID
	DayOfWeek      int16
	StartPeriodID  uuid.UUID
	EndPeriodID    uuid.UUID
	Source         domain.Source
	Notes          string
}

const settingTeacherEditDeadline = "schedule.teacher_edit_deadline"

// defaultTeacherEditDeadline applies when the tenant has not configured
// schedule.teacher_edit_deadline: a full day's notice.
const defaultTeacherEditDeadline = 24 * time.Hour

func (s *Service) CreateSchedule(ctx context.Context, tenantID uuid.UUID, in ScheduleInput, actor Actor) (domain.Schedule, error) {
	in = applyActor(in, actor)

	var created domain.Schedule
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		candidate, err := s.resolveCandidate(ctx, tenantID, in)
		if err != nil {
			return err
		}

		if !actor.CanManage {
			if err := s.enforceTeacherWindow(ctx, tenantID, candidate, s.now()); err != nil {
				return err
			}
		}

		if err := s.checkConflict(ctx, tenantID, candidate, uuid.Nil); err != nil {
			return err
		}

		created, err = s.repo.CreateSchedule(ctx, candidate)
		if err != nil {
			return mapConstraintError(err)
		}
		return nil
	})
	return created, err
}

func (s *Service) UpdateSchedule(ctx context.Context, tenantID, id uuid.UUID, in ScheduleInput, actor Actor) (domain.Schedule, error) {
	in = applyActor(in, actor)

	var updated domain.Schedule
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		existing, err := s.repo.GetScheduleByID(ctx, tenantID, id)
		if err != nil {
			return domain.ErrScheduleNotFound
		}
		if !actor.CanManage && existing.TeacherUserID != actor.UserID {
			return domain.ErrTeacherEditForbidden
		}

		candidate, err := s.resolveCandidate(ctx, tenantID, in)
		if err != nil {
			return err
		}
		candidate.ID = id
		if existing.AcademicYearID != in.AcademicYearID {
			return domain.ErrInvalidScheduleBlock
		}

		if !actor.CanManage {
			if err := s.enforceTeacherWindow(ctx, tenantID, existing, s.now()); err != nil {
				return err
			}
			if err := s.enforceTeacherWindow(ctx, tenantID, candidate, s.now()); err != nil {
				return err
			}
		}

		if err := s.checkConflict(ctx, tenantID, candidate, id); err != nil {
			return err
		}

		updated, err = s.repo.UpdateSchedule(ctx, candidate)
		if err != nil {
			return mapConstraintError(err)
		}
		return nil
	})
	return updated, err
}

// DeleteSchedule does not check IsYearArchived, unlike CreateSchedule and
// UpdateSchedule (both go through resolveCandidate, which does). This is
// deliberate, not an oversight: an archived year's schedules are history
// the tenant may still need to clean up (e.g. a bad bulk import caught
// after archiving), and academic/service's own delete methods (DeleteClass,
// DeleteGradeLevel, ...) follow the same rule -- the archived-year guard
// exists to stop new edits landing in a closed year, not to freeze
// deletion of what is already there.
func (s *Service) DeleteSchedule(ctx context.Context, tenantID, id uuid.UUID, actor Actor) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		existing, err := s.repo.GetScheduleByID(ctx, tenantID, id)
		if err != nil {
			return domain.ErrScheduleNotFound
		}
		if !actor.CanManage {
			if existing.TeacherUserID != actor.UserID {
				return domain.ErrTeacherEditForbidden
			}
			if err := s.enforceTeacherWindow(ctx, tenantID, existing, s.now()); err != nil {
				return err
			}
		}
		return mapConstraintError(s.repo.DeleteSchedule(ctx, tenantID, id))
	})
}

// ClearAcademicYear deletes every schedule for one academic year (admin
// bulk clear), typically before a bulk import. Like DeleteSchedule, it does
// not check IsYearArchived -- see DeleteSchedule's comment for why deletion
// is exempt from the archived-year guard that CreateSchedule and
// UpdateSchedule enforce.
func (s *Service) ClearAcademicYear(ctx context.Context, tenantID, academicYearID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return mapConstraintError(s.repo.DeleteSchedulesByAcademicYear(ctx, tenantID, academicYearID))
	})
}

// BulkImport creates every schedule in inputs inside one transaction,
// stopping at the first conflict or validation error so a partially valid
// spreadsheet never leaves half its rows applied.
func (s *Service) BulkImport(ctx context.Context, tenantID uuid.UUID, inputs []ScheduleInput) ([]domain.Schedule, error) {
	var created []domain.Schedule
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		for _, in := range inputs {
			candidate, err := s.resolveCandidate(ctx, tenantID, in)
			if err != nil {
				return err
			}
			if err := s.checkConflict(ctx, tenantID, candidate, uuid.Nil); err != nil {
				return err
			}
			row, err := s.repo.CreateSchedule(ctx, candidate)
			if err != nil {
				return mapConstraintError(err)
			}
			created = append(created, row)
		}
		return nil
	})
	return created, err
}

// GetSchedule returns one schedule.
func (s *Service) GetSchedule(ctx context.Context, tenantID, id uuid.UUID) (domain.Schedule, error) {
	var out domain.Schedule
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.GetScheduleByID(ctx, tenantID, id)
		if err != nil {
			return domain.ErrScheduleNotFound
		}
		return nil
	})
	return out, err
}

// ListByClass returns a class's schedules merged into contiguous blocks
// for display, per docs/analysis/backend-inventory.md section 1.8.
func (s *Service) ListByClass(ctx context.Context, tenantID, academicYearID, classID uuid.UUID) ([]domain.Block, error) {
	var schedules []domain.Schedule
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		schedules, err = s.repo.ListSchedulesByClass(ctx, tenantID, academicYearID, classID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return domain.MergeContiguous(schedules), nil
}

// ListByTeacher returns a teacher's own schedules merged into contiguous
// blocks.
func (s *Service) ListByTeacher(ctx context.Context, tenantID, academicYearID, teacherID uuid.UUID) ([]domain.Block, error) {
	var schedules []domain.Schedule
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		schedules, err = s.repo.ListSchedulesByTeacher(ctx, tenantID, academicYearID, teacherID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return domain.MergeContiguous(schedules), nil
}

// ListByDay returns one day's schedules across every class, merged into
// contiguous blocks (the "per day" grid view).
func (s *Service) ListByDay(ctx context.Context, tenantID, academicYearID uuid.UUID, dayOfWeek int16) ([]domain.Block, error) {
	var schedules []domain.Schedule
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		schedules, err = s.repo.ListSchedulesByDay(ctx, tenantID, academicYearID, dayOfWeek)
		return err
	})
	if err != nil {
		return nil, err
	}
	return domain.MergeContiguous(schedules), nil
}

// MutationPolicy tells a caller (for one schedule) whether they may edit
// or delete it right now, so the transport layer can include it in list
// responses without the client re-deriving the teacher-edit-deadline math
// itself.
type MutationPolicy struct {
	CanEdit   bool
	CanDelete bool
	Reason    string
}

func (s *Service) MutationPolicyFor(ctx context.Context, tenantID uuid.UUID, sched domain.Schedule, actor Actor) MutationPolicy {
	if actor.CanManage {
		return MutationPolicy{CanEdit: true, CanDelete: true}
	}
	if sched.TeacherUserID != actor.UserID {
		return MutationPolicy{Reason: domain.ErrTeacherEditForbidden.Error()}
	}
	if err := s.enforceTeacherWindow(ctx, tenantID, sched, s.now()); err != nil {
		return MutationPolicy{Reason: err.Error()}
	}
	return MutationPolicy{CanEdit: true, CanDelete: true}
}

func applyActor(in ScheduleInput, actor Actor) ScheduleInput {
	if !actor.CanManage {
		in.Source = domain.SourceTeacher
		in.TeacherUserID = actor.UserID
	} else if in.Source == "" {
		in.Source = domain.SourceAdmin
	}
	return in
}

// resolveCandidate validates in against academic reference data (periods,
// school days, teaching assignment) and builds the domain.Schedule ready
// for conflict checking and persistence.
func (s *Service) resolveCandidate(ctx context.Context, tenantID uuid.UUID, in ScheduleInput) (domain.Schedule, error) {
	if archived, err := s.repo.IsYearArchived(ctx, tenantID, in.AcademicYearID); err != nil {
		return domain.Schedule{}, err
	} else if archived {
		return domain.Schedule{}, domain.ErrYearArchived
	}

	startPeriod, err := s.repo.GetPeriodRef(ctx, tenantID, in.StartPeriodID)
	if err != nil {
		return domain.Schedule{}, domain.ErrPeriodNotFound
	}
	endPeriod, err := s.repo.GetPeriodRef(ctx, tenantID, in.EndPeriodID)
	if err != nil {
		return domain.Schedule{}, domain.ErrPeriodNotFound
	}
	if endPeriod.TemplateID != startPeriod.TemplateID {
		return domain.Schedule{}, domain.ErrInvalidPeriodRange
	}
	if err := domain.ValidatePeriodRange(startPeriod.Sequence, endPeriod.Sequence); err != nil {
		return domain.Schedule{}, err
	}
	if startPeriod.IsBreak || endPeriod.IsBreak {
		return domain.Schedule{}, domain.ErrPeriodIsBreak
	}

	schoolDay, err := s.repo.IsSchoolDay(ctx, tenantID, in.AcademicYearID, in.DayOfWeek)
	if err != nil || !schoolDay {
		return domain.Schedule{}, domain.ErrDayNotSchoolDay
	}

	// The period template itself can be shared across weekdays; only the
	// one period_day_assignments maps to in.DayOfWeek for this academic
	// year is the one a schedule on that day may draw its periods from.
	dayTemplateID, err := s.repo.GetPeriodTemplateForDay(ctx, tenantID, in.AcademicYearID, in.DayOfWeek)
	if err != nil || dayTemplateID != startPeriod.TemplateID {
		return domain.Schedule{}, domain.ErrPeriodTemplateDay
	}

	if _, err := s.repo.GetClassRef(ctx, tenantID, in.ClassID); err != nil {
		return domain.Schedule{}, domain.ErrScheduleNotFound
	}
	if _, err := s.repo.GetSubjectRef(ctx, tenantID, in.SubjectID); err != nil {
		return domain.Schedule{}, domain.ErrScheduleNotFound
	}

	ok, err := s.repo.HasTeachingAssignment(ctx, tenantID, in.AcademicYearID, in.TeacherUserID, in.SubjectID, in.ClassID)
	if err != nil || !ok {
		return domain.Schedule{}, domain.ErrTeacherNotAssigned
	}

	return domain.Schedule{
		TenantID:       tenantID,
		AcademicYearID: in.AcademicYearID,
		TermID:         in.TermID,
		ClassID:        in.ClassID,
		SubjectID:      in.SubjectID,
		TeacherUserID:  in.TeacherUserID,
		RoomID:         in.RoomID,
		DayOfWeek:      in.DayOfWeek,
		StartPeriodID:  in.StartPeriodID,
		EndPeriodID:    in.EndPeriodID,
		StartSeq:       startPeriod.Sequence,
		EndSeq:         endPeriod.Sequence,
		Source:         in.Source,
		Notes:          in.Notes,
	}, nil
}

func (s *Service) checkConflict(ctx context.Context, tenantID uuid.UUID, candidate domain.Schedule, selfID uuid.UUID) error {
	existing, err := s.repo.ListSchedulesByDay(ctx, tenantID, candidate.AcademicYearID, candidate.DayOfWeek)
	if err != nil {
		return err
	}
	conflictErr := domain.DetectConflict(existing, candidate, selfID)
	if conflictErr == nil {
		return nil
	}
	var conflict *domain.ConflictError
	if errors.As(conflictErr, &conflict) {
		s.nameConflict(ctx, tenantID, conflict)
	}
	return conflictErr
}

// nameConflict resolves the class/subject/teacher names for a conflict's
// "With" schedule, best-effort: a lookup failure here must not hide the
// conflict itself, so a name simply stays blank rather than aborting the
// request.
func (s *Service) nameConflict(ctx context.Context, tenantID uuid.UUID, conflict *domain.ConflictError) {
	if class, err := s.repo.GetClassRef(ctx, tenantID, conflict.With.ClassID); err == nil {
		conflict.ClassName = class.Name
	}
	if subject, err := s.repo.GetSubjectRef(ctx, tenantID, conflict.With.SubjectID); err == nil {
		conflict.SubjectName = subject.Name
	}
	if teacher, err := s.repo.GetUserRef(ctx, tenantID, conflict.With.TeacherUserID); err == nil {
		conflict.TeacherName = teacher.Name
	}
	if start, err := s.repo.GetPeriodRef(ctx, tenantID, conflict.With.StartPeriodID); err == nil {
		conflict.StartPeriodName = start.Name
	}
	if end, err := s.repo.GetPeriodRef(ctx, tenantID, conflict.With.EndPeriodID); err == nil {
		conflict.EndPeriodName = end.Name
	}
}

// enforceTeacherWindow checks schedule.teacher_edit_deadline, which comes
// in two forms this tenant setting has carried over the app's history:
// an RFC3339 timestamp -- a single absolute cutoff, the old app's format
// ("fill in your schedule before the semester starts") -- or a
// time.ParseDuration string -- the current rolling per-occurrence window
// ("don't touch a lesson inside its last 24 hours"). Whichever the
// setting parses as decides which rule applies; an unset or unparseable
// setting falls back to the duration form with defaultTeacherEditDeadline.
func (s *Service) enforceTeacherWindow(ctx context.Context, tenantID uuid.UUID, sched domain.Schedule, now time.Time) error {
	raw, ok, err := s.repo.GetTenantSettingValue(ctx, tenantID, settingTeacherEditDeadline)
	if err != nil {
		ok = false
	}

	if ok {
		if deadline, err := time.Parse(time.RFC3339, raw); err == nil {
			if !domain.TeacherEditAllowedBefore(now, deadline) {
				return domain.ErrTeacherEditDeadline
			}
			return nil
		}
	}

	deadline := defaultTeacherEditDeadline
	if ok {
		if d, err := time.ParseDuration(raw); err == nil {
			deadline = d
		}
	}

	period, err := s.repo.GetPeriodRef(ctx, tenantID, sched.StartPeriodID)
	if err != nil {
		return domain.ErrPeriodNotFound
	}

	occursAt := nextOccurrence(now, sched.DayOfWeek, period.StartsAt)
	if !domain.TeacherEditAllowed(now, occursAt, deadline) {
		return domain.ErrTeacherEditDeadline
	}
	return nil
}

// nextOccurrence finds the next date (today included) whose ISO weekday is
// dayOfWeek, combined with the period's time-of-day.
func nextOccurrence(now time.Time, dayOfWeek int16, timeOfDay time.Time) time.Time {
	nowWeekday := int16(now.Weekday()) //nolint:gosec // Weekday is 0..6
	if nowWeekday == 0 {
		nowWeekday = 7
	}
	daysAhead := int(dayOfWeek - nowWeekday)
	if daysAhead < 0 {
		daysAhead += 7
	}
	next := now.AddDate(0, 0, daysAhead)
	y, m, d := next.Date()
	return time.Date(y, m, d, timeOfDay.Hour(), timeOfDay.Minute(), timeOfDay.Second(), 0, now.Location())
}

// mapConstraintError translates a Postgres exclusion-constraint violation
// (the schedules table's two GiST constraints -- see migration
// 0030_schedules.up.sql) into the same domain errors the pre-check in
// checkConflict would have returned, closing the race the domain-level
// check alone cannot: two concurrent requests can both pass the
// application-level check and only the database enforces the second one
// atomically.
const pgExclusionViolation = "23P01"

func mapConstraintError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23503" &&
		(pgErr.ConstraintName == "attendance_sessions_schedule_id_fkey" ||
			pgErr.ConstraintName == "substitution_requests_schedule_id_fkey" ||
			pgErr.ConstraintName == "schedule_history_guard") {
		return domain.ErrScheduleHasHistory
	}
	if errors.As(err, &pgErr) && pgErr.Code == pgExclusionViolation {
		if strings.Contains(pgErr.ConstraintName, "teacher_user_id") {
			return domain.ErrConflictTeacher
		}
		return domain.ErrConflictClass
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrScheduleNotFound
	}
	return err
}

// now is the single injection point for the clock; tests may override it.
func (s *Service) now() time.Time { return s.clock.Now() }

// UpdateScheduleBlock collapses a displayed contiguous block to one span while
// retaining its primary ID. Validation, sibling removal and update share a transaction.
func (s *Service) UpdateScheduleBlock(ctx context.Context, tenantID, id uuid.UUID, ids []uuid.UUID, in ScheduleInput, actor Actor) (domain.Schedule, error) {
	var updated domain.Schedule
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.lockScheduleBlock(ctx, tenantID, id, ids); err != nil {
			return err
		}
		for _, sibling := range ids {
			if sibling == id {
				continue
			}
			if err := s.DeleteSchedule(ctx, tenantID, sibling, actor); err != nil {
				return err
			}
		}
		var err error
		updated, err = s.UpdateSchedule(ctx, tenantID, id, in, actor)
		return err
	})
	return updated, err
}

func (s *Service) DeleteScheduleBlock(ctx context.Context, tenantID, id uuid.UUID, ids []uuid.UUID, actor Actor) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.lockScheduleBlock(ctx, tenantID, id, ids); err != nil {
			return err
		}
		for _, rowID := range ids {
			if err := s.DeleteSchedule(ctx, tenantID, rowID, actor); err != nil {
				return err
			}
		}
		return nil
	})
}

// Lock in stable order before changing anything. FOR UPDATE also serializes
// concurrent attendance/substitution inserts that take a foreign-key row lock.
func (s *Service) lockScheduleBlock(ctx context.Context, tenantID, primary uuid.UUID, ids []uuid.UUID) error {
	if len(ids) == 0 || len(ids) > 100 {
		return domain.ErrInvalidScheduleBlock
	}
	ordered := append([]uuid.UUID(nil), ids...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].String() < ordered[j].String() })
	rows := make([]domain.Schedule, 0, len(ordered))
	found := false
	for i, id := range ordered {
		if i > 0 && id == ordered[i-1] {
			return domain.ErrInvalidScheduleBlock
		}
		found = found || id == primary
		row, err := s.repo.GetScheduleByID(ctx, tenantID, id)
		if err != nil {
			return domain.ErrScheduleNotFound
		}
		rows = append(rows, row)
	}
	if !found || len(domain.MergeContiguous(rows)) != 1 {
		return domain.ErrInvalidScheduleBlock
	}
	return nil
}
