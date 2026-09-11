package repository

import (
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func toSession(row db.AttendanceSession) domain.Session {
	return domain.Session{
		ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, ScheduleID: row.ScheduleID,
		Date: pdatabase.DateOrZero(row.Date), ClassID: row.ClassID, SubjectID: row.SubjectID,
		TeacherUserID: row.TeacherUserID, SubstituteUserID: pdatabase.UUIDOrNil(row.SubstituteUserID),
		StartPeriodID: row.StartPeriodID, EndPeriodID: row.EndPeriodID, Notes: pdatabase.TextOrEmpty(row.Notes),
		SubmittedAt: pdatabase.TimePtr(row.SubmittedAt), SubmittedBy: pdatabase.UUIDOrNil(row.SubmittedBy),
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func toSessions(rows []db.AttendanceSession) []domain.Session {
	out := make([]domain.Session, len(rows))
	for i, row := range rows {
		out[i] = toSession(row)
	}
	return out
}

func toEntry(row db.AttendanceEntry) domain.Entry {
	return domain.Entry{
		ID: row.ID, TenantID: row.TenantID, SessionID: row.SessionID, StudentUserID: row.StudentUserID,
		StatusCode: row.StatusCode, Source: domain.EntrySource(row.Source), Notes: pdatabase.TextOrEmpty(row.Notes),
		RecordedBy: pdatabase.UUIDOrNil(row.RecordedBy), CreatedAt: pdatabase.TimeOrZero(row.CreatedAt),
		UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func toEntries(rows []db.AttendanceEntry) []domain.Entry {
	out := make([]domain.Entry, len(rows))
	for i, row := range rows {
		out[i] = toEntry(row)
	}
	return out
}

func toCorrection(row db.AttendanceCorrection) domain.Correction {
	return domain.Correction{
		ID: row.ID, TenantID: row.TenantID, EntryID: row.EntryID, OldStatus: row.OldStatus, NewStatus: row.NewStatus,
		Reason: row.Reason, CorrectedBy: row.CorrectedBy, CorrectedAt: pdatabase.TimeOrZero(row.CorrectedAt),
	}
}

func toSummaryRow(row db.AttendanceDailySummary) service.DailySummaryRow {
	return service.DailySummaryRow{
		StudentUserID: row.StudentUserID, Date: pdatabase.DateOrZero(row.Date), StatusCode: row.StatusCode,
		ExpectedSessions: int(row.ExpectedSessions), SubmittedSessions: int(row.SubmittedSessions), PartialAbsence: row.PartialAbsence,
	}
}

func toSummaryRows(rows []db.AttendanceDailySummary) []service.DailySummaryRow {
	out := make([]service.DailySummaryRow, len(rows))
	for i, row := range rows {
		out[i] = toSummaryRow(row)
	}
	return out
}

// timeOfDay converts a wall-clock time.Time (only the hour/minute/second
// component matters; the date is ignored) into the pgtype.Time a `time`
// column expects, the inverse of scheduling/repository/convert.go's
// periodTimeOfDay.
func timeOfDay(t time.Time) pgtype.Time {
	h, m, s := t.Clock()
	micros := int64(h)*3600e6 + int64(m)*60e6 + int64(s)*1e6
	return pgtype.Time{Microseconds: micros, Valid: true}
}

// dateAtTimeOfDay combines a date (only year/month/day matter) with a
// `time` column's pgtype.Time, in date's own location -- the inverse of
// timeOfDay, for turning a period's starts_at/ends_at into a full instant
// on the monitor snapshot's date.
func dateAtTimeOfDay(date time.Time, t pgtype.Time) time.Time {
	if !t.Valid {
		return time.Time{}
	}
	return time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location()).
		Add(time.Duration(t.Microseconds) * time.Microsecond)
}
