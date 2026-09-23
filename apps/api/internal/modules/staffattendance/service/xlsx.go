package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
)

// ExportMonthlyRecapXLSX renders GetMonthlyRecap as a single-sheet
// workbook, reusing the excelize dependency the reports module and
// attendance/service.ExportDailyReportXLSX already depend on.
func (s *Service) ExportMonthlyRecapXLSX(ctx context.Context, tenantID, employeeUserID uuid.UUID, month string) ([]byte, error) {
	recap, err := s.GetMonthlyRecap(ctx, tenantID, employeeUserID, month)
	if err != nil {
		return nil, err
	}

	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // closing an in-memory workbook after WriteToBuffer cannot meaningfully fail.

	const sheet = "Staff Attendance"
	if err := f.SetSheetName("Sheet1", sheet); err != nil {
		return nil, fmt.Errorf("rename sheet: %w", err)
	}

	headers := []string{"Date", "Status", "Arrival", "Departure", "Late (min)", "Early leave (min)", "Source"}
	for col, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(col+1, 1)
		_ = f.SetCellValue(sheet, cell, h)
	}

	for i, day := range recap.Days {
		row := i + 2
		arrival, departure := "", ""
		if day.ArrivalAt != nil {
			arrival = day.ArrivalAt.Format("15:04")
		}
		if day.DepartureAt != nil {
			departure = day.DepartureAt.Format("15:04")
		}
		values := []any{
			day.Date.Format("2006-01-02"), string(day.StatusCode), arrival, departure,
			day.LateMinutes, day.EarlyLeaveMinutes, string(day.Source),
		}
		for col, v := range values {
			cell, _ := excelize.CoordinatesToCellName(col+1, row)
			_ = f.SetCellValue(sheet, cell, v)
		}
	}

	summaryRow := len(recap.Days) + 3
	_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", summaryRow), "Employee:")
	_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", summaryRow), recap.EmployeeName)
	_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", summaryRow+1), "Total late (min):")
	_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", summaryRow+1), recap.TotalLateMinutes)
	_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", summaryRow+2), "Total early leave (min):")
	_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", summaryRow+2), recap.TotalEarlyLeaveMinutes)

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ExportAllEmployeesMonthlyRecapXLSX renders GetAllEmployeesMonthlyRecap as
// a single-sheet workbook, one block per employee (header, day rows,
// summary), for the whole-staff administrative recap -- the tenant-wide
// counterpart to ExportMonthlyRecapXLSX.
func (s *Service) ExportAllEmployeesMonthlyRecapXLSX(ctx context.Context, tenantID uuid.UUID, month string) ([]byte, error) {
	recaps, err := s.GetAllEmployeesMonthlyRecap(ctx, tenantID, month)
	if err != nil {
		return nil, err
	}

	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // closing an in-memory workbook after WriteToBuffer cannot meaningfully fail.

	const sheet = "Staff Attendance"
	if err := f.SetSheetName("Sheet1", sheet); err != nil {
		return nil, fmt.Errorf("rename sheet: %w", err)
	}

	headers := []string{"Date", "Status", "Arrival", "Departure", "Late (min)", "Early leave (min)", "Source"}
	row := 1
	for _, recap := range recaps {
		employeeName := recap.EmployeeName
		if employeeName == "" {
			employeeName = recap.EmployeeUserID.String()
		}
		_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", row), "Employee:")
		_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", row), employeeName)
		row++
		for col, h := range headers {
			cell, _ := excelize.CoordinatesToCellName(col+1, row)
			_ = f.SetCellValue(sheet, cell, h)
		}
		row++
		for _, day := range recap.Days {
			arrival, departure := "", ""
			if day.ArrivalAt != nil {
				arrival = day.ArrivalAt.Format("15:04")
			}
			if day.DepartureAt != nil {
				departure = day.DepartureAt.Format("15:04")
			}
			values := []any{
				day.Date.Format("2006-01-02"), string(day.StatusCode), arrival, departure,
				day.LateMinutes, day.EarlyLeaveMinutes, string(day.Source),
			}
			for col, v := range values {
				cell, _ := excelize.CoordinatesToCellName(col+1, row)
				_ = f.SetCellValue(sheet, cell, v)
			}
			row++
		}
		_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", row), "Total late (min):")
		_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", row), recap.TotalLateMinutes)
		row++
		_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", row), "Total early leave (min):")
		_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", row), recap.TotalEarlyLeaveMinutes)
		row += 3
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
