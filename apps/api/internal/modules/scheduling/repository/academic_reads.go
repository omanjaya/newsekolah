// cross-module read; replace with academic reader interface after merge.
// Every method here reads a table owned by the academic module (migration
// 0003), built in parallel in its own worktree; see
// internal/modules/scheduling/queries/academic_reads.sql.
package repository

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) GetClassRef(ctx context.Context, tenantID, classID uuid.UUID) (service.ClassRef, error) {
	row, err := r.queries(ctx).GetClassRefForSchedule(ctx, db.GetClassRefForScheduleParams{TenantID: tenantID, ID: classID})
	if err != nil {
		return service.ClassRef{}, err
	}
	return service.ClassRef{ID: row.ID, Name: row.Name}, nil
}

// GetClassHomeroomTeacher resolves classID's currently assigned homeroom
// teacher user id, if any, for the journal export's "Wali Kelas" signer.
func (r *Repository) GetClassHomeroomTeacher(ctx context.Context, tenantID, classID uuid.UUID) (uuid.UUID, bool, error) {
	row, err := r.queries(ctx).GetClassRefForSchedule(ctx, db.GetClassRefForScheduleParams{TenantID: tenantID, ID: classID})
	if err != nil {
		return uuid.UUID{}, false, err
	}
	if !row.HomeroomTeacherID.Valid {
		return uuid.UUID{}, false, nil
	}
	return row.HomeroomTeacherID.Bytes, true, nil
}

func (r *Repository) GetSubjectRef(ctx context.Context, tenantID, subjectID uuid.UUID) (service.SubjectRef, error) {
	row, err := r.queries(ctx).GetSubjectRefForSchedule(ctx, db.GetSubjectRefForScheduleParams{TenantID: tenantID, ID: subjectID})
	if err != nil {
		return service.SubjectRef{}, err
	}
	return service.SubjectRef{ID: row.ID, Code: row.Code, Name: row.Name}, nil
}

func (r *Repository) GetPeriodRef(ctx context.Context, tenantID, periodID uuid.UUID) (service.PeriodRef, error) {
	row, err := r.queries(ctx).GetPeriodRefForSchedule(ctx, db.GetPeriodRefForScheduleParams{TenantID: tenantID, ID: periodID})
	if err != nil {
		return service.PeriodRef{}, err
	}
	return toPeriodRef(row), nil
}

func (r *Repository) ListPeriodsByTemplate(ctx context.Context, tenantID, templateID uuid.UUID) ([]service.PeriodRef, error) {
	rows, err := r.queries(ctx).ListPeriodsRefByTemplate(ctx, db.ListPeriodsRefByTemplateParams{TenantID: tenantID, TemplateID: templateID})
	if err != nil {
		return nil, err
	}
	out := make([]service.PeriodRef, len(rows))
	for i, row := range rows {
		out[i] = toPeriodRef(row)
	}
	return out, nil
}

func (r *Repository) GetPeriodTemplateForDay(ctx context.Context, tenantID, academicYearID uuid.UUID, dayOfWeek int16) (uuid.UUID, error) {
	return r.queries(ctx).GetPeriodTemplateRefForDay(ctx, db.GetPeriodTemplateRefForDayParams{
		TenantID: tenantID, AcademicYearID: academicYearID, DayOfWeek: dayOfWeek,
	})
}

func (r *Repository) IsYearArchived(ctx context.Context, tenantID, academicYearID uuid.UUID) (bool, error) {
	return r.queries(ctx).IsAcademicYearArchivedRef(ctx, db.IsAcademicYearArchivedRefParams{TenantID: tenantID, ID: academicYearID})
}

func (r *Repository) IsSchoolDay(ctx context.Context, tenantID, academicYearID uuid.UUID, dayOfWeek int16) (bool, error) {
	return r.queries(ctx).IsSchoolDayRef(ctx, db.IsSchoolDayRefParams{
		TenantID: tenantID, AcademicYearID: academicYearID, DayOfWeek: dayOfWeek,
	})
}

func (r *Repository) HasTeachingAssignment(ctx context.Context, tenantID, academicYearID, teacherID, subjectID, classID uuid.UUID) (bool, error) {
	row, err := r.queries(ctx).GetTeachingAssignmentRef(ctx, db.GetTeachingAssignmentRefParams{
		TenantID: tenantID, AcademicYearID: academicYearID, TeacherUserID: teacherID, SubjectID: subjectID, ClassID: classID,
	})
	if err != nil {
		return false, nil //nolint:nilerr // "not found" and "not assigned" are the same outcome here.
	}
	return row.IsActive, nil
}

func (r *Repository) IsActiveTeacher(ctx context.Context, tenantID, academicYearID, userID uuid.UUID) (bool, error) {
	return r.queries(ctx).IsActiveTeacherRef(ctx, db.IsActiveTeacherRefParams{
		TenantID: tenantID, AcademicYearID: academicYearID, TeacherUserID: userID,
	})
}

func (r *Repository) ListActiveEnrollments(ctx context.Context, tenantID, academicYearID, classID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := r.queries(ctx).ListActiveEnrollmentsRefByClass(ctx, db.ListActiveEnrollmentsRefByClassParams{
		TenantID: tenantID, AcademicYearID: academicYearID, ClassID: classID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]uuid.UUID, len(rows))
	for i, row := range rows {
		out[i] = row.StudentUserID
	}
	return out, nil
}

func (r *Repository) GetUserRef(ctx context.Context, tenantID, userID uuid.UUID) (service.UserRef, error) {
	row, err := r.queries(ctx).GetUserRefForSchedule(ctx, db.GetUserRefForScheduleParams{TenantID: tenantID, ID: userID})
	if err != nil {
		return service.UserRef{}, err
	}
	return service.UserRef{ID: row.ID, Name: row.Name}, nil
}

// GetStudentActiveClassID reads the class a student is actively enrolled
// in for the given academic year, for scoping schedule reads to "their own
// class". A student with no active enrollment (found=false) sees nothing.
func (r *Repository) GetStudentActiveClassID(ctx context.Context, tenantID, academicYearID, studentID uuid.UUID) (uuid.UUID, bool, error) {
	id, err := r.queries(ctx).GetStudentActiveClassRef(ctx, db.GetStudentActiveClassRefParams{
		TenantID: tenantID, AcademicYearID: academicYearID, StudentUserID: studentID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.UUID{}, false, nil
		}
		return uuid.UUID{}, false, err
	}
	return id, true, nil
}

func (r *Repository) ListTeacherOptions(ctx context.Context, tenantID, academicYearID uuid.UUID, search string, selfUserID uuid.NullUUID, limit int32) ([]service.UserRef, error) {
	rows, err := r.queries(ctx).ListTeacherOptionsRef(ctx, db.ListTeacherOptionsRefParams{
		TenantID: tenantID, AcademicYearID: academicYearID, Limit: limit,
		Search: pdatabase.Text(search), SelfUserID: pdatabase.NullUUID(selfUserID),
	})
	if err != nil {
		return nil, err
	}
	out := make([]service.UserRef, len(rows))
	for i, row := range rows {
		out[i] = service.UserRef{ID: row.ID, Name: row.Name}
	}
	return out, nil
}

func (r *Repository) GetUserName(ctx context.Context, tenantID, userID uuid.UUID) (string, error) {
	return r.queries(ctx).GetUserNameRefForSchedule(ctx, db.GetUserNameRefForScheduleParams{TenantID: tenantID, ID: userID})
}

func (r *Repository) GetTenantSettingValue(ctx context.Context, tenantID uuid.UUID, key string) (string, bool, error) {
	raw, err := r.queries(ctx).GetTenantSettingValue(ctx, db.GetTenantSettingValueParams{TenantID: tenantID, Key: key})
	if err != nil {
		return "", false, nil //nolint:nilerr // missing setting means "use default", not an error.
	}
	var v string
	if err := json.Unmarshal(raw, &v); err != nil {
		return "", false, nil //nolint:nilerr // malformed setting also falls back to default.
	}
	return v, true, nil
}
