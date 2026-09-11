package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) UpsertDailySummary(ctx context.Context, tenantID, academicYearID, studentUserID uuid.UUID, date time.Time, statusCode string, expected, submitted int, partialAbsence bool) error {
	return r.queries(ctx).UpsertAttendanceDailySummary(ctx, db.UpsertAttendanceDailySummaryParams{
		TenantID: tenantID, AcademicYearID: academicYearID, StudentUserID: studentUserID, Date: pdatabase.Date(date),
		StatusCode: statusCode, ExpectedSessions: int32(expected), SubmittedSessions: int32(submitted), //nolint:gosec // session counts are tiny
		PartialAbsence: partialAbsence,
	})
}

func (r *Repository) GetDailySummary(ctx context.Context, tenantID, academicYearID, studentUserID uuid.UUID, date time.Time) (service.DailySummaryRow, bool, error) {
	row, err := r.queries(ctx).GetAttendanceDailySummary(ctx, db.GetAttendanceDailySummaryParams{
		TenantID: tenantID, AcademicYearID: academicYearID, StudentUserID: studentUserID, Date: pdatabase.Date(date),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return service.DailySummaryRow{}, false, nil
		}
		return service.DailySummaryRow{}, false, err
	}
	return toSummaryRow(row), true, nil
}

func (r *Repository) ListDailySummaryForStudentMonth(ctx context.Context, tenantID, academicYearID, studentUserID uuid.UUID, from, to time.Time) ([]service.DailySummaryRow, error) {
	rows, err := r.queries(ctx).ListAttendanceDailySummaryForStudentMonth(ctx, db.ListAttendanceDailySummaryForStudentMonthParams{
		TenantID: tenantID, AcademicYearID: academicYearID, StudentUserID: studentUserID,
		Date: pdatabase.Date(from), Date_2: pdatabase.Date(to),
	})
	if err != nil {
		return nil, err
	}
	return toSummaryRows(rows), nil
}

func (r *Repository) ListDailySummaryForClassDate(ctx context.Context, tenantID, academicYearID, classID uuid.UUID, date time.Time) ([]service.DailySummaryRow, error) {
	rows, err := r.queries(ctx).ListAttendanceDailySummaryForClassDate(ctx, db.ListAttendanceDailySummaryForClassDateParams{
		TenantID: tenantID, AcademicYearID: academicYearID, ClassID: classID, Date: pdatabase.Date(date),
	})
	if err != nil {
		return nil, err
	}
	return toSummaryRows(rows), nil
}

func (r *Repository) CountDailySummaryStatuses(ctx context.Context, tenantID, academicYearID uuid.UUID, date time.Time) (map[string]int, error) {
	rows, err := r.queries(ctx).CountDailySummaryStatusesForAttendance(ctx, db.CountDailySummaryStatusesForAttendanceParams{
		TenantID: tenantID, AcademicYearID: academicYearID, Date: pdatabase.Date(date),
	})
	if err != nil {
		return nil, err
	}
	out := make(map[string]int, len(rows))
	for _, row := range rows {
		out[row.StatusCode] = int(row.Total)
	}
	return out, nil
}
