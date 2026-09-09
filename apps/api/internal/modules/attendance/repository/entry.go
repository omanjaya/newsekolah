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

func (r *Repository) UpsertEntry(ctx context.Context, e domain.Entry) (domain.Entry, error) {
	row, err := r.queries(ctx).UpsertAttendanceEntry(ctx, db.UpsertAttendanceEntryParams{
		TenantID: e.TenantID, SessionID: e.SessionID, StudentUserID: e.StudentUserID, StatusCode: e.StatusCode,
		Source: string(e.Source), Notes: pdatabase.Text(e.Notes), RecordedBy: pdatabase.NullUUID(e.RecordedBy),
	})
	if err != nil {
		return domain.Entry{}, err
	}
	return toEntry(row), nil
}

func (r *Repository) ListEntriesBySession(ctx context.Context, tenantID, sessionID uuid.UUID) ([]domain.Entry, error) {
	rows, err := r.queries(ctx).ListEntriesBySession(ctx, db.ListEntriesBySessionParams{TenantID: tenantID, SessionID: sessionID})
	if err != nil {
		return nil, err
	}
	return toEntries(rows), nil
}

func (r *Repository) GetEntryBySessionStudent(ctx context.Context, tenantID, sessionID, studentUserID uuid.UUID) (domain.Entry, bool, error) {
	row, err := r.queries(ctx).GetEntryBySessionStudent(ctx, db.GetEntryBySessionStudentParams{
		TenantID: tenantID, SessionID: sessionID, StudentUserID: studentUserID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Entry{}, false, nil
		}
		return domain.Entry{}, false, err
	}
	return toEntry(row), true, nil
}

func (r *Repository) ListEntryStatusesForStudentDate(ctx context.Context, tenantID, studentUserID uuid.UUID, date time.Time) ([]string, error) {
	return r.queries(ctx).ListEntryStatusesForStudentDate(ctx, db.ListEntryStatusesForStudentDateParams{
		TenantID: tenantID, StudentUserID: studentUserID, Date: pdatabase.Date(date),
	})
}

func (r *Repository) GetPreviousEntryForStudent(ctx context.Context, tenantID, studentUserID, classID, subjectID uuid.UUID, before time.Time) (string, bool, error) {
	status, err := r.queries(ctx).GetPreviousEntryForStudent(ctx, db.GetPreviousEntryForStudentParams{
		TenantID: tenantID, StudentUserID: studentUserID, ClassID: classID, SubjectID: subjectID, Date: pdatabase.Date(before),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", false, nil
		}
		return "", false, err
	}
	return status, true, nil
}
