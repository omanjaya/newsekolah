package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
)

// GetWeeklySchedule returns employeeUserID's configured days, in whatever
// order the repository stores them (weekday ascending).
func (s *Service) GetWeeklySchedule(ctx context.Context, tenantID, employeeUserID uuid.UUID) ([]domain.ScheduleDay, error) {
	var out []domain.ScheduleDay
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.assertEnabled(ctx, tenantID); err != nil {
			return err
		}
		var err error
		out, err = s.repo.ListScheduleDays(ctx, tenantID, employeeUserID)
		return err
	})
	return out, err
}

// ReplaceWeeklySchedule upserts every day the caller submits: the schedule
// editor always sends the full week, so this is a straightforward
// per-weekday upsert rather than a diff against what is already stored.
func (s *Service) ReplaceWeeklySchedule(
	ctx context.Context, tenantID, employeeUserID, actorID uuid.UUID, days []ScheduleDayInput,
) ([]domain.ScheduleDay, error) {
	out := make([]domain.ScheduleDay, 0, len(days))
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.assertEnabled(ctx, tenantID); err != nil {
			return err
		}
		for _, in := range days {
			day := domain.ScheduleDay{
				EmployeeUserID: employeeUserID, Weekday: in.Weekday, IsWorkingDay: in.IsWorkingDay,
				StartMinute: in.StartMinute, EndMinute: in.EndMinute, GraceMinutes: in.GraceMinutes,
			}
			if !day.Valid() {
				return domain.ErrScheduleDayInvalid
			}
			saved, err := s.repo.UpsertScheduleDay(ctx, tenantID, employeeUserID, actorID, day)
			if err != nil {
				return err
			}
			out = append(out, saved)
		}
		return nil
	})
	return out, err
}

// ListRoster returns every employee this module currently tracks (has at
// least one schedule day configured), for the schedule editor's employee
// picker.
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
