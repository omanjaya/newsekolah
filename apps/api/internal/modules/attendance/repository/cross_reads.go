// cross-module read; replace with academic/identity/school reader
// interfaces after merge. Every method here reads a table owned by another
// module (academic: enrollments/schedules/classes/subjects/periods;
// identity: duty_assignments/duty_types; platform: tenants/tenant_settings),
// built in parallel in other worktrees; see
// internal/modules/attendance/queries/cross_reads.sql.
package repository

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) ListActiveEnrollments(ctx context.Context, tenantID, academicYearID, classID uuid.UUID) ([]service.StudentRef, error) {
	rows, err := r.queries(ctx).ListActiveEnrollmentsForAttendance(ctx, db.ListActiveEnrollmentsForAttendanceParams{
		TenantID: tenantID, AcademicYearID: academicYearID, ClassID: classID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]service.StudentRef, len(rows))
	for i, row := range rows {
		out[i] = service.StudentRef{
			ID: row.StudentUserID, Name: row.Name, NIS: pdatabase.TextOrEmpty(row.Nis),
			GuardianName: pdatabase.TextOrEmpty(row.GuardianName), GuardianPhone: pdatabase.TextOrEmpty(row.GuardianPhone),
		}
	}
	return out, nil
}

// GetEnrolledClass returns the class studentUserID is actively enrolled in
// for the given academic year, if any -- the student calendar and monthly
// summary views take a student_user_id, not a class_id, per
// attendance.yaml.
func (r *Repository) GetEnrolledClass(ctx context.Context, tenantID, academicYearID, studentUserID uuid.UUID) (uuid.UUID, bool, error) {
	classID, err := r.queries(ctx).GetEnrolledClassForAttendance(ctx, db.GetEnrolledClassForAttendanceParams{
		TenantID: tenantID, AcademicYearID: academicYearID, StudentUserID: studentUserID,
	})
	if err != nil {
		return uuid.UUID{}, false, nil //nolint:nilerr // not currently enrolled anywhere is the common case, not an error.
	}
	return classID, true, nil
}

func (r *Repository) GetHomeroomClassForTeacher(ctx context.Context, tenantID, academicYearID, teacherUserID uuid.UUID) (uuid.UUID, bool, error) {
	classID, err := r.queries(ctx).GetHomeroomClassForAttendance(ctx, db.GetHomeroomClassForAttendanceParams{
		TenantID: tenantID, AcademicYearID: academicYearID, UserID: teacherUserID,
	})
	if err != nil {
		return uuid.UUID{}, false, nil //nolint:nilerr // no homeroom duty is the common case, not an error.
	}
	if !classID.Valid {
		return uuid.UUID{}, false, nil
	}
	return classID.Bytes, true, nil
}

func (r *Repository) GetTenantTimezone(ctx context.Context, tenantID uuid.UUID) (string, error) {
	return r.queries(ctx).GetTenantTimezoneForAttendance(ctx, tenantID)
}

// GetClassName resolves classID's display name, for the class scope of a
// report export's Section name.
func (r *Repository) GetClassName(ctx context.Context, tenantID, classID uuid.UUID) (string, error) {
	return r.queries(ctx).GetClassNameForAttendance(ctx, db.GetClassNameForAttendanceParams{TenantID: tenantID, ID: classID})
}

// GetClassHomeroomTeacher resolves classID's homeroom teacher user id, if
// any is currently assigned, for a report export's "Wali Kelas" signer.
func (r *Repository) GetClassHomeroomTeacher(ctx context.Context, tenantID, classID uuid.UUID) (uuid.UUID, bool, error) {
	id, err := r.queries(ctx).GetClassHomeroomTeacherForAttendance(ctx, db.GetClassHomeroomTeacherForAttendanceParams{TenantID: tenantID, ID: classID})
	if err != nil {
		return uuid.UUID{}, false, err
	}
	if !id.Valid {
		return uuid.UUID{}, false, nil
	}
	return id.Bytes, true, nil
}

// GetGradeLevelName resolves gradeLevelID's display name, for the
// grade-level ("angkatan") scope of a report export's scope line.
func (r *Repository) GetGradeLevelName(ctx context.Context, tenantID, gradeLevelID uuid.UUID) (string, error) {
	return r.queries(ctx).GetGradeLevelNameForAttendance(ctx, db.GetGradeLevelNameForAttendanceParams{TenantID: tenantID, ID: gradeLevelID})
}

// ListClassesByGradeLevel resolves the grade-level ("angkatan") scope for
// a report export: every class of the academic year under gradeLevelID,
// ordered by name, one section per class.
func (r *Repository) ListClassesByGradeLevel(ctx context.Context, tenantID, academicYearID, gradeLevelID uuid.UUID) ([]service.ClassRef, error) {
	rows, err := r.queries(ctx).ListClassesByGradeLevelForAttendance(ctx, db.ListClassesByGradeLevelForAttendanceParams{
		TenantID: tenantID, AcademicYearID: academicYearID, GradeLevelID: gradeLevelID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]service.ClassRef, len(rows))
	for i, row := range rows {
		out[i] = service.ClassRef{ID: row.ClassID, Name: row.ClassName}
	}
	return out, nil
}

func (r *Repository) ListCurrentPeriodScheduleCards(ctx context.Context, tenantID, academicYearID uuid.UUID, dayOfWeek int16, date, nowLocal time.Time) ([]service.MonitorCardRow, error) {
	rows, err := r.queries(ctx).ListCurrentPeriodScheduleCardsForAttendance(ctx, db.ListCurrentPeriodScheduleCardsForAttendanceParams{
		TenantID: tenantID, AcademicYearID: academicYearID, DayOfWeek: dayOfWeek, Date: pdatabase.Date(date), StartsAt: timeOfDay(nowLocal),
	})
	if err != nil {
		return nil, err
	}
	out := make([]service.MonitorCardRow, len(rows))
	for i, row := range rows {
		out[i] = service.MonitorCardRow{
			ClassID: row.ClassID, ClassName: row.ClassName, SubjectID: row.SubjectID, SubjectName: row.SubjectName,
			TeacherUserID: row.TeacherUserID, TeacherName: row.TeacherName,
			SessionOpen: row.SessionID.Valid, Submitted: row.SubmittedAt.Valid,
			SubstituteName: pdatabase.TextOrEmpty(row.SubstituteName),
			PeriodName:     row.PeriodName,
			PeriodStartsAt: dateAtTimeOfDay(date, row.PeriodStartsAt),
			PeriodEndsAt:   dateAtTimeOfDay(date, row.PeriodEndsAt),
		}
	}
	return out, nil
}

// ListClassesWithoutCurrentSchedule backs the monitor snapshot's "no
// schedule" cards.
func (r *Repository) ListClassesWithoutCurrentSchedule(ctx context.Context, tenantID, academicYearID uuid.UUID, dayOfWeek int16, nowLocal time.Time) ([]service.NoScheduleClassRow, error) {
	rows, err := r.queries(ctx).ListClassesWithoutCurrentPeriodScheduleForAttendance(ctx, db.ListClassesWithoutCurrentPeriodScheduleForAttendanceParams{
		TenantID: tenantID, AcademicYearID: academicYearID, DayOfWeek: dayOfWeek, StartsAt: timeOfDay(nowLocal),
	})
	if err != nil {
		return nil, err
	}
	out := make([]service.NoScheduleClassRow, len(rows))
	for i, row := range rows {
		out[i] = service.NoScheduleClassRow{ClassID: row.ClassID, ClassName: row.ClassName}
	}
	return out, nil
}

// GetMonitorDisplayToken and GetCorrectionDays read plain tenant_settings
// values via the shared GetTenantSettingValue query (already generated for
// the scheduling module and reused here rather than duplicated, since
// tenant_settings is a single shared key/value table).
func (r *Repository) GetMonitorDisplayToken(ctx context.Context, tenantID uuid.UUID) (string, bool, error) {
	return r.getStringSetting(ctx, tenantID, "monitor.display_token")
}

func (r *Repository) GetCorrectionDays(ctx context.Context, tenantID uuid.UUID) (int, bool, error) {
	raw, err := r.queries(ctx).GetTenantSettingValue(ctx, db.GetTenantSettingValueParams{TenantID: tenantID, Key: "attendance.correction_days"})
	if err != nil {
		return 0, false, nil //nolint:nilerr // missing setting means "use default".
	}
	var v int
	if err := json.Unmarshal(raw, &v); err != nil {
		return 0, false, nil //nolint:nilerr // malformed setting also falls back to default.
	}
	return v, true, nil
}

// IsSchoolDay reuses scheduling's own IsSchoolDayRef query (already
// generated for its schedule-day validation) rather than duplicating it:
// school_days is a weekly pattern ("is Monday a school day"), not a full
// holiday calendar.
func (r *Repository) IsSchoolDay(ctx context.Context, tenantID, academicYearID uuid.UUID, dayOfWeek int16) (bool, error) {
	return r.queries(ctx).IsSchoolDayRef(ctx, db.IsSchoolDayRefParams{
		TenantID: tenantID, AcademicYearID: academicYearID, DayOfWeek: dayOfWeek,
	})
}

// GetPeriodEndTime reuses scheduling's GetPeriodRefForSchedule query for
// the one column (ends_at) the save-window calculation needs, rather than
// duplicating a period lookup.
func (r *Repository) GetPeriodStartTime(ctx context.Context, tenantID, periodID uuid.UUID) (time.Duration, error) {
	period, err := r.queries(ctx).GetPeriodRefForSchedule(ctx, db.GetPeriodRefForScheduleParams{TenantID: tenantID, ID: periodID})
	if err != nil {
		return 0, err
	}
	return time.Duration(period.StartsAt.Microseconds) * time.Microsecond, nil
}

func (r *Repository) GetPeriodEndTime(ctx context.Context, tenantID, periodID uuid.UUID) (time.Duration, error) {
	period, err := r.queries(ctx).GetPeriodRefForSchedule(ctx, db.GetPeriodRefForScheduleParams{TenantID: tenantID, ID: periodID})
	if err != nil {
		return 0, err
	}
	return time.Duration(period.EndsAt.Microseconds) * time.Microsecond, nil
}

func (r *Repository) GetUserName(ctx context.Context, tenantID, userID uuid.UUID) (string, error) {
	return r.queries(ctx).GetUserNameForAttendance(ctx, db.GetUserNameForAttendanceParams{TenantID: tenantID, ID: userID})
}

func (r *Repository) ListSessionDetailsForClassDate(ctx context.Context, tenantID, classID uuid.UUID, date time.Time) ([]service.SessionDetailRow, error) {
	rows, err := r.queries(ctx).ListSessionDetailsForClassDateAttendance(ctx, db.ListSessionDetailsForClassDateAttendanceParams{
		TenantID: tenantID, ClassID: classID, Date: pdatabase.Date(date),
	})
	if err != nil {
		return nil, err
	}
	out := make([]service.SessionDetailRow, len(rows))
	for i, row := range rows {
		out[i] = service.SessionDetailRow{
			SessionID: row.SessionID, ClassID: classID, SubjectID: row.SubjectID, SubjectName: row.SubjectName,
			TeacherUserID: row.TeacherUserID, TeacherName: row.TeacherName,
			StartPeriodName: row.StartPeriodName, EndPeriodName: row.EndPeriodName, SubmittedAt: pdatabase.TimePtr(row.SubmittedAt),
		}
	}
	return out, nil
}

func (r *Repository) ListOwnSubmittedSessionDetails(ctx context.Context, tenantID, teacherUserID uuid.UUID, date time.Time) ([]service.SessionDetailRow, error) {
	rows, err := r.queries(ctx).ListOwnSubmittedSessionDetailsForAttendance(ctx, db.ListOwnSubmittedSessionDetailsForAttendanceParams{
		TenantID: tenantID, Date: pdatabase.Date(date), TeacherUserID: teacherUserID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]service.SessionDetailRow, len(rows))
	for i, row := range rows {
		out[i] = service.SessionDetailRow{
			SessionID: row.SessionID, ClassID: row.ClassID, ClassName: row.ClassName, SubjectID: row.SubjectID, SubjectName: row.SubjectName,
			TeacherUserID: row.TeacherUserID, TeacherName: row.TeacherName,
			StartPeriodName: row.StartPeriodName, EndPeriodName: row.EndPeriodName, SubmittedAt: pdatabase.TimePtr(row.SubmittedAt),
		}
	}
	return out, nil
}

func (r *Repository) getStringSetting(ctx context.Context, tenantID uuid.UUID, key string) (string, bool, error) {
	raw, err := r.queries(ctx).GetTenantSettingValue(ctx, db.GetTenantSettingValueParams{TenantID: tenantID, Key: key})
	if err != nil {
		return "", false, nil //nolint:nilerr // missing setting means "not configured".
	}
	var v string
	if err := json.Unmarshal(raw, &v); err != nil {
		return "", false, nil //nolint:nilerr // malformed setting also falls back to "not configured".
	}
	return v, true, nil
}
