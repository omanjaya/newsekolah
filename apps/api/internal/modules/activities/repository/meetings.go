package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/domain"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func toMeeting(row db.ExtracurricularMeeting) domain.Meeting {
	return domain.Meeting{
		ID: row.ID, TenantID: row.TenantID, ExtracurricularID: row.ExtracurricularID,
		MeetingDate: pdatabase.DateOrZero(row.MeetingDate), Notes: row.Notes, CreatedAt: pdatabase.TimeOrZero(row.CreatedAt),
	}
}

func toAttendance(row db.ExtracurricularAttendance) domain.AttendanceEntry {
	return domain.AttendanceEntry{
		ID: row.ID, TenantID: row.TenantID, MeetingID: row.MeetingID, StudentUserID: row.StudentUserID,
		StatusCode: domain.AttendanceStatus(row.StatusCode), Notes: row.Notes, RecordedBy: pdatabase.UUIDOrNil(row.RecordedBy),
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func (r *Repository) CreateMeeting(ctx context.Context, m domain.Meeting) (domain.Meeting, error) {
	row, err := r.queries(ctx).CreateMeeting(ctx, db.CreateMeetingParams{
		TenantID: m.TenantID, ExtracurricularID: m.ExtracurricularID, MeetingDate: pdatabase.Date(m.MeetingDate), Notes: m.Notes,
	})
	if isUnique(err) {
		return domain.Meeting{}, domain.ErrMeetingExists
	}
	if err != nil {
		return domain.Meeting{}, fmt.Errorf("create meeting: %w", err)
	}
	return toMeeting(row), nil
}

func (r *Repository) GetMeeting(ctx context.Context, tenantID, id uuid.UUID) (domain.Meeting, bool, error) {
	row, err := r.queries(ctx).GetMeeting(ctx, db.GetMeetingParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Meeting{}, false, nil
	}
	if err != nil {
		return domain.Meeting{}, false, fmt.Errorf("get meeting: %w", err)
	}
	return toMeeting(row), true, nil
}

func (r *Repository) ListMeetingsForClub(ctx context.Context, tenantID, clubID uuid.UUID) ([]domain.Meeting, error) {
	rows, err := r.queries(ctx).ListMeetingsForClub(ctx, db.ListMeetingsForClubParams{TenantID: tenantID, ExtracurricularID: clubID})
	if err != nil {
		return nil, fmt.Errorf("list meetings for club: %w", err)
	}
	out := make([]domain.Meeting, len(rows))
	for i, row := range rows {
		out[i] = toMeeting(row)
	}
	return out, nil
}

func (r *Repository) ListActiveMemberStudentIDs(ctx context.Context, tenantID, clubID uuid.UUID) ([]uuid.UUID, error) {
	ids, err := r.queries(ctx).ListActiveMemberStudentIDs(ctx, db.ListActiveMemberStudentIDsParams{TenantID: tenantID, ExtracurricularID: clubID})
	if err != nil {
		return nil, fmt.Errorf("list active member student ids: %w", err)
	}
	return ids, nil
}

func (r *Repository) UpsertAttendance(ctx context.Context, a domain.AttendanceEntry) (domain.AttendanceEntry, error) {
	row, err := r.queries(ctx).UpsertAttendance(ctx, db.UpsertAttendanceParams{
		TenantID: a.TenantID, MeetingID: a.MeetingID, StudentUserID: a.StudentUserID, StatusCode: string(a.StatusCode),
		Notes: a.Notes, RecordedBy: pdatabase.NullUUID(a.RecordedBy),
	})
	if err != nil {
		return domain.AttendanceEntry{}, fmt.Errorf("upsert attendance: %w", err)
	}
	return toAttendance(row), nil
}

func (r *Repository) ListAttendanceForMeeting(ctx context.Context, tenantID, meetingID uuid.UUID) ([]domain.AttendanceEntry, error) {
	rows, err := r.queries(ctx).ListAttendanceForMeeting(ctx, db.ListAttendanceForMeetingParams{TenantID: tenantID, MeetingID: meetingID})
	if err != nil {
		return nil, fmt.Errorf("list attendance for meeting: %w", err)
	}
	out := make([]domain.AttendanceEntry, len(rows))
	for i, row := range rows {
		out[i] = toAttendance(row)
	}
	return out, nil
}

func (r *Repository) ListAttendanceForClub(ctx context.Context, tenantID, clubID uuid.UUID) ([]domain.AttendanceEntry, error) {
	rows, err := r.queries(ctx).ListAttendanceForClub(ctx, db.ListAttendanceForClubParams{TenantID: tenantID, ExtracurricularID: clubID})
	if err != nil {
		return nil, fmt.Errorf("list attendance for club: %w", err)
	}
	out := make([]domain.AttendanceEntry, len(rows))
	for i, row := range rows {
		out[i] = toAttendance(row)
	}
	return out, nil
}
