package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) CreateSchedule(ctx context.Context, s domain.Schedule) (domain.Schedule, error) {
	row, err := r.queries(ctx).CreateSchedule(ctx, db.CreateScheduleParams{
		TenantID: s.TenantID, AcademicYearID: s.AcademicYearID, TermID: pdatabase.NullUUID(s.TermID),
		ClassID: s.ClassID, SubjectID: s.SubjectID, TeacherUserID: s.TeacherUserID, RoomID: pdatabase.NullUUID(s.RoomID),
		DayOfWeek: s.DayOfWeek, StartPeriodID: s.StartPeriodID, EndPeriodID: s.EndPeriodID,
		StartSeq: s.StartSeq, EndSeq: s.EndSeq, Source: string(s.Source), Notes: pdatabase.Text(s.Notes),
		CreatedBy: pdatabase.NullUUID(s.CreatedBy),
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
		UpdatedBy: pdatabase.NullUUID(s.UpdatedBy),
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

func (r *Repository) ListSchedulesByClass(ctx context.Context, tenantID, academicYearID, classID uuid.UUID) ([]domain.Schedule, error) {
	rows, err := r.queries(ctx).ListSchedulesByClass(ctx, db.ListSchedulesByClassParams{
		TenantID: tenantID, AcademicYearID: academicYearID, ClassID: classID,
	})
	if err != nil {
		return nil, err
	}
	return toSchedules(rows), nil
}

func (r *Repository) ListSchedulesByTeacher(ctx context.Context, tenantID, academicYearID, teacherID uuid.UUID) ([]domain.Schedule, error) {
	rows, err := r.queries(ctx).ListSchedulesByTeacher(ctx, db.ListSchedulesByTeacherParams{
		TenantID: tenantID, AcademicYearID: academicYearID, TeacherUserID: teacherID,
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

func (r *Repository) CountSchedulesForClassDay(ctx context.Context, tenantID, academicYearID, classID uuid.UUID, dayOfWeek int16) (int64, error) {
	return r.queries(ctx).CountSchedulesForClassDay(ctx, db.CountSchedulesForClassDayParams{
		TenantID: tenantID, AcademicYearID: academicYearID, ClassID: classID, DayOfWeek: dayOfWeek,
	})
}

func toSchedules(rows []db.Schedule) []domain.Schedule {
	out := make([]domain.Schedule, len(rows))
	for i, row := range rows {
		out[i] = toSchedule(row)
	}
	return out
}
