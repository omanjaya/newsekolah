package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) CreateSchedule(ctx context.Context, s domain.Schedule) (domain.Schedule, error) {
	row, err := r.queries(ctx).CreateSchedule(ctx, db.CreateScheduleParams{
		TenantID: s.TenantID, AcademicYearID: s.AcademicYearID, TermID: pdatabase.NullUUID(s.TermID),
		ClassID: s.ClassID, SubjectID: s.SubjectID, TeacherUserID: s.TeacherUserID, RoomID: pdatabase.NullUUID(s.RoomID),
		DayOfWeek: s.DayOfWeek, StartPeriodID: s.StartPeriodID, EndPeriodID: s.EndPeriodID,
		StartSeq: s.StartSeq, EndSeq: s.EndSeq, Source: string(s.Source), Notes: pdatabase.Text(s.Notes),
		CreatedBy:     pdatabase.NullUUID(s.CreatedBy),
		EffectiveFrom: pdatabase.Date(s.EffectiveFrom), EffectiveUntil: nullDate(s.EffectiveUntil),
	})
	if err != nil {
		return domain.Schedule{}, err
	}
	return toSchedule(row), nil
}

func (r *Repository) UpdateSchedule(ctx context.Context, s domain.Schedule) (domain.Schedule, error) {
	row, err := r.queries(ctx).UpdateSchedule(ctx, db.UpdateScheduleParams{
		TenantID: s.TenantID, ID: s.ID, TermID: pdatabase.NullUUID(s.TermID), ClassID: s.ClassID,
		SubjectID: s.SubjectID, TeacherUserID: s.TeacherUserID, RoomID: pdatabase.NullUUID(s.RoomID),
		DayOfWeek: s.DayOfWeek, StartPeriodID: s.StartPeriodID, EndPeriodID: s.EndPeriodID,
		StartSeq: s.StartSeq, EndSeq: s.EndSeq, Source: string(s.Source), Notes: pdatabase.Text(s.Notes),
		UpdatedBy:     pdatabase.NullUUID(s.UpdatedBy),
		EffectiveFrom: pdatabase.Date(s.EffectiveFrom), EffectiveUntil: nullDate(s.EffectiveUntil),
	})
	if err != nil {
		return domain.Schedule{}, err
	}
	return toSchedule(row), nil
}

func (r *Repository) RetireSchedule(ctx context.Context, tenantID, id uuid.UUID, until time.Time, updatedBy uuid.NullUUID) (domain.Schedule, error) {
	row, err := r.queries(ctx).RetireSchedule(ctx, db.RetireScheduleParams{
		TenantID: tenantID, ID: id, EffectiveUntil: pdatabase.Date(until), UpdatedBy: pdatabase.NullUUID(updatedBy),
	})
	if err != nil {
		return domain.Schedule{}, err
	}
	return toSchedule(row), nil
}

func (r *Repository) GetScheduleByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Schedule, error) {
	row, err := r.queries(ctx).GetScheduleByID(ctx, db.GetScheduleByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.Schedule{}, fmt.Errorf("get schedule %s: %w", id, err)
	}
	return toSchedule(row), nil
}

func (r *Repository) DeleteSchedule(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).DeleteSchedule(ctx, db.DeleteScheduleParams{TenantID: tenantID, ID: id})
}

func (r *Repository) DeleteSchedulesByAcademicYear(ctx context.Context, tenantID, academicYearID uuid.UUID) error {
	return r.queries(ctx).DeleteSchedulesByAcademicYear(ctx, db.DeleteSchedulesByAcademicYearParams{
		TenantID: tenantID, AcademicYearID: academicYearID,
	})
}

func (r *Repository) ListSchedulesByAcademicYear(ctx context.Context, tenantID, academicYearID uuid.UUID) ([]domain.Schedule, error) {
	rows, err := r.queries(ctx).ListSchedulesByAcademicYear(ctx, db.ListSchedulesByAcademicYearParams{
		TenantID: tenantID, AcademicYearID: academicYearID,
	})
	if err != nil {
		return nil, err
	}
	return toSchedules(rows), nil
}

func (r *Repository) ListSchedulesByClassForWeek(ctx context.Context, tenantID, academicYearID, classID uuid.UUID, weekStart time.Time) ([]domain.Schedule, error) {
	rows, err := r.queries(ctx).ListSchedulesByClassForWeek(ctx, db.ListSchedulesByClassForWeekParams{
		TenantID: tenantID, AcademicYearID: academicYearID, ClassID: classID, WeekStart: pdatabase.Date(weekStart),
	})
	if err != nil {
		return nil, err
	}
	return toSchedules(rows), nil
}

func (r *Repository) ListSchedulesByTeacherForWeek(ctx context.Context, tenantID, academicYearID, teacherID uuid.UUID, weekStart time.Time) ([]domain.Schedule, error) {
	rows, err := r.queries(ctx).ListSchedulesByTeacherForWeek(ctx, db.ListSchedulesByTeacherForWeekParams{
		TenantID: tenantID, AcademicYearID: academicYearID, TeacherUserID: teacherID, WeekStart: pdatabase.Date(weekStart),
	})
	if err != nil {
		return nil, err
	}
	return toSchedules(rows), nil
}

func (r *Repository) ListSchedulesByDayOn(ctx context.Context, tenantID, academicYearID uuid.UUID, dayOfWeek int16, date time.Time) ([]domain.Schedule, error) {
	rows, err := r.queries(ctx).ListSchedulesByDayOn(ctx, db.ListSchedulesByDayOnParams{
		TenantID: tenantID, AcademicYearID: academicYearID, DayOfWeek: dayOfWeek, OnDate: pdatabase.Date(date),
	})
	if err != nil {
		return nil, err
	}
	return toSchedules(rows), nil
}

func (r *Repository) ListSchedulesByDay(ctx context.Context, tenantID, academicYearID uuid.UUID, dayOfWeek int16) ([]domain.Schedule, error) {
	rows, err := r.queries(ctx).ListSchedulesByDay(ctx, db.ListSchedulesByDayParams{
		TenantID: tenantID, AcademicYearID: academicYearID, DayOfWeek: dayOfWeek,
	})
	if err != nil {
		return nil, err
	}
	return toSchedules(rows), nil
}

func (r *Repository) ListSchedulesForTeacherOn(ctx context.Context, tenantID, academicYearID, teacherID uuid.UUID, date time.Time) ([]domain.Schedule, error) {
	rows, err := r.queries(ctx).ListSchedulesForTeacherOn(ctx, db.ListSchedulesForTeacherOnParams{
		TenantID: tenantID, AcademicYearID: academicYearID, TeacherUserID: teacherID, OnDate: pdatabase.Date(date),
	})
	if err != nil {
		return nil, err
	}
	return toSchedules(rows), nil
}

func (r *Repository) ListScheduleHistory(ctx context.Context, tenantID uuid.UUID, ids, releasedRequestIDs []uuid.UUID) ([]domain.History, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	rows, err := r.queries(ctx).ListScheduleHistory(ctx, db.ListScheduleHistoryParams{
		TenantID: tenantID, Ids: ids, ReleasedRequestIds: releasedRequestIDs,
	})
	if err != nil {
		return nil, err
	}
	out := make([]domain.History, len(rows))
	for i, row := range rows {
		out[i] = domain.History{ScheduleID: row.ID, Until: datePtr(row.HistoryUntil)}
		if row.HeldByKind != "" && out[i].Until != nil {
			out[i].HeldBy = &domain.Hold{
				Kind: domain.HoldKind(row.HeldByKind), ID: row.HeldByID, Date: *out[i].Until,
				Status: domain.SubstitutionStatus(row.HeldByStatus),
			}
		}
	}
	return out, nil
}

func (r *Repository) CountSchedulesForClassOn(ctx context.Context, tenantID, academicYearID, classID uuid.UUID, date time.Time) (int64, error) {
	return r.queries(ctx).CountSchedulesForClassOn(ctx, db.CountSchedulesForClassOnParams{
		TenantID: tenantID, AcademicYearID: academicYearID, ClassID: classID, OnDate: pdatabase.Date(date),
	})
}

func (r *Repository) CountSchedulesByClassDates(ctx context.Context, tenantID, academicYearID uuid.UUID, classIDs []uuid.UUID, dates []time.Time) ([]service.ClassDateCount, error) {
	if len(classIDs) == 0 || len(dates) == 0 {
		return nil, nil
	}
	pgDates := make([]pgtype.Date, len(dates))
	for i, d := range dates {
		pgDates[i] = pdatabase.Date(d)
	}
	rows, err := r.queries(ctx).CountSchedulesByClassDates(ctx, db.CountSchedulesByClassDatesParams{
		TenantID: tenantID, AcademicYearID: academicYearID, ClassIds: classIDs, Dates: pgDates,
	})
	if err != nil {
		return nil, err
	}
	out := make([]service.ClassDateCount, len(rows))
	for i, row := range rows {
		out[i] = service.ClassDateCount{ClassID: row.ClassID, Date: pdatabase.DateOrZero(row.OnDate), Count: row.Total}
	}
	return out, nil
}

func toSchedules(rows []db.Schedule) []domain.Schedule {
	out := make([]domain.Schedule, len(rows))
	for i, row := range rows {
		out[i] = toSchedule(row)
	}
	return out
}
