package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
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
//
// EffectiveFrom is the date the lesson (on create) or the change (on
// update) takes effect; only a CanManage actor may send it (a date before
// today, back to the start of the year, is how a timetable is entered for
// weeks already taught). Omitted on a create, the lesson starts on its
// first date on or after the school's today (or the year's start, when
// that is later), so weeks already past are never given a lesson nobody
// recorded; omitted on an update, the block is corrected in place, which
// is refused once it has history or has ended.
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
	EffectiveFrom  *time.Time
}

const settingTeacherEditDeadline = "schedule.teacher_edit_deadline"

// defaultTeacherEditDeadline applies when the tenant has not configured
// schedule.teacher_edit_deadline: a full day's notice.
const defaultTeacherEditDeadline = 24 * time.Hour

func (s *Service) CreateSchedule(ctx context.Context, tenantID uuid.UUID, in ScheduleInput, actor Actor) (domain.Schedule, error) {
	in = applyActor(in, actor)
	if in.EffectiveFrom != nil && !actor.CanManage {
		return domain.Schedule{}, domain.ErrEffectiveDateAdminOnly
	}

	var created domain.Schedule
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		candidate, err := s.resolveCandidate(ctx, tenantID, in)
		if err != nil {
			return err
		}
		year, err := s.academicYear(ctx, tenantID, in.AcademicYearID)
		if err != nil {
			return err
		}
		if candidate.EffectiveFrom, err = s.startDate(ctx, tenantID, year, candidate, in.EffectiveFrom); err != nil {
			return err
		}

		if !actor.CanManage {
			if err := s.enforceTeacherWindow(ctx, tenantID, candidate, s.now(ctx)); err != nil {
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

// startDate is a new version's first lesson date: from, snapped forward
// onto the lesson's weekday. Without from it is the first lesson on or
// after the school's today (never one that has already begun today) or
// after the year's start when that is later: a lesson added mid-year is
// not backdated over weeks already taught. A date outside the year, or a
// first lesson that would fall after the year ends, is refused.
func (s *Service) startDate(ctx context.Context, tenantID uuid.UUID, year AcademicYearRef, candidate domain.Schedule, from *time.Time) (time.Time, error) {
	var snapped time.Time
	if from != nil {
		if err := requireInYear(year, *from); err != nil {
			return time.Time{}, err
		}
		snapped = domain.OnOrAfter(*from, candidate.DayOfWeek)
	} else {
		today := s.today(ctx)
		snapped = domain.OnOrAfter(domain.LaterDate(domain.CalendarDate(year.StartsOn), today), candidate.DayOfWeek)
		if snapped.Equal(today) {
			period, err := s.repo.GetPeriodRef(ctx, tenantID, candidate.StartPeriodID)
			if err != nil {
				return time.Time{}, domain.ErrPeriodNotFound
			}
			candidate.EffectiveFrom = snapped
			if domain.LessonBegun(candidate, today, s.now(ctx), period.StartsAt) {
				snapped = snapped.AddDate(0, 0, 7)
			}
		}
	}
	if !year.EndsOn.IsZero() && snapped.After(domain.CalendarDate(year.EndsOn)) {
		return time.Time{}, domain.ErrEffectiveFromOutOfYear
	}
	return snapped, nil
}

// requireInYear refuses a change date outside the academic year.
func requireInYear(year AcademicYearRef, d time.Time) error {
	d = domain.CalendarDate(d)
	if d.Before(domain.CalendarDate(year.StartsOn)) || (!year.EndsOn.IsZero() && d.After(domain.CalendarDate(year.EndsOn))) {
		return domain.ErrEffectiveFromOutOfYear
	}
	return nil
}

// UpdateSchedule corrects or changes one schedule row; see
// UpdateScheduleBlock.
func (s *Service) UpdateSchedule(ctx context.Context, tenantID, id uuid.UUID, in ScheduleInput, actor Actor) (domain.Schedule, error) {
	return s.UpdateScheduleBlock(ctx, tenantID, id, []uuid.UUID{id}, in, actor)
}

// DeleteSchedule removes one schedule row; see DeleteScheduleBlock.
func (s *Service) DeleteSchedule(ctx context.Context, tenantID, id uuid.UUID, actor Actor) error {
	return s.DeleteScheduleBlock(ctx, tenantID, id, []uuid.UUID{id}, nil, actor)
}

// UpdateScheduleBlock replaces a displayed contiguous block (ids, one or
// more rows) with the single lesson in. Validation, the old rows and the
// new one share a transaction, so a refusal leaves the block as it was.
//
// Without in.EffectiveFrom the block is corrected in place: its other rows
// go and primary is rewritten, keeping primary's ID and dates. A block
// with history refuses that (HistoryRequiresDateError names the earliest
// date a dated change may use instead), as does one that has already
// ended (ErrScheduleEnded): it only describes weeks that are over.
//
// With in.EffectiveFrom (D) the change takes effect from D: every row ends
// on its last lesson before D (or goes, when it has none) and a new
// version starts on the first lesson date on or after D; the returned
// schedule is that new version. D may not lie before today or on or
// before a date the block has history for (ChangeTooEarlyError). A change
// that touches nothing about the lesson itself (its notes) is saved on the
// row in place instead, whatever D says.
func (s *Service) UpdateScheduleBlock(ctx context.Context, tenantID, primaryID uuid.UUID, ids []uuid.UUID, in ScheduleInput, actor Actor) (domain.Schedule, error) {
	in = applyActor(in, actor)
	if in.EffectiveFrom != nil && !actor.CanManage {
		return domain.Schedule{}, domain.ErrEffectiveDateAdminOnly
	}
	var updated domain.Schedule
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		primary, rows, err := s.lockScheduleBlock(ctx, tenantID, primaryID, ids)
		if err != nil {
			return err
		}
		if err := s.authorizeRows(ctx, tenantID, rows, actor); err != nil {
			return err
		}
		if primary.AcademicYearID != in.AcademicYearID {
			return domain.ErrInvalidScheduleBlock
		}
		history, err := s.loadHistory(ctx, tenantID, ids)
		if err != nil {
			return err
		}
		if in.EffectiveFrom == nil {
			if err := requireCurrent(rows, s.today(ctx)); err != nil {
				return err
			}
			updated, err = s.correctInPlace(ctx, tenantID, primary, rows, in, actor, history)
			return s.explainHistory(ctx, tenantID, err, history, rows, actor)
		}
		updated, err = s.changeFrom(ctx, tenantID, primary, rows, in, actor, history, *in.EffectiveFrom)
		return err
	})
	return updated, err
}

// correctInPlace rewrites primary as in and removes the block's other rows,
// keeping primary's dates (moved onto the new weekday when that changes,
// never beyond them). A block with history only takes a change that
// leaves the lesson itself as it was (its notes): everything else would
// rewrite what was recorded.
func (s *Service) correctInPlace(
	ctx context.Context, tenantID uuid.UUID, primary domain.Schedule, rows []domain.Schedule, in ScheduleInput, actor Actor,
	history historyIndex,
) (domain.Schedule, error) {
	candidate, err := s.resolveCandidate(ctx, tenantID, in)
	if err != nil {
		return domain.Schedule{}, err
	}
	ids := make([]uuid.UUID, len(rows))
	for i, row := range rows {
		ids[i] = row.ID
	}
	if history.hasAny(ids) && (len(rows) != 1 || !sameLesson(primary, candidate)) {
		return domain.Schedule{}, domain.ErrScheduleHasHistory
	}
	for _, row := range rows {
		if row.ID == primary.ID {
			continue
		}
		if err := s.repo.DeleteSchedule(ctx, tenantID, row.ID); err != nil {
			return domain.Schedule{}, mapConstraintError(err)
		}
	}
	candidate.ID = primary.ID
	candidate.EffectiveFrom, candidate.EffectiveUntil = primary.EffectiveFrom, primary.EffectiveUntil
	if candidate.DayOfWeek != primary.DayOfWeek {
		year, err := s.academicYear(ctx, tenantID, primary.AcademicYearID)
		if err != nil {
			return domain.Schedule{}, err
		}
		var ok bool
		candidate.EffectiveFrom, candidate.EffectiveUntil, ok = domain.ResnapForWeekday(
			primary.EffectiveFrom, primary.EffectiveUntil, primary.DayOfWeek, candidate.DayOfWeek, year.StartsOn)
		if !ok {
			return domain.Schedule{}, domain.ErrScheduleEnded
		}
	}

	if !actor.CanManage {
		if err := s.enforceTeacherWindow(ctx, tenantID, candidate, s.now(ctx)); err != nil {
			return domain.Schedule{}, err
		}
	}
	if err := s.checkConflict(ctx, tenantID, candidate, primary.ID); err != nil {
		return domain.Schedule{}, err
	}
	updated, err := s.repo.UpdateSchedule(ctx, candidate)
	if err != nil {
		return domain.Schedule{}, mapConstraintError(err)
	}
	return updated, nil
}

// changeFrom applies in to the block from date d onward: it ends the
// block's rows before d and inserts the new version from d.
func (s *Service) changeFrom(
	ctx context.Context, tenantID uuid.UUID, primary domain.Schedule, rows []domain.Schedule, in ScheduleInput, actor Actor,
	history historyIndex, d time.Time,
) (domain.Schedule, error) {
	year, err := s.academicYear(ctx, tenantID, primary.AcademicYearID)
	if err != nil {
		return domain.Schedule{}, err
	}
	if err := requireInYear(year, d); err != nil {
		return domain.Schedule{}, err
	}
	candidate, err := s.resolveCandidate(ctx, tenantID, in)
	if err != nil {
		return domain.Schedule{}, err
	}
	if len(rows) == 1 && sameLesson(primary, candidate) {
		// Only the notes or the source differ: nothing about when or what
		// is taught moves, so the version keeps its dates and its id.
		candidate.ID = primary.ID
		candidate.EffectiveFrom, candidate.EffectiveUntil = primary.EffectiveFrom, primary.EffectiveUntil
		updated, err := s.repo.UpdateSchedule(ctx, candidate)
		if err != nil {
			return domain.Schedule{}, mapConstraintError(err)
		}
		return updated, nil
	}

	if err := s.retireFrom(ctx, tenantID, rows, history, d, actor); err != nil {
		return domain.Schedule{}, err
	}

	// The new version keeps the block's planned end, if it had one: a
	// lesson already removed from a later date stays removed (on the new
	// weekday, its last date on or before that end).
	from, until, ok := domain.SnapRange(candidate.DayOfWeek, d, primary.EffectiveUntil)
	if !ok {
		return domain.Schedule{}, domain.ErrScheduleEnded
	}
	if from.After(domain.CalendarDate(year.EndsOn)) {
		return domain.Schedule{}, domain.ErrEffectiveFromOutOfYear
	}
	candidate.EffectiveFrom, candidate.EffectiveUntil = from, until
	candidate.CreatedBy = uuid.NullUUID{UUID: actor.UserID, Valid: actor.UserID != uuid.Nil}
	candidate.UpdatedBy = candidate.CreatedBy

	if err := s.checkConflict(ctx, tenantID, candidate, uuid.Nil); err != nil {
		return domain.Schedule{}, err
	}
	created, err := s.repo.CreateSchedule(ctx, candidate)
	if err != nil {
		return domain.Schedule{}, mapConstraintError(err)
	}
	return created, nil
}

// retireFrom takes rows off the timetable from d on: each one ends on its
// last lesson before d, or goes when it has none (domain.PlanChange). d
// must not lie before the rows' earliest change date (changeDates), which
// keeps every row with history from going. Rows are already locked.
func (s *Service) retireFrom(ctx context.Context, tenantID uuid.UUID, rows []domain.Schedule, history historyIndex, d time.Time, actor Actor) error {
	window, err := s.changeDates(ctx, tenantID).window(ctx, history, rows)
	if err != nil {
		return err
	}
	earliest := window.Min
	if domain.CalendarDate(d).Before(earliest) {
		return &domain.ChangeTooEarlyError{Min: earliest, HeldBy: window.HeldBy}
	}
	updatedBy := uuid.NullUUID{UUID: actor.UserID, Valid: actor.UserID != uuid.Nil}
	for _, row := range rows {
		plan, err := domain.PlanChange(row, d)
		if err != nil {
			return err
		}
		switch plan.Kind {
		case domain.ChangeRetire:
			_, err = s.repo.RetireSchedule(ctx, tenantID, row.ID, plan.Until, updatedBy)
		case domain.ChangeDrop:
			err = s.repo.DeleteSchedule(ctx, tenantID, row.ID)
		}
		if err = mapConstraintError(err); errors.Is(err, domain.ErrScheduleHasHistory) {
			// History the index did not hold (the database's foreign keys
			// know of it): the row must keep its first lesson, so name the
			// date that would.
			return &domain.ChangeTooEarlyError{Min: domain.EarliestChange(earliest, row, &domain.History{})}
		}
		if err != nil {
			return err
		}
	}
	return nil
}

// sameLesson reports whether candidate changes nothing the history guard
// protects: same class, subject, teacher, room, term, weekday and periods.
func sameLesson(existing, candidate domain.Schedule) bool {
	return existing.TermID == candidate.TermID && existing.ClassID == candidate.ClassID &&
		existing.SubjectID == candidate.SubjectID && existing.TeacherUserID == candidate.TeacherUserID &&
		existing.RoomID == candidate.RoomID && existing.DayOfWeek == candidate.DayOfWeek &&
		existing.StartPeriodID == candidate.StartPeriodID && existing.EndPeriodID == candidate.EndPeriodID &&
		existing.StartSeq == candidate.StartSeq && existing.EndSeq == candidate.EndSeq
}

// DeleteScheduleBlock removes a displayed contiguous block. Without
// effectiveFrom every row is deleted outright, which a row with history
// refuses (HistoryRequiresDateError), as does a block that has already
// ended (ErrScheduleEnded): deleting it would empty the past weeks it
// covered. With effectiveFrom (manage_schedules only) the block leaves the
// timetable from that date on: each row ends on its last lesson before the
// date, or goes when it has none; rows with history are never deleted.
//
// Deletion does not check IsYearArchived, unlike CreateSchedule and
// UpdateSchedule (both go through resolveCandidate, which does). This is
// deliberate, not an oversight: an archived year's schedules are history
// the tenant may still need to clean up (e.g. a bad bulk import caught
// after archiving), and academic/service's own delete methods (DeleteClass,
// DeleteGradeLevel, ...) follow the same rule -- the archived-year guard
// exists to stop new edits landing in a closed year, not to freeze
// deletion of what is already there.
func (s *Service) DeleteScheduleBlock(ctx context.Context, tenantID, primaryID uuid.UUID, ids []uuid.UUID, effectiveFrom *time.Time, actor Actor) error {
	if effectiveFrom != nil && !actor.CanManage {
		return domain.ErrEffectiveDateAdminOnly
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		primary, rows, err := s.lockScheduleBlock(ctx, tenantID, primaryID, ids)
		if err != nil {
			return err
		}
		if err := s.authorizeRows(ctx, tenantID, rows, actor); err != nil {
			return err
		}
		history, err := s.loadHistory(ctx, tenantID, ids)
		if err != nil {
			return err
		}
		if effectiveFrom == nil {
			if err := requireCurrent(rows, s.today(ctx)); err != nil {
				return err
			}
			if history.hasAny(ids) {
				return s.explainHistory(ctx, tenantID, domain.ErrScheduleHasHistory, history, rows, actor)
			}
			for _, row := range rows {
				if err := s.repo.DeleteSchedule(ctx, tenantID, row.ID); err != nil {
					return s.explainHistory(ctx, tenantID, mapConstraintError(err), history, rows, actor)
				}
			}
			return nil
		}
		year, err := s.academicYear(ctx, tenantID, primary.AcademicYearID)
		if err != nil {
			return err
		}
		if err := requireInYear(year, *effectiveFrom); err != nil {
			return err
		}
		return s.retireFrom(ctx, tenantID, rows, history, *effectiveFrom, actor)
	})
}

// ClearAcademicYear empties one academic year's timetable (admin bulk
// clear), typically before a bulk import. Without effectiveFrom every row
// is deleted, which a timetable with history or with a version that has
// already ended refuses (it has past weeks to keep); with it the timetable
// is cleared from that date on, every earlier week staying as it was (rows
// that already ended before it are left alone). Like DeleteScheduleBlock,
// it does not check IsYearArchived.
func (s *Service) ClearAcademicYear(ctx context.Context, tenantID, academicYearID uuid.UUID, effectiveFrom *time.Time, actor Actor) error {
	if effectiveFrom != nil && !actor.CanManage {
		return domain.ErrEffectiveDateAdminOnly
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		rows, err := s.repo.ListSchedulesByAcademicYear(ctx, tenantID, academicYearID)
		if err != nil {
			return err
		}
		ids := make([]uuid.UUID, len(rows))
		for i, row := range rows {
			ids[i] = row.ID
		}
		history, err := s.loadHistory(ctx, tenantID, ids)
		if err != nil {
			return err
		}
		if effectiveFrom == nil {
			// Only the rows still on the timetable bound a dated clear:
			// one that already ended is left alone by it.
			today := s.today(ctx)
			current := make([]domain.Schedule, 0, len(rows))
			for _, row := range rows {
				if !row.EndedBefore(today) {
					current = append(current, row)
				}
			}
			if len(current) < len(rows) || history.hasAny(ids) {
				return s.explainHistory(ctx, tenantID, domain.ErrScheduleHasHistory, history, current, actor)
			}
			err := mapConstraintError(s.repo.DeleteSchedulesByAcademicYear(ctx, tenantID, academicYearID))
			return s.explainHistory(ctx, tenantID, err, history, current, actor)
		}
		year, err := s.academicYear(ctx, tenantID, academicYearID)
		if err != nil {
			return err
		}
		if err := requireInYear(year, *effectiveFrom); err != nil {
			return err
		}
		active := make([]domain.Schedule, 0, len(rows))
		for _, row := range rows {
			if !row.EndedBefore(*effectiveFrom) {
				active = append(active, row)
			}
		}
		return s.retireFrom(ctx, tenantID, active, history, *effectiveFrom, actor)
	})
}

// BulkImport creates every schedule in inputs inside one transaction,
// stopping at the first conflict or validation error so a partially valid
// spreadsheet never leaves half its rows applied. Each row starts on its
// EffectiveFrom (snapped onto its weekday), or as CreateSchedule starts a
// lesson without one: from the school's today, or the year's start when
// that is later.
func (s *Service) BulkImport(ctx context.Context, tenantID uuid.UUID, inputs []ScheduleInput) ([]domain.Schedule, error) {
	var created []domain.Schedule
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		years := map[uuid.UUID]AcademicYearRef{}
		for _, in := range inputs {
			candidate, err := s.resolveCandidate(ctx, tenantID, in)
			if err != nil {
				return err
			}
			year, ok := years[in.AcademicYearID]
			if !ok {
				if year, err = s.academicYear(ctx, tenantID, in.AcademicYearID); err != nil {
					return err
				}
				years[in.AcademicYearID] = year
			}
			if candidate.EffectiveFrom, err = s.startDate(ctx, tenantID, year, candidate, in.EffectiveFrom); err != nil {
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

// GetSchedule returns one schedule version, whatever its dates.
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

func applyActor(in ScheduleInput, actor Actor) ScheduleInput {
	if !actor.CanManage {
		in.Source = domain.SourceTeacher
		in.TeacherUserID = actor.UserID
	} else if in.Source == "" {
		in.Source = domain.SourceAdmin
	}
	return in
}

// authorizeRows lets a teacher without manage_schedules touch only their
// own rows, each inside the self-service edit window.
func (s *Service) authorizeRows(ctx context.Context, tenantID uuid.UUID, rows []domain.Schedule, actor Actor) error {
	if actor.CanManage {
		return nil
	}
	now := s.now(ctx)
	for _, row := range rows {
		if row.TeacherUserID != actor.UserID {
			return domain.ErrTeacherEditForbidden
		}
		if err := s.enforceTeacherWindow(ctx, tenantID, row, now); err != nil {
			return err
		}
	}
	return nil
}

// resolveCandidate validates in against academic reference data (periods,
// school days, teaching assignment) and builds the domain.Schedule ready
// for conflict checking and persistence.
// business-rule guard clauses gate one write or one aggregated read;
// the branches are sequential guards, not nested decision logic, and
// the module's existing test suite already covers them. Left as-is
// here to avoid behaviour risk in a lint-only change.
//
//nolint:gocyclo // service method: several independent precondition/authorization/
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

// mapConstraintError translates the schedules table's database guards into
// the domain errors the service's own checks return first: the exclusion
// constraints ex_schedules_class_slot / ex_schedules_teacher_slot
// (migration 0147) into the conflict errors checkConflict would have
// raised, closing the race the domain-level check alone cannot (two
// concurrent requests can both pass it and only the database enforces the
// second one atomically), and the history guards of migrations 0107, 0144
// and 0147 into the history errors.
const (
	pgExclusionViolation  = "23P01"
	pgForeignKeyViolation = "23503"
	pgCheckViolation      = "23514"
)

func mapConstraintError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch {
		case pgErr.Code == pgForeignKeyViolation &&
			(pgErr.ConstraintName == "attendance_sessions_schedule_id_fkey" ||
				pgErr.ConstraintName == "substitution_requests_schedule_id_fkey" ||
				pgErr.ConstraintName == "schedule_history_guard"):
			return domain.ErrScheduleHasHistory
		case pgErr.Code == pgForeignKeyViolation && pgErr.ConstraintName == "schedule_history_range":
			return domain.ErrScheduleChangeBeforeHistory
		case pgErr.Code == pgCheckViolation && pgErr.ConstraintName == "schedule_in_effect":
			return domain.ErrScheduleEnded
		case pgErr.Code == pgExclusionViolation && pgErr.ConstraintName == "ex_schedules_teacher_slot":
			return domain.ErrConflictTeacher
		case pgErr.Code == pgExclusionViolation:
			return domain.ErrConflictClass
		}
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrScheduleNotFound
	}
	return err
}

// now is the single injection point for the clock; tests may override it.
func (s *Service) now(ctx context.Context) time.Time {
	return clock.Now(ctx, s.clock).In(tenant.LocationFromContext(ctx))
}

// today is the school's calendar date (midnight UTC, the form a date
// column stores) in the tenant's time zone, through the same clock as now,
// so the time simulation moves it too.
func (s *Service) today(ctx context.Context) time.Time {
	return clock.LocalDate(clock.Now(ctx, s.clock), tenant.LocationFromContext(ctx))
}
