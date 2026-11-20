package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
)

// ScheduleRef is the minimal shape of a schedule the attendance module
// needs: enough to open a session and compute expected-session counts,
// without attendance importing scheduling/domain's fuller Schedule type.
// It is defined here (rather than in the root scheduling package, whose
// exported scheduling.ScheduleRef is a type alias to this) because
// ScheduleReaderAdapter below needs package-private access to Service's
// repo and withTx; the root package importing this one, instead of the
// reverse, is what keeps internal/modules/scheduling free of an import
// cycle back through here.
type ScheduleRef struct {
	ID             uuid.UUID
	AcademicYearID uuid.UUID
	ClassID        uuid.UUID
	SubjectID      uuid.UUID
	TeacherUserID  uuid.UUID
	StartPeriodID  uuid.UUID
	EndPeriodID    uuid.UUID
	DayOfWeek      int16
	// EffectiveFrom and EffectiveUntil bound the version (both inclusive;
	// nil until is open-ended): attendance only opens a session, and
	// supervision only plans a visit, on a date the version is in effect.
	EffectiveFrom  time.Time
	EffectiveUntil *time.Time
}

// EffectiveOn reports whether this version is on the timetable on date.
func (r ScheduleRef) EffectiveOn(date time.Time) bool {
	return domain.DateRangeContains(r.EffectiveFrom, r.EffectiveUntil, date)
}

// ScheduleReaderAdapter implements scheduling.ScheduleReader over a
// *Service. It is a separate type (rather than methods on Service itself)
// because Service already has its own GetSchedule returning the fuller
// domain.Schedule for scheduling's own transport layer; the interface
// attendance consumes needs the same method name to return the narrower
// ScheduleRef instead.
type ScheduleReaderAdapter struct {
	svc *Service
}

func NewScheduleReaderAdapter(svc *Service) *ScheduleReaderAdapter {
	return &ScheduleReaderAdapter{svc: svc}
}

func (a *ScheduleReaderAdapter) GetSchedule(ctx context.Context, tenantID, scheduleID uuid.UUID) (ScheduleRef, error) {
	sched, err := a.svc.GetSchedule(ctx, tenantID, scheduleID)
	if err != nil {
		return ScheduleRef{}, err
	}
	return toRef(sched), nil
}

// ListSchedulesForTeacherOn returns a teacher's own lessons on date: the
// version of each lesson in effect that day.
func (a *ScheduleReaderAdapter) ListSchedulesForTeacherOn(ctx context.Context, tenantID, academicYearID, teacherUserID uuid.UUID, date time.Time) ([]ScheduleRef, error) {
	var out []ScheduleRef
	err := a.svc.withTx(ctx, tenantID, func(ctx context.Context) error {
		schedules, err := a.svc.repo.ListSchedulesForTeacherOn(ctx, tenantID, academicYearID, teacherUserID, date)
		if err != nil {
			return err
		}
		for _, sched := range schedules {
			out = append(out, toRef(sched))
		}
		return nil
	})
	return out, err
}

// ListAcceptedSubstitutionsForSubstituteDate returns the schedule each
// accepted substitution for substituteUserID on date covers, for
// attendance's "today's sessions" list (own schedules plus accepted
// substitutions).
// A request stays with the version it was made for, which is in effect on
// its date (migration 0147), so no date filter applies here.
func (a *ScheduleReaderAdapter) ListAcceptedSubstitutionsForSubstituteDate(ctx context.Context, tenantID, substituteUserID uuid.UUID, date time.Time) ([]ScheduleRef, error) {
	var out []ScheduleRef
	err := a.svc.withTx(ctx, tenantID, func(ctx context.Context) error {
		subs, err := a.svc.repo.ListAcceptedSubstitutionsForSubstituteDate(ctx, tenantID, substituteUserID, date)
		if err != nil {
			return err
		}
		for _, sub := range subs {
			sched, err := a.svc.repo.GetScheduleByID(ctx, tenantID, sub.ScheduleID)
			if err != nil {
				return err
			}
			out = append(out, toRef(sched))
		}
		return nil
	})
	return out, err
}

// CountSchedulesForClassOn counts a class's lessons on date: the versions
// in effect that day.
func (a *ScheduleReaderAdapter) CountSchedulesForClassOn(ctx context.Context, tenantID, academicYearID, classID uuid.UUID, date time.Time) (int64, error) {
	var out int64
	err := a.svc.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = a.svc.repo.CountSchedulesForClassOn(ctx, tenantID, academicYearID, classID, date)
		return err
	})
	return out, err
}

// HandOver is one of a teacher's own lessons on a date that an accepted
// substitution hands to SubstituteUserID.
type HandOver struct {
	ScheduleID       uuid.UUID
	SubstituteUserID uuid.UUID
}

// ListHandOversForTeacherDate lists teacherUserID's lessons on date that an
// accepted substitution hands to someone else, so attendance can mark them
// handed over instead of asking the original teacher to fill them.
func (a *ScheduleReaderAdapter) ListHandOversForTeacherDate(ctx context.Context, tenantID, teacherUserID uuid.UUID, date time.Time) ([]HandOver, error) {
	var out []HandOver
	err := a.svc.withTx(ctx, tenantID, func(ctx context.Context) error {
		subs, err := a.svc.repo.ListAcceptedSubstitutionsForRequesterDate(ctx, tenantID, teacherUserID, date)
		if err != nil {
			return err
		}
		out = make([]HandOver, len(subs))
		for i, sub := range subs {
			out[i] = HandOver{ScheduleID: sub.ScheduleID, SubstituteUserID: sub.SubstituteUserID}
		}
		return nil
	})
	return out, err
}

// ClassDateCount is how many lessons one class has on one date: the
// expected-session count attendance's daily status needs.
type ClassDateCount struct {
	ClassID uuid.UUID
	Date    time.Time
	Count   int64
}

// CountSchedulesByClassDates is CountSchedulesForClassOn for many classes
// and dates at once. Pairs with no lesson are omitted.
func (a *ScheduleReaderAdapter) CountSchedulesByClassDates(ctx context.Context, tenantID, academicYearID uuid.UUID, classIDs []uuid.UUID, dates []time.Time) ([]ClassDateCount, error) {
	var out []ClassDateCount
	err := a.svc.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = a.svc.repo.CountSchedulesByClassDates(ctx, tenantID, academicYearID, classIDs, dates)
		return err
	})
	return out, err
}

func toRef(sched domain.Schedule) ScheduleRef {
	return ScheduleRef{
		ID: sched.ID, AcademicYearID: sched.AcademicYearID, ClassID: sched.ClassID, SubjectID: sched.SubjectID,
		TeacherUserID: sched.TeacherUserID, StartPeriodID: sched.StartPeriodID, EndPeriodID: sched.EndPeriodID,
		DayOfWeek: sched.DayOfWeek, EffectiveFrom: sched.EffectiveFrom, EffectiveUntil: sched.EffectiveUntil,
	}
}
