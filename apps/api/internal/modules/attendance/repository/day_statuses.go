package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// pgDates converts dates to the date[] parameter the batch queries take.
func pgDates(dates []time.Time) []pgtype.Date {
	out := make([]pgtype.Date, len(dates))
	for i, d := range dates {
		out[i] = pdatabase.Date(d)
	}
	return out
}

func (r *Repository) ListDailySummaryForStudentsDates(ctx context.Context, tenantID, academicYearID uuid.UUID, studentIDs []uuid.UUID, dates []time.Time) ([]service.StudentDateStatus, error) {
	rows, err := r.queries(ctx).ListAttendanceDailySummaryForStudentsDates(ctx, db.ListAttendanceDailySummaryForStudentsDatesParams{
		TenantID: tenantID, AcademicYearID: academicYearID, StudentIds: studentIDs, Dates: pgDates(dates),
	})
	if err != nil {
		return nil, err
	}
	out := make([]service.StudentDateStatus, len(rows))
	for i, row := range rows {
		out[i] = service.StudentDateStatus{StudentUserID: row.StudentUserID, Date: pdatabase.DateOrZero(row.Date), StatusCode: row.StatusCode}
	}
	return out, nil
}

func (r *Repository) ListEntryStatusesForStudentsDates(ctx context.Context, tenantID uuid.UUID, studentIDs []uuid.UUID, dates []time.Time) ([]service.StudentDateEntries, error) {
	rows, err := r.queries(ctx).ListEntryStatusesForStudentsDates(ctx, db.ListEntryStatusesForStudentsDatesParams{
		TenantID: tenantID, StudentIds: studentIDs, Dates: pgDates(dates),
	})
	if err != nil {
		return nil, err
	}
	out := make([]service.StudentDateEntries, len(rows))
	for i, row := range rows {
		out[i] = service.StudentDateEntries{StudentUserID: row.StudentUserID, Date: pdatabase.DateOrZero(row.Date), StatusCodes: row.StatusCodes}
	}
	return out, nil
}

func (r *Repository) CountSubmittedSessionsByClassesDates(ctx context.Context, tenantID uuid.UUID, classIDs []uuid.UUID, dates []time.Time) ([]service.ClassDateSubmitted, error) {
	rows, err := r.queries(ctx).CountSubmittedSessionsByClassesDates(ctx, db.CountSubmittedSessionsByClassesDatesParams{
		TenantID: tenantID, ClassIds: classIDs, Dates: pgDates(dates),
	})
	if err != nil {
		return nil, err
	}
	out := make([]service.ClassDateSubmitted, len(rows))
	for i, row := range rows {
		out[i] = service.ClassDateSubmitted{ClassID: row.ClassID, Date: pdatabase.DateOrZero(row.Date), Submitted: int(row.Submitted)}
	}
	return out, nil
}

func (r *Repository) ListEnrolledClasses(ctx context.Context, tenantID, academicYearID uuid.UUID, studentIDs []uuid.UUID) (map[uuid.UUID]uuid.UUID, error) {
	rows, err := r.queries(ctx).ListEnrolledClassesForAttendance(ctx, db.ListEnrolledClassesForAttendanceParams{
		TenantID: tenantID, AcademicYearID: academicYearID, StudentIds: studentIDs,
	})
	if err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID]uuid.UUID, len(rows))
	for _, row := range rows {
		out[row.StudentUserID] = row.ClassID
	}
	return out, nil
}

func (r *Repository) ListSchoolDayWeekdays(ctx context.Context, tenantID, academicYearID uuid.UUID) ([]int16, error) {
	return r.queries(ctx).ListActiveSchoolDaysForAttendance(ctx, db.ListActiveSchoolDaysForAttendanceParams{
		TenantID: tenantID, AcademicYearID: academicYearID,
	})
}
