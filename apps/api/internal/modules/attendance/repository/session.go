package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// OpenSession implements the idempotent-open documented on
// queries/sessions.sql's OpenAttendanceSession: an INSERT ... ON CONFLICT
// DO NOTHING scans no row (pgx.ErrNoRows) when the session already exists,
// in which case this falls back to reading it instead of failing.
func (r *Repository) OpenSession(ctx context.Context, s domain.Session) (domain.Session, bool, error) {
	row, err := r.queries(ctx).OpenAttendanceSession(ctx, db.OpenAttendanceSessionParams{
		TenantID: s.TenantID, AcademicYearID: s.AcademicYearID, ScheduleID: s.ScheduleID, Date: pdatabase.Date(s.Date),
		ClassID: s.ClassID, SubjectID: s.SubjectID, TeacherUserID: s.TeacherUserID,
		SubstituteUserID: pdatabase.NullUUID(s.SubstituteUserID), StartPeriodID: s.StartPeriodID, EndPeriodID: s.EndPeriodID,
	})
	if err == nil {
		return toSession(row), true, nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		existing, found, ferr := r.GetSessionBySchedule(ctx, s.TenantID, s.ScheduleID, s.Date)
		if ferr != nil {
			return domain.Session{}, false, ferr
		}
		if !found {
			return domain.Session{}, false, domain.ErrSessionNotFound
		}
		return existing, false, nil
	}
	return domain.Session{}, false, err
}

func (r *Repository) GetSessionByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Session, error) {
	row, err := r.queries(ctx).GetAttendanceSessionByID(ctx, db.GetAttendanceSessionByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Session{}, domain.ErrSessionNotFound
		}
		return domain.Session{}, err
	}
	return toSession(row), nil
}

func (r *Repository) GetSessionBySchedule(ctx context.Context, tenantID, scheduleID uuid.UUID, date time.Time) (domain.Session, bool, error) {
	row, err := r.queries(ctx).GetAttendanceSessionBySchedule(ctx, db.GetAttendanceSessionByScheduleParams{
		TenantID: tenantID, ScheduleID: scheduleID, Date: pdatabase.Date(date),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Session{}, false, nil
		}
		return domain.Session{}, false, err
	}
	return toSession(row), true, nil
}

func (r *Repository) SubmitSession(ctx context.Context, tenantID, id, submittedBy uuid.UUID, notes string) (domain.Session, error) {
	row, err := r.queries(ctx).SubmitAttendanceSession(ctx, db.SubmitAttendanceSessionParams{
		TenantID: tenantID, ID: id, SubmittedBy: pdatabase.NullUUID(uuid.NullUUID{UUID: submittedBy, Valid: true}),
		Notes: pdatabase.Text(notes),
	})
	if err != nil {
		return domain.Session{}, err
	}
	return toSession(row), nil
}

func (r *Repository) ListSessionsByClassDate(ctx context.Context, tenantID, classID uuid.UUID, date time.Time) ([]domain.Session, error) {
	rows, err := r.queries(ctx).ListAttendanceSessionsByClassDate(ctx, db.ListAttendanceSessionsByClassDateParams{
		TenantID: tenantID, ClassID: classID, Date: pdatabase.Date(date),
	})
	if err != nil {
		return nil, err
	}
	return toSessions(rows), nil
}

func (r *Repository) ListSessionsByTeacherDate(ctx context.Context, tenantID uuid.UUID, date time.Time, teacherUserID uuid.UUID) ([]domain.Session, error) {
	rows, err := r.queries(ctx).ListAttendanceSessionsByTeacherDate(ctx, db.ListAttendanceSessionsByTeacherDateParams{
		TenantID: tenantID, Date: pdatabase.Date(date), TeacherUserID: teacherUserID,
	})
	if err != nil {
		return nil, err
	}
	return toSessions(rows), nil
}

func (r *Repository) ListSessionsByDateRange(ctx context.Context, tenantID, academicYearID uuid.UUID, from, to time.Time) ([]domain.Session, error) {
	rows, err := r.queries(ctx).ListAttendanceSessionsByDateRange(ctx, db.ListAttendanceSessionsByDateRangeParams{
		TenantID: tenantID, AcademicYearID: academicYearID, Date: pdatabase.Date(from), Date_2: pdatabase.Date(to),
	})
	if err != nil {
		return nil, err
	}
	return toSessions(rows), nil
}

func (r *Repository) CountSubmittedSessionsByClassDate(ctx context.Context, tenantID, classID uuid.UUID, date time.Time) (int64, error) {
	return r.queries(ctx).CountSubmittedSessionsByClassDate(ctx, db.CountSubmittedSessionsByClassDateParams{
		TenantID: tenantID, ClassID: classID, Date: pdatabase.Date(date),
	})
}

func (r *Repository) CountSessionsBeforeDate(ctx context.Context, tenantID, scheduleID uuid.UUID, date time.Time) (int64, error) {
	return r.queries(ctx).CountAttendanceSessionsForScheduleBeforeDate(ctx, db.CountAttendanceSessionsForScheduleBeforeDateParams{
		TenantID: tenantID, ScheduleID: scheduleID, Date: pdatabase.Date(date),
	})
}

func (r *Repository) GetLatestSessionBeforeDate(ctx context.Context, tenantID, scheduleID uuid.UUID, date time.Time) (domain.Session, bool, error) {
	row, err := r.queries(ctx).GetLatestAttendanceSessionBeforeDate(ctx, db.GetLatestAttendanceSessionBeforeDateParams{
		TenantID: tenantID, ScheduleID: scheduleID, Date: pdatabase.Date(date),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Session{}, false, nil
		}
		return domain.Session{}, false, err
	}
	return toSession(row), true, nil
}
