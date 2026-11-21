package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// GetWeeklySchedule returns the version of each of employeeUserID's
// weekdays in effect today, weekday ascending: the week the editor shows.
func (s *Service) GetWeeklySchedule(ctx context.Context, tenantID, employeeUserID uuid.UUID) ([]domain.ScheduleDay, error) {
	today := s.today(ctx, staffLocation(ctx))
	var out []domain.ScheduleDay
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.assertEnabled(ctx, tenantID); err != nil {
			return err
		}
		history, err := s.repo.ListScheduleHistory(ctx, tenantID, employeeUserID)
		if err != nil {
			return err
		}
		out = history.Week(today)
		return nil
	})
	return out, err
}

// ReplaceWeeklySchedule saves the week the caller submits (the schedule
// editor always sends all seven days) as of today, the school-local date
// of the save: a weekday whose hours differ from the version in effect
// today gets a new version from today, an unchanged one keeps its version.
// Nothing is rewritten, so every earlier day is still judged by the
// version in effect on it: turning a working weekday off keeps its past
// absences, turning a day off on keeps its past days off. A second save on
// the same date supersedes the first for that date. It returns the
// submitted days as now in effect, in the order submitted.
//
// Records stored as StatusUnscheduled (a check-in made before the employee
// had any schedule) are judged again against the saved week in the same
// transaction, so the board, the employee's own check-in screen and the
// departure scan all agree from the moment the schedule exists instead of
// the stored "unscheduled" lingering until the next write flips it.
func (s *Service) ReplaceWeeklySchedule(
	ctx context.Context, tenantID, employeeUserID, actorID uuid.UUID, days []ScheduleDayInput,
) ([]domain.ScheduleDay, error) {
	out := make([]domain.ScheduleDay, 0, len(days))
	effectiveFrom := clock.LocalDate(clock.Now(ctx, s.clock), staffLocation(ctx))
	rejudged := false
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.assertEnabled(ctx, tenantID); err != nil {
			return err
		}
		eligible, err := s.repo.IsCandidateEmployee(ctx, tenantID, employeeUserID)
		if err != nil {
			return err
		}
		if !eligible {
			return domain.ErrEmployeeNotEligible
		}
		history, err := s.repo.ListScheduleHistory(ctx, tenantID, employeeUserID)
		if err != nil {
			return err
		}
		for _, in := range days {
			day := domain.ScheduleDay{
				EmployeeUserID: employeeUserID, Weekday: in.Weekday, IsWorkingDay: in.IsWorkingDay,
				StartMinute: in.StartMinute, EndMinute: in.EndMinute, GraceMinutes: in.GraceMinutes,
				EffectiveFrom: effectiveFrom,
			}
			if !day.Valid() {
				return domain.ErrScheduleDayInvalid
			}
			if current := history.InEffect(day.Weekday, effectiveFrom); current != nil && current.SameHours(day) {
				out = append(out, *current)
				continue
			}
			saved, err := s.repo.InsertScheduleVersion(ctx, tenantID, employeeUserID, actorID, day)
			if err != nil {
				return err
			}
			history = append(history, saved)
			out = append(out, saved)
		}
		rejudged, err = s.rejudgeUnscheduledRecords(ctx, tenantID, employeeUserID, actorID)
		return err
	})
	if err != nil {
		return nil, err
	}
	if rejudged {
		s.publishRecordsChanged(tenantID, employeeUserID)
	}
	return out, nil
}

// rejudgeUnscheduledRecords recomputes every record of employeeUserID
// still stored as StatusUnscheduled against the schedule now on file,
// keeping its timestamps, source and notes, and reports whether any
// record changed. The caller runs inside an open transaction.
func (s *Service) rejudgeUnscheduledRecords(ctx context.Context, tenantID, employeeUserID, actorID uuid.UUID) (bool, error) {
	records, err := s.repo.ListUnscheduledRecords(ctx, tenantID, employeeUserID)
	if err != nil {
		return false, err
	}
	changed := false
	for _, rec := range records {
		result, _, err := s.computeStatus(ctx, tenantID, employeeUserID, rec.Date, rec.ArrivalAt, rec.DepartureAt)
		if err != nil {
			return false, err
		}
		if result.StatusCode == rec.StatusCode {
			continue
		}
		rec.StatusCode, rec.LateMinutes, rec.EarlyLeaveMinutes = result.StatusCode, result.LateMinutes, result.EarlyLeaveMinutes
		rec.UpdatedBy = uuid.NullUUID{UUID: actorID, Valid: actorID != uuid.Nil}
		if _, err := s.repo.ReplaceRecordFields(ctx, tenantID, rec); err != nil {
			return false, err
		}
		changed = true
	}
	return changed, nil
}

// ListRoster returns every employee this module currently tracks (has at
// least one schedule day configured).
func (s *Service) ListRoster(ctx context.Context, tenantID uuid.UUID) ([]EmployeeRef, error) {
	var out []EmployeeRef
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.assertEnabled(ctx, tenantID); err != nil {
			return err
		}
		var err error
		out, err = s.repo.ListRosterEmployees(ctx, tenantID)
		return err
	})
	return out, err
}

// ListCandidates returns every active teacher and staff member, flagged
// with whether they already have a work schedule, for the module's
// employee pickers. ListRoster cannot serve them: nobody is on it until a
// schedule exists, so a fresh tenant could never give anyone a first one.
func (s *Service) ListCandidates(ctx context.Context, tenantID uuid.UUID) ([]CandidateRef, error) {
	var out []CandidateRef
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.assertEnabled(ctx, tenantID); err != nil {
			return err
		}
		var err error
		out, err = s.repo.ListCandidateEmployees(ctx, tenantID)
		return err
	})
	return out, err
}
