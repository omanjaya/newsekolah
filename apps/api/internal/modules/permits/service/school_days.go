package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

// ClassCalendar answers which dates a class has lessons on: the weekly
// pattern plus the academic calendar's holidays, no-school days and
// semester breaks scoped to the class's grade level. A leave request
// counts only those days, as attendance does when it applies the letter.
// Implemented in internal/wiring over the academic module
// (wiring.ClassCalendar), so this package does not import it.
type ClassCalendar interface {
	TeachingDays(ctx context.Context, tenantID, academicYearID uuid.UUID, classIDs []uuid.UUID, from, to time.Time) (map[uuid.UUID][]time.Time, error)
}

// SetCalendar wires the academic calendar in after construction. Without
// one (tests, tools) a leave's school days fall back to its calendar days.
func (s *Service) SetCalendar(c ClassCalendar) {
	s.calendar = c
}

// leaveSpan is what counting one leave request's school days needs: its
// dates and the class and academic year it was submitted in.
type leaveSpan struct {
	yearID  uuid.UUID
	classID uuid.NullUUID
	leave   domain.LeaveRequest
}

// leaveSchoolDays is countSchoolDays for one request.
func (s *Service) leaveSchoolDays(ctx context.Context, tenantID uuid.UUID, inst domain.Instance, lr domain.LeaveRequest) (int, error) {
	counts, err := s.countSchoolDays(ctx, tenantID, []leaveSpan{{yearID: inst.AcademicYearID, classID: inst.ClassID, leave: lr}})
	if err != nil {
		return 0, err
	}
	return counts[0], nil
}

// countSchoolDays returns, for each span in order, how many days of its
// range its class has lessons on. The calendar is read once per academic
// year for every class over the union of the ranges. A span with no class,
// or every span when no calendar is wired, counts calendar days.
func (s *Service) countSchoolDays(ctx context.Context, tenantID uuid.UUID, spans []leaveSpan) ([]int, error) {
	counts := make([]int, len(spans))
	byYear := make(map[uuid.UUID][]int)
	for i, sp := range spans {
		counts[i] = sp.leave.Days()
		if s.calendar != nil && sp.classID.Valid {
			byYear[sp.yearID] = append(byYear[sp.yearID], i)
		}
	}
	for yearID, idx := range byYear {
		classIDs := make([]uuid.UUID, 0, len(idx))
		from, to := spans[idx[0]].leave.StartsOn, spans[idx[0]].leave.EndsOn
		for _, i := range idx {
			sp := spans[i]
			classIDs = append(classIDs, sp.classID.UUID)
			if sp.leave.StartsOn.Before(from) {
				from = sp.leave.StartsOn
			}
			if sp.leave.EndsOn.After(to) {
				to = sp.leave.EndsOn
			}
		}
		teaching, err := s.calendar.TeachingDays(ctx, tenantID, yearID, classIDs, from, to)
		if err != nil {
			return nil, err
		}
		for _, i := range idx {
			counts[i] = spans[i].leave.SchoolDays(teaching[spans[i].classID.UUID])
		}
	}
	return counts, nil
}

// withSchoolDays fills each item's SchoolDays.
func (s *Service) withSchoolDays(ctx context.Context, tenantID uuid.UUID, items []LeaveRequestItem) error {
	spans := make([]leaveSpan, len(items))
	for i, it := range items {
		spans[i] = leaveSpan{yearID: it.AcademicYearID, classID: it.ClassID, leave: it.LeaveRequest}
	}
	counts, err := s.countSchoolDays(ctx, tenantID, spans)
	if err != nil {
		return err
	}
	for i := range items {
		items[i].SchoolDays = counts[i]
	}
	return nil
}
