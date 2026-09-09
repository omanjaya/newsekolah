package service

import (
	"context"

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
	ID            uuid.UUID
	ClassID       uuid.UUID
	SubjectID     uuid.UUID
	TeacherUserID uuid.UUID
	StartPeriodID uuid.UUID
	EndPeriodID   uuid.UUID
	DayOfWeek     int16
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

func (a *ScheduleReaderAdapter) ListSchedulesForTeacherDay(ctx context.Context, tenantID, academicYearID, teacherUserID uuid.UUID, dayOfWeek int16) ([]ScheduleRef, error) {
	var out []ScheduleRef
	err := a.svc.withTx(ctx, tenantID, func(ctx context.Context) error {
		schedules, err := a.svc.repo.ListSchedulesByTeacher(ctx, tenantID, academicYearID, teacherUserID)
		if err != nil {
			return err
		}
		for _, sched := range schedules {
			if sched.DayOfWeek == dayOfWeek {
				out = append(out, toRef(sched))
			}
		}
		return nil
	})
	return out, err
}

func (a *ScheduleReaderAdapter) CountSchedulesForClassDay(ctx context.Context, tenantID, academicYearID, classID uuid.UUID, dayOfWeek int16) (int64, error) {
	var out int64
	err := a.svc.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = a.svc.repo.CountSchedulesForClassDay(ctx, tenantID, academicYearID, classID, dayOfWeek)
		return err
	})
	return out, err
}

func toRef(sched domain.Schedule) ScheduleRef {
	return ScheduleRef{
		ID: sched.ID, ClassID: sched.ClassID, SubjectID: sched.SubjectID, TeacherUserID: sched.TeacherUserID,
		StartPeriodID: sched.StartPeriodID, EndPeriodID: sched.EndPeriodID, DayOfWeek: sched.DayOfWeek,
	}
}
