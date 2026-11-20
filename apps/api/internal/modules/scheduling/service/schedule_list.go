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
		out.Blocks, err = s.applyPolicies(ctx, tenantID, domain.MergeContiguous(schedules), actor)
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

// applyPolicies marks every block holding a schedule with history, in one
// query for the grid, and gives a manage_schedules caller each block's
// mutation policy (what the editor offers and whether a change needs a
// date). Other callers get no policy: they only read the grid.
func (s *Service) applyPolicies(ctx context.Context, tenantID uuid.UUID, blocks []domain.Block, actor Actor) ([]ListedBlock, error) {
	var ids []uuid.UUID
	for _, b := range blocks {
		ids = append(ids, b.ScheduleIDs...)
	}
	history, err := s.loadHistory(ctx, tenantID, ids)
	if err != nil {
		return nil, err
	}
	today := s.today(ctx)
	out := make([]ListedBlock, len(blocks))
	for i, b := range blocks {
		b.HasHistory = history.hasAny(b.ScheduleIDs)
		out[i] = ListedBlock{Block: b}
		if actor.CanManage {
			policy := managerPolicy(b.EffectiveUntil, b.HasHistory, history.earliestChange(today, b.ScheduleIDs), today)
			out[i].Policy = &policy
		}
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
	// session (submitted, or holding an entry or a journal) or a
	// substitution request: it can no longer be corrected in place.
	HasHistory bool
	// RequiresEffectiveFrom is true when an edit or delete must say from
	// which date it takes effect (a manage_schedules caller on a schedule
	// with history); MinEffectiveFrom is the earliest such date.
	RequiresEffectiveFrom bool
	MinEffectiveFrom      *time.Time
	Reason                string
}

// managerPolicy is what a manage_schedules caller may do with a version (or
// block) ending on until: nothing once it has ended (or every date it has
// left is bound by history), a dated change from earliest on when it has
// history, anything otherwise.
func managerPolicy(until *time.Time, hasHistory bool, earliest, today time.Time) MutationPolicy {
	ended := MutationPolicy{HasHistory: hasHistory, Reason: domain.ErrScheduleEnded.Error()}
	if until != nil && domain.CalendarDate(*until).Before(domain.CalendarDate(today)) {
		return ended
	}
	if !hasHistory {
		return MutationPolicy{CanEdit: true, CanDelete: true}
	}
	if until != nil && earliest.After(domain.CalendarDate(*until)) {
		return ended
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
	var history historyIndex
	if err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		history, err = s.loadHistory(ctx, tenantID, []uuid.UUID{sched.ID})
		return err
	}); err != nil {
		return MutationPolicy{Reason: err.Error()}
	}
	today := s.today(ctx)
	hasHistory := history.hasAny([]uuid.UUID{sched.ID})
	if actor.CanManage {
		return managerPolicy(sched.EffectiveUntil, hasHistory, history.earliestChange(today, []uuid.UUID{sched.ID}), today)
	}
	switch {
	case sched.EndedBefore(today):
		return MutationPolicy{HasHistory: hasHistory, Reason: domain.ErrScheduleEnded.Error()}
	case hasHistory:
		return MutationPolicy{HasHistory: true, Reason: domain.ErrScheduleHasHistory.Error()}
	case sched.TeacherUserID != actor.UserID:
		return MutationPolicy{Reason: domain.ErrTeacherEditForbidden.Error()}
	}
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.enforceTeacherWindow(ctx, tenantID, sched, s.now(ctx))
	})
	if err != nil {
		return MutationPolicy{Reason: err.Error()}
	}
	return MutationPolicy{CanEdit: true, CanDelete: true}
}
