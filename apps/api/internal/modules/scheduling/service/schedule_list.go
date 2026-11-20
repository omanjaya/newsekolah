package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
)

// BlockQuery selects the timetable to list: one class's or one teacher's
// week (DayOfWeek narrows it to one day), or with neither every class on
// DayOfWeek. AsOf is any date in the week to show; nil means today in the
// school's time zone. Either way it is clamped into the academic year.
type BlockQuery struct {
	AcademicYearID uuid.UUID
	ClassID        uuid.NullUUID
	TeacherUserID  uuid.NullUUID
	DayOfWeek      *int16
	AsOf           *time.Time
}

// ListedBlock is a displayed block plus, for a caller with
// manage_schedules, what they may do with it.
type ListedBlock struct {
	domain.Block
	Policy *MutationPolicy
}

// BlockList is the timetable of the Monday-Sunday week starting WeekStart:
// each weekday shows the versions in effect on that weekday's date, so a
// change that starts mid-week shows the old lesson before it and the new
// one from it.
type BlockList struct {
	WeekStart time.Time
	Blocks    []ListedBlock
}

// ListBlocks lists a timetable merged into contiguous blocks for display,
// per docs/analysis/backend-inventory.md section 1.8. A day filter combines
// with a class or a teacher (a student's "today" view: class + day), so the
// result is narrowed before merging.
func (s *Service) ListBlocks(ctx context.Context, tenantID uuid.UUID, q BlockQuery, actor Actor) (BlockList, error) {
	var out BlockList
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		asOf, err := s.asOfInYear(ctx, tenantID, q.AcademicYearID, q.AsOf)
		if err != nil {
			return err
		}
		out.WeekStart = domain.WeekStart(asOf)

		var schedules []domain.Schedule
		switch {
		case q.ClassID.Valid:
			schedules, err = s.repo.ListSchedulesByClassForWeek(ctx, tenantID, q.AcademicYearID, q.ClassID.UUID, out.WeekStart)
			schedules = filterByDay(schedules, q.DayOfWeek)
		case q.TeacherUserID.Valid:
			schedules, err = s.repo.ListSchedulesByTeacherForWeek(ctx, tenantID, q.AcademicYearID, q.TeacherUserID.UUID, out.WeekStart)
			schedules = filterByDay(schedules, q.DayOfWeek)
		case q.DayOfWeek != nil:
			date := domain.DateInWeek(out.WeekStart, *q.DayOfWeek)
			schedules, err = s.repo.ListSchedulesByDayOn(ctx, tenantID, q.AcademicYearID, *q.DayOfWeek, date)
		default:
			return domain.ErrInvalidScheduleBlock
		}
		if err != nil {
			return err
		}
		out.Blocks, err = s.applyPolicies(ctx, tenantID, schedules, actor)
		return err
	})
	return out, err
}

// asOfInYear is the date a timetable read shows the week of: asOf, or
// today in the school's time zone, clamped into the academic year so a
// read before the year starts shows its first week and one after it ends
// its last. An unknown year is not clamped (the read then finds nothing).
func (s *Service) asOfInYear(ctx context.Context, tenantID, academicYearID uuid.UUID, asOf *time.Time) (time.Time, error) {
	date := s.today(ctx)
	if asOf != nil {
		date = domain.CalendarDate(*asOf)
	}
	year, err := s.academicYear(ctx, tenantID, academicYearID)
	if errors.Is(err, domain.ErrScheduleNotFound) {
		return date, nil
	}
	if err != nil {
		return time.Time{}, err
	}
	return clampDate(date, year), nil
}

// clampDate moves d into [year.StartsOn, year.EndsOn].
func clampDate(d time.Time, year AcademicYearRef) time.Time {
	if start := domain.CalendarDate(year.StartsOn); d.Before(start) {
		return start
	}
	if !year.EndsOn.IsZero() {
		if end := domain.CalendarDate(year.EndsOn); d.After(end) {
			return end
		}
	}
	return d
}

// filterByDay narrows schedules to dayOfWeek, when given; nil leaves the
// list untouched. Filtering before domain.MergeContiguous (rather than
// discarding whole blocks afterwards) keeps that function's own
// same-day/contiguous grouping rules the only place blocks are built.
func filterByDay(schedules []domain.Schedule, dayOfWeek *int16) []domain.Schedule {
	if dayOfWeek == nil {
		return schedules
	}
	out := make([]domain.Schedule, 0, len(schedules))
	for _, sched := range schedules {
		if sched.DayOfWeek == *dayOfWeek {
			out = append(out, sched)
		}
	}
	return out
}

// applyPolicies merges schedules into blocks, marks every block holding a
// schedule with history (in one query for the grid), and gives a
// manage_schedules caller each block's mutation policy (what the editor
// offers and whether a change needs a date). Other callers get no policy:
// they only read the grid.
func (s *Service) applyPolicies(ctx context.Context, tenantID uuid.UUID, schedules []domain.Schedule, actor Actor) ([]ListedBlock, error) {
	byID := make(map[uuid.UUID]domain.Schedule, len(schedules))
	ids := make([]uuid.UUID, len(schedules))
	for i, sched := range schedules {
		byID[sched.ID] = sched
		ids[i] = sched.ID
	}
	history, err := s.loadHistory(ctx, tenantID, ids)
	if err != nil {
		return nil, err
	}
	blocks := domain.MergeContiguous(schedules)
	dates := s.changeDates(ctx, tenantID)
	out := make([]ListedBlock, len(blocks))
	for i, b := range blocks {
		b.HasHistory = history.hasAny(b.ScheduleIDs)
		out[i] = ListedBlock{Block: b}
		if !actor.CanManage {
			continue
		}
		rows := make([]domain.Schedule, len(b.ScheduleIDs))
		for j, id := range b.ScheduleIDs {
			rows[j] = byID[id]
		}
		earliest, err := dates.earliest(ctx, history, rows)
		if err != nil {
			return nil, err
		}
		policy := managerPolicy(b.EffectiveUntil, b.HasHistory, earliest, dates.today)
		out[i].Policy = &policy
	}
	return out, nil
}

// MutationPolicy tells a caller (for one schedule or block) whether they
// may edit or delete it right now, so the transport layer can include it
// in responses without the client re-deriving the history and
// teacher-edit-deadline rules itself.
type MutationPolicy struct {
	CanEdit   bool
	CanDelete bool
	// HasHistory is true when the schedule has a recorded attendance
	// session (submitted, or holding an entry or a journal), a
	// substitution request or a supervision visit: it can no longer be
	// corrected in place.
	HasHistory bool
	// RequiresEffectiveFrom is true when an edit or delete must say from
	// which date it takes effect (a manage_schedules caller on a schedule
	// with history); MinEffectiveFrom is the earliest such date.
	RequiresEffectiveFrom bool
	MinEffectiveFrom      *time.Time
	// Reason is why the caller may not edit or delete it, as the error the
	// attempt would meet: domain.ErrScheduleEnded (its last date has
	// passed), domain.ErrScheduleChangeBeforeHistory (it is still on the
	// timetable but every date it has left is bound by its history),
	// domain.ErrScheduleHasHistory (a teacher on a lesson with history),
	// or a teacher-edit refusal.
	Reason error
}

// managerPolicy is what a manage_schedules caller may do with a version (or
// block) ending on until: nothing once it has ended, nor while every date
// it has left is bound by history, a dated change from earliest on when it
// has history, anything otherwise.
func managerPolicy(until *time.Time, hasHistory bool, earliest, today time.Time) MutationPolicy {
	if until != nil && domain.CalendarDate(*until).Before(domain.CalendarDate(today)) {
		return MutationPolicy{HasHistory: hasHistory, Reason: domain.ErrScheduleEnded}
	}
	if !hasHistory {
		return MutationPolicy{CanEdit: true, CanDelete: true}
	}
	if until != nil && earliest.After(domain.CalendarDate(*until)) {
		return MutationPolicy{HasHistory: true, Reason: domain.ErrScheduleChangeBeforeHistory}
	}
	return MutationPolicy{
		CanEdit: true, CanDelete: true, HasHistory: true,
		RequiresEffectiveFrom: true, MinEffectiveFrom: &earliest,
	}
}

// MutationPolicyFor is the policy of one schedule version for actor. A
// teacher acting on their own lesson (no manage_schedules) cannot date a
// change, so history still locks it for them.
func (s *Service) MutationPolicyFor(ctx context.Context, tenantID uuid.UUID, sched domain.Schedule, actor Actor) MutationPolicy {
	var policy MutationPolicy
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		history, err := s.loadHistory(ctx, tenantID, []uuid.UUID{sched.ID})
		if err != nil {
			return err
		}
		if actor.CanManage {
			dates := s.changeDates(ctx, tenantID)
			earliest, err := dates.earliest(ctx, history, []domain.Schedule{sched})
			if err != nil {
				return err
			}
			policy = managerPolicy(sched.EffectiveUntil, history.hasAny([]uuid.UUID{sched.ID}), earliest, dates.today)
			return nil
		}
		policy = s.teacherPolicy(ctx, tenantID, sched, history.hasAny([]uuid.UUID{sched.ID}), actor)
		return nil
	})
	if err != nil {
		return MutationPolicy{Reason: err}
	}
	return policy
}

// teacherPolicy is what a teacher without manage_schedules may do with
// their own lesson: correct it in place while it is current, has no
// history and is outside the self-service deadline.
func (s *Service) teacherPolicy(ctx context.Context, tenantID uuid.UUID, sched domain.Schedule, hasHistory bool, actor Actor) MutationPolicy {
	switch {
	case sched.EndedBefore(s.today(ctx)):
		return MutationPolicy{HasHistory: hasHistory, Reason: domain.ErrScheduleEnded}
	case hasHistory:
		return MutationPolicy{HasHistory: true, Reason: domain.ErrScheduleHasHistory}
	case sched.TeacherUserID != actor.UserID:
		return MutationPolicy{Reason: domain.ErrTeacherEditForbidden}
	}
	if err := s.enforceTeacherWindow(ctx, tenantID, sched, s.now(ctx)); err != nil {
		return MutationPolicy{Reason: err}
	}
	return MutationPolicy{CanEdit: true, CanDelete: true}
}
