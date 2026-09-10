package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) UpsertScheduleDay(
	ctx context.Context, tenantID, employeeUserID, actorID uuid.UUID, day domain.ScheduleDay,
) (domain.ScheduleDay, error) {
	row, err := r.queries(ctx).UpsertStaffAttendanceScheduleDay(ctx, db.UpsertStaffAttendanceScheduleDayParams{
		TenantID: tenantID, EmployeeUserID: employeeUserID, Weekday: day.Weekday, IsWorkingDay: day.IsWorkingDay,
		StartMinute: int16(day.StartMinute), EndMinute: int16(day.EndMinute), GraceMinutes: int16(day.GraceMinutes), //nolint:gosec // clamped by domain.ScheduleDay.Valid before this call
		CreatedBy: pdatabase.NullUUID(uuid.NullUUID{UUID: actorID, Valid: actorID != uuid.Nil}),
	})
	if err != nil {
		return domain.ScheduleDay{}, err
	}
	return toScheduleDay(row), nil
}

func (r *Repository) ListScheduleDays(ctx context.Context, tenantID, employeeUserID uuid.UUID) ([]domain.ScheduleDay, error) {
	rows, err := r.queries(ctx).ListStaffAttendanceScheduleDays(ctx, db.ListStaffAttendanceScheduleDaysParams{
		TenantID: tenantID, EmployeeUserID: employeeUserID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]domain.ScheduleDay, len(rows))
	for i, row := range rows {
		out[i] = toScheduleDay(row)
	}
	return out, nil
}

func (r *Repository) ListRosterEmployees(ctx context.Context, tenantID uuid.UUID) ([]service.EmployeeRef, error) {
	rows, err := r.queries(ctx).ListStaffAttendanceRosterEmployees(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	out := make([]service.EmployeeRef, len(rows))
	for i, row := range rows {
		out[i] = service.EmployeeRef{ID: row.ID, Name: row.Name}
	}
	return out, nil
}

func (r *Repository) GetEmployeeName(ctx context.Context, tenantID, employeeUserID uuid.UUID) (string, error) {
	return r.queries(ctx).StaffAttendanceGetEmployeeName(ctx, db.StaffAttendanceGetEmployeeNameParams{
		TenantID: tenantID, ID: employeeUserID,
	})
}
