package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) GetRecord(ctx context.Context, tenantID, recordID uuid.UUID) (domain.Record, bool, error) {
	row, err := r.queries(ctx).GetStaffAttendanceRecord(ctx, db.GetStaffAttendanceRecordParams{TenantID: tenantID, ID: recordID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Record{}, false, nil
		}
		return domain.Record{}, false, err
	}
	return toRecord(row), true, nil
}

func (r *Repository) GetRecordByEmployeeDate(ctx context.Context, tenantID, employeeUserID uuid.UUID, date time.Time) (domain.Record, bool, error) {
	row, err := r.queries(ctx).GetStaffAttendanceRecordByEmployeeDate(ctx, db.GetStaffAttendanceRecordByEmployeeDateParams{
		TenantID: tenantID, EmployeeUserID: employeeUserID, Date: pdatabase.Date(date),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Record{}, false, nil
		}
		return domain.Record{}, false, err
	}
	return toRecord(row), true, nil
}

func (r *Repository) UpsertRecord(ctx context.Context, rec domain.Record) (domain.Record, error) {
	row, err := r.queries(ctx).UpsertStaffAttendanceRecord(ctx, db.UpsertStaffAttendanceRecordParams{
		TenantID: rec.TenantID, EmployeeUserID: rec.EmployeeUserID, Date: pdatabase.Date(rec.Date),
		ArrivalAt: timestamptzPtr(rec.ArrivalAt), DepartureAt: timestamptzPtr(rec.DepartureAt),
		StatusCode: string(rec.StatusCode), LateMinutes: int32(rec.LateMinutes), EarlyLeaveMinutes: int32(rec.EarlyLeaveMinutes), //nolint:gosec // minutes-in-a-day range
		Source: string(rec.Source), Notes: rec.Notes, CreatedBy: pdatabase.NullUUID(rec.CreatedBy),
	})
	if err != nil {
		return domain.Record{}, err
	}
	return toRecord(row), nil
}

func (r *Repository) ReplaceRecordFields(ctx context.Context, tenantID uuid.UUID, rec domain.Record) (domain.Record, error) {
	row, err := r.queries(ctx).ReplaceStaffAttendanceRecordFields(ctx, db.ReplaceStaffAttendanceRecordFieldsParams{
		TenantID: tenantID, ID: rec.ID, ArrivalAt: timestamptzPtr(rec.ArrivalAt), DepartureAt: timestamptzPtr(rec.DepartureAt),
		StatusCode: string(rec.StatusCode), LateMinutes: int32(rec.LateMinutes), EarlyLeaveMinutes: int32(rec.EarlyLeaveMinutes), //nolint:gosec // minutes-in-a-day range
		Notes: rec.Notes, UpdatedBy: pdatabase.NullUUID(rec.UpdatedBy),
	})
	if err != nil {
		return domain.Record{}, err
	}
	return toRecord(row), nil
}

func (r *Repository) ListRecordsByDate(ctx context.Context, tenantID uuid.UUID, date time.Time) ([]domain.Record, error) {
	rows, err := r.queries(ctx).ListStaffAttendanceRecordsByDate(ctx, db.ListStaffAttendanceRecordsByDateParams{
		TenantID: tenantID, Date: pdatabase.Date(date),
	})
	if err != nil {
		return nil, err
	}
	return toRecords(rows), nil
}

func (r *Repository) ListRecordsByEmployeeRange(ctx context.Context, tenantID, employeeUserID uuid.UUID, from, to time.Time) ([]domain.Record, error) {
	rows, err := r.queries(ctx).ListStaffAttendanceRecordsByEmployeeRange(ctx, db.ListStaffAttendanceRecordsByEmployeeRangeParams{
		TenantID: tenantID, EmployeeUserID: employeeUserID, Date: pdatabase.Date(from), Date_2: pdatabase.Date(to),
	})
	if err != nil {
		return nil, err
	}
	return toRecords(rows), nil
}

// timestamptzPtr is the nullable counterpart to
// platform/database.Timestamptz, which treats a zero time.Time as NULL --
// not usable here since a *time.Time already distinguishes "absent" (nil)
// from "any recorded instant", including one that could coincidentally be
// the zero value.
func timestamptzPtr(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: *t, Valid: true}
}
