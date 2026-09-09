package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
)

// GetDailyReport builds one class's expected-vs-submitted counts and
// per-student daily status for date, fixing the old system's "expected
// always equals submitted" bug (docs/analysis/backend-inventory.md
// section 1.9/1.11) by routing through the same buildRoster/
// domain.ComputeDailyStatus path every attendance view uses.
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
		report = DailyReport{
			ClassID: classID, Date: date, ExpectedSessions: expected, SubmittedSessions: submitted,
			Complete: expected == 0 || submitted >= expected, Students: roster, StatusCounts: counts,
		}
		return nil
	})
	return report, err
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
