package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
)

// GetDailyReport builds one class's expected-vs-submitted counts and
// per-student daily status for date, fixing the old system's "expected
// always equals submitted" bug (docs/analysis/backend-inventory.md
// section 1.9/1.11) by routing through the same buildRoster/
// domain.ComputeDailyStatus path every attendance view uses, plus the
// per-session detail rows the old daily report had (section 1.10).
func (s *Service) GetDailyReport(ctx context.Context, tenantID, classID uuid.UUID, date time.Time) (DailyReport, error) {
	var report DailyReport
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeAcademicYear(ctx, tenantID)
		if err != nil {
			return err
		}
		roster, expected, submitted, err := s.buildRoster(ctx, tenantID, yearID, classID, date)
		if err != nil {
			return err
		}
		counts := make(map[string]int, len(roster))
		for _, r := range roster {
			counts[r.StatusCode]++
		}
		sessions, err := s.buildDailyReportSessions(ctx, tenantID, classID, date)
		if err != nil {
			return err
		}
		report = DailyReport{
			ClassID: classID, Date: date, ExpectedSessions: expected, SubmittedSessions: submitted,
			Complete: expected == 0 || submitted >= expected, Students: roster, StatusCounts: counts, Sessions: sessions,
		}
		return nil
	})
	return report, err
}

// GetOwnDailyReport is the "own sessions" report scope for a teacher who
// does not hold view_reports (docs/analysis/backend-inventory.md
// section 1.10): every session teacherUserID submitted on date, as the
// schedule's own teacher or as an accepted substitute, across whatever
// classes they taught that day -- not scoped to one class_id, since a
// teacher's day is not.
func (s *Service) GetOwnDailyReport(ctx context.Context, tenantID, teacherUserID uuid.UUID, date time.Time) ([]DailyReportSession, error) {
	var out []DailyReportSession
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		rows, err := s.repo.ListOwnSubmittedSessionDetails(ctx, tenantID, teacherUserID, date)
		if err != nil {
			return err
		}
		out, err = s.toDailyReportSessions(ctx, tenantID, rows)
		return err
	})
	return out, err
}

// buildDailyReportSessions resolves every session already opened for
// classID on date into its full DailyReportSession detail row.
func (s *Service) buildDailyReportSessions(ctx context.Context, tenantID, classID uuid.UUID, date time.Time) ([]DailyReportSession, error) {
	rows, err := s.repo.ListSessionDetailsForClassDate(ctx, tenantID, classID, date)
	if err != nil {
		return nil, err
	}
	return s.toDailyReportSessions(ctx, tenantID, rows)
}

// toDailyReportSessions attaches every session's per-student entries
// (name + status + notes) to its SessionDetailRow.
func (s *Service) toDailyReportSessions(ctx context.Context, tenantID uuid.UUID, rows []SessionDetailRow) ([]DailyReportSession, error) {
	out := make([]DailyReportSession, 0, len(rows))
	nameByStudent := make(map[uuid.UUID]string)
	for _, row := range rows {
		entries, err := s.repo.ListEntriesBySession(ctx, tenantID, row.SessionID)
		if err != nil {
			return nil, err
		}
		if len(entries) > 0 {
			if err := s.fillStudentNames(ctx, tenantID, entries, nameByStudent); err != nil {
				return nil, err
			}
		}
		sessionEntries := make([]DailyReportSessionEntry, len(entries))
		for i, e := range entries {
			sessionEntries[i] = DailyReportSessionEntry{StudentUserID: e.StudentUserID, Name: nameByStudent[e.StudentUserID], StatusCode: e.StatusCode, Notes: e.Notes}
		}
		out = append(out, DailyReportSession{
			SessionID: row.SessionID, ClassID: row.ClassID, ClassName: row.ClassName, SubjectID: row.SubjectID, SubjectName: row.SubjectName,
			TeacherUserID: row.TeacherUserID, TeacherName: row.TeacherName, PeriodLabel: periodLabel(row.StartPeriodName, row.EndPeriodName),
			SubmittedAt: row.SubmittedAt, Entries: sessionEntries,
		})
	}
	return out, nil
}

// fillStudentNames resolves any student in entries not already cached in
// names, via the identity user reads attendance already has through
// ListActiveEnrollments -- looked up by directly resolving the student's
// own record rather than the whole class roster, since a session's
// entries may span a roster the caller has not otherwise loaded.
func (s *Service) fillStudentNames(ctx context.Context, tenantID uuid.UUID, entries []domain.Entry, names map[uuid.UUID]string) error {
	for _, e := range entries {
		if _, ok := names[e.StudentUserID]; ok {
			continue
		}
		name, err := s.repo.GetUserName(ctx, tenantID, e.StudentUserID)
		if err != nil {
			names[e.StudentUserID] = ""
			continue
		}
		names[e.StudentUserID] = name
	}
	return nil
}

// periodLabel joins a session's start and end period names into one
// display string, collapsing to a single name when the session spans only
// one period.
func periodLabel(start, end string) string {
	if start == end || end == "" {
		return start
	}
	return start + " - " + end
}

// ExportDailyReportXLSX renders GetDailyReport as a single-sheet workbook,
// the "daily report as XLSX" operation in attendance.yaml.
func (s *Service) ExportDailyReportXLSX(ctx context.Context, tenantID, classID uuid.UUID, date time.Time) ([]byte, error) {
	report, err := s.GetDailyReport(ctx, tenantID, classID, date)
	if err != nil {
		return nil, err
	}

	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // closing an in-memory workbook after WriteToBuffer cannot meaningfully fail.

	const sheet = "Attendance"
	if err := f.SetSheetName("Sheet1", sheet); err != nil {
		return nil, fmt.Errorf("rename sheet: %w", err)
	}

	headers := []string{"No", "Name", "Status", "Expected Sessions", "Submitted Sessions", "Complete"}
	for col, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(col+1, 1)
		_ = f.SetCellValue(sheet, cell, h)
	}

	for i, student := range report.Students {
		row := i + 2
		values := []any{i + 1, student.Name, student.StatusCode, student.ExpectedSessions, student.SubmittedSessions, student.Complete}
		for col, v := range values {
			cell, _ := excelize.CoordinatesToCellName(col+1, row)
			_ = f.SetCellValue(sheet, cell, v)
		}
	}

	summaryRow := len(report.Students) + 3
	_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", summaryRow), "Class expected/submitted:")
	_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", summaryRow), fmt.Sprintf("%d/%d", report.ExpectedSessions, report.SubmittedSessions))

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
