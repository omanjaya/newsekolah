package main

import (
	"context"
	"time"

	"github.com/google/uuid"

	academicdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	academicservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
	attendancedomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
	schoolservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/school/service"
)

// Cross-module adapters live here, in the wiring layer, so no module imports
// another module's concrete service (docs/03-layered-architecture.md).

// permitsScheduleLookup answers "is this teacher teaching this class now or
// within the next N slots today" for the exit-permit class_teacher stage.
type permitsScheduleLookup struct {
	schedules scheduling.ScheduleReader
	periods   *academicservice.Service
	years     *schoolservice.Service
}

func (l permitsScheduleLookup) IsTeacherAssignedNowOrNext(ctx context.Context, tenantID, teacherUserID, classID uuid.UUID, date time.Time, lookaheadSlots int) (bool, error) {
	yearID, ok, err := l.years.GetActiveAcademicYearID(ctx, tenantID)
	if err != nil || !ok {
		return false, err
	}
	dayOfWeek := attendancedomain.IsoWeekday(date)
	refs, err := l.schedules.ListSchedulesForTeacherDay(ctx, tenantID, yearID, teacherUserID, dayOfWeek)
	if err != nil {
		return false, err
	}
	now := academicdomain.ClockTime{Hour: date.Hour(), Minute: date.Minute()}
	current, hasCurrent, err := l.periods.PeriodsToday(ctx, tenantID, yearID, dayOfWeek, now)
	if err != nil {
		return false, err
	}
	// Without a running period (before school, breaks) any of today's
	// schedules for the class qualifies; otherwise the schedule must end at
	// or after the current period and start within the lookahead window.
	for _, ref := range refs {
		if ref.ClassID != classID {
			continue
		}
		if !hasCurrent {
			return true, nil
		}
		periods, err := l.periods.ListPeriods(ctx, tenantID, current.TemplateID)
		if err != nil {
			return false, err
		}
		startSeq, endSeq := sequenceOf(periods, ref.StartPeriodID), sequenceOf(periods, ref.EndPeriodID)
		if endSeq >= int(current.Sequence) && startSeq <= int(current.Sequence)+lookaheadSlots {
			return true, nil
		}
	}
	return false, nil
}

func sequenceOf(periods []academicdomain.Period, id uuid.UUID) int {
	for _, p := range periods {
		if p.ID == id {
			return int(p.Sequence)
		}
	}
	return -1
}

// attendanceSyncAdapter lets permits push forced statuses into attendance.
type attendanceSyncAdapter struct {
	force func(ctx context.Context, tenantID, studentUserID uuid.UUID, from, to time.Time, statusCode, source, reason string) error
}

func (a attendanceSyncAdapter) ForceStatus(ctx context.Context, tenantID, studentUserID uuid.UUID, from, to time.Time, statusCode, reason string) error {
	source := string(attendancedomain.SourcePermit)
	if len(reason) >= len("leave letter") && reason[:len("leave letter")] == "leave letter" {
		source = string(attendancedomain.SourceLeave)
	}
	return a.force(ctx, tenantID, studentUserID, from, to, statusCode, source, reason)
}

// permitsBlocker and permitsOverrider expose permits decisions to attendance.
type permitsBlocker struct{ svc *permitsservice.Service }

func (b permitsBlocker) IsBlocked(ctx context.Context, tenantID, studentUserID uuid.UUID, date time.Time) (bool, string, error) {
	blocked, err := b.svc.HasBlockingLateArrival(ctx, tenantID, studentUserID, date)
	if err != nil || !blocked {
		return false, "", err
	}
	return true, "late_arrival_in_progress", nil
}

type permitsOverrider struct{ svc *permitsservice.Service }

func (o permitsOverrider) Override(ctx context.Context, tenantID, studentUserID uuid.UUID, date time.Time) (string, attendancedomain.EntrySource, bool, error) {
	status, ok, err := o.svc.LeaveOverride(ctx, tenantID, studentUserID, date)
	if err != nil || !ok {
		return "", "", false, err
	}
	return status, attendancedomain.SourceLeave, true, nil
}
