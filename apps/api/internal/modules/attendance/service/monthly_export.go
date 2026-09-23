package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
)

// MonthlyRecapRow is one student's per-status attendance totals for a
// month, the row shape behind the monthly recap export (NIS, name, one
// count per configured status code, total counted days, percentage
// present) -- unlike GetMonthlySummary's per-day calendar, this report
// scopes to a whole class or grade level at once.
type MonthlyRecapRow struct {
	StudentUserID uuid.UUID
	Name          string
	NIS           string
	// Counts is keyed by status code (per the tenant's StatusPolicy, e.g.
	// H/S/I/D/A), counting every day of the month that resolved to that
	// code. Days that resolved to domain.StatusNone (nothing scheduled)
	// are not counted anywhere.
	Counts map[string]int
	// TotalDays is the sum of Counts across every status -- the number
	// of school days the student had an attendance outcome for.
	TotalDays int
	// PresentDays is the subset of TotalDays whose status counts as
	// present per the tenant's policy.
	PresentDays int
	// PercentPresent is PresentDays/TotalDays*100, or 0 when TotalDays is 0.
	PercentPresent float64
}

// ClassMonthlyRecap is one class's monthly recap section: its rows plus
// the class identity, so a grade-level export can render one workbook
// sheet per class.
type ClassMonthlyRecap struct {
	ClassID   uuid.UUID
	ClassName string
	Rows      []MonthlyRecapRow
}

// GetMonthlyRecap builds the monthly attendance recap for a report
// export's scope (exactly one of classID/gradeLevelID): one
// ClassMonthlyRecap per class, ordered by class name for the grade-level
// scope, a single-element slice for the class scope.
func (s *Service) GetMonthlyRecap(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID *uuid.UUID, month string) ([]ClassMonthlyRecap, error) {
	from, to, err := parseMonthRange(month)
	if err != nil {
		return nil, err
	}

	var out []ClassMonthlyRecap
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeAcademicYear(ctx, tenantID)
		if err != nil {
			return err
		}
		classes, err := s.resolveReportScope(ctx, tenantID, classID, gradeLevelID)
		if err != nil {
			return err
		}
		policy, err := s.loadStatusPolicy(ctx, tenantID)
		if err != nil {
			return err
		}

		out = make([]ClassMonthlyRecap, 0, len(classes))
		for _, class := range classes {
			recap, err := s.classMonthlyRecap(ctx, tenantID, yearID, class, from, to, policy)
			if err != nil {
				return err
			}
			out = append(out, recap)
		}
		return nil
	})
	return out, err
}

// classMonthlyRecap computes one class's roster's monthly totals, reusing
// calendarDaysForRange per student (the same day-by-day algorithm the
// student calendar and monthly summary use) but passing the class already
// known from the roster read, rather than re-resolving it per student via
// GetEnrolledClass.
func (s *Service) classMonthlyRecap(
	ctx context.Context, tenantID, academicYearID uuid.UUID, class ClassRef, from, to time.Time, policy domain.StatusPolicy,
) (ClassMonthlyRecap, error) {
	students, err := s.repo.ListActiveEnrollments(ctx, tenantID, academicYearID, class.ID)
	if err != nil {
		return ClassMonthlyRecap{}, err
	}

	rows := make([]MonthlyRecapRow, 0, len(students))
	for _, student := range students {
		days, err := s.calendarDaysForRange(ctx, tenantID, academicYearID, student.ID, class.ID, true, from, to, policy)
		if err != nil {
			return ClassMonthlyRecap{}, err
		}
		row := MonthlyRecapRow{StudentUserID: student.ID, Name: student.Name, NIS: student.NIS, Counts: make(map[string]int, len(policy.Statuses))}
		for _, day := range days {
			// Only a day that resolved to one of the tenant's configured
			// status codes counts: domain.StatusNone (nothing scheduled),
			// StatusIncomplete (a session that day was never submitted)
			// and StatusMixed carry no attendance outcome to recap, and
			// StatusIncomplete in particular would otherwise inflate
			// TotalDays with days nobody ever recorded.
			if !policy.IsValid(day.StatusCode) {
				continue
			}
			row.Counts[day.StatusCode]++
			row.TotalDays++
			if policy.CountsAsPresent(day.StatusCode) {
				row.PresentDays++
			}
		}
		if row.TotalDays > 0 {
			row.PercentPresent = float64(row.PresentDays) / float64(row.TotalDays) * 100
		}
		rows = append(rows, row)
	}

	return ClassMonthlyRecap{ClassID: class.ID, ClassName: class.Name, Rows: rows}, nil
}

// ExportMonthlyReportXLSX renders GetMonthlyRecap as a workbook: one sheet
// per class, columns NIS/Name/one per configured status code/Total/
// Percentage. A per-day column group was considered and left out -- 28-31
// extra columns per student duplicates what the existing per-student
// calendar view (GET .../reports/monthly, and the on-screen monthly tab)
// already shows, and would not fit a printed recap the way a one-row-per-
// student summary does.
func (s *Service) ExportMonthlyReportXLSX(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID *uuid.UUID, month string) ([]byte, error) {
	var out []byte
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		// GetMonthlyRecap opens its own s.withTx, which joins this
		// ambient one (database.withTx's nested-call rule) rather than
		// starting a second transaction -- so loadStatusPolicy below runs
		// under the same tenant-scoped transaction, needed the first time
		// a tenant is asked (it seeds and writes a default policy row).
		recaps, err := s.GetMonthlyRecap(ctx, tenantID, classID, gradeLevelID, month)
		if err != nil {
			return err
		}
		policy, err := s.loadStatusPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		out, err = renderMonthlyRecapXLSX(recaps, policy)
		return err
	})
	return out, err
}

func renderMonthlyRecapXLSX(recaps []ClassMonthlyRecap, policy domain.StatusPolicy) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // closing an in-memory workbook after WriteToBuffer cannot meaningfully fail.

	statusCodes := make([]string, len(policy.Statuses))
	for i, def := range policy.Statuses {
		statusCodes[i] = def.Code
	}

	headers := make([]string, 0, 4+len(statusCodes))
	headers = append(headers, "No", "NIS", "Name")
	headers = append(headers, statusCodes...)
	headers = append(headers, "Total", "Percentage")

	used := make(map[string]int)
	for i, recap := range recaps {
		name := recap.ClassName
		if name == "" && len(recaps) == 1 {
			// Single-class scope: resolveReportScope does not resolve the
			// class's own name (only grade-level scope needs it, to tell
			// sheets apart), so fall back to a fixed title instead of
			// sanitizeSheetName's generic "Class 1".
			name = "Attendance"
		}
		sheet := sanitizeSheetName(name, i, used)
		if i == 0 {
			if err := f.SetSheetName("Sheet1", sheet); err != nil {
				return nil, fmt.Errorf("rename sheet: %w", err)
			}
		} else if _, err := f.NewSheet(sheet); err != nil {
			return nil, fmt.Errorf("add sheet: %w", err)
		}

		for col, h := range headers {
			cell, _ := excelize.CoordinatesToCellName(col+1, 1)
			_ = f.SetCellValue(sheet, cell, h)
		}
		for r, row := range recap.Rows {
			excelRow := r + 2
			values := []any{r + 1, row.NIS, row.Name}
			for _, code := range statusCodes {
				values = append(values, row.Counts[code])
			}
			values = append(values, row.TotalDays, fmt.Sprintf("%.1f%%", row.PercentPresent))
			for col, v := range values {
				cell, _ := excelize.CoordinatesToCellName(col+1, excelRow)
				_ = f.SetCellValue(sheet, cell, v)
			}
		}
	}

	if len(recaps) == 0 {
		for col, h := range headers {
			cell, _ := excelize.CoordinatesToCellName(col+1, 1)
			_ = f.SetCellValue("Sheet1", cell, h)
		}
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// sheetNameInvalidChars are the characters Excel forbids in a sheet name.
const sheetNameInvalidChars = `:\/?*[]`

// sanitizeSheetName turns a class name into a valid, unique Excel sheet
// name: strips characters Excel rejects, truncates to its 31-character
// limit, and appends a counter on a collision (e.g. two classes named
// identically after truncation) -- used has already-used names is
// updated in place.
func sanitizeSheetName(name string, index int, used map[string]int) string {
	clean := strings.Map(func(r rune) rune {
		if strings.ContainsRune(sheetNameInvalidChars, r) {
			return '-'
		}
		return r
	}, name)
	clean = strings.TrimSpace(clean)
	if clean == "" {
		clean = fmt.Sprintf("Class %d", index+1)
	}
	const maxLen = 31
	if len(clean) > maxLen {
		clean = clean[:maxLen]
	}
	base := clean
	for {
		n, seen := used[clean]
		if !seen {
			used[clean] = 0
			return clean
		}
		n++
		used[clean] = n
		suffix := fmt.Sprintf(" (%d)", n)
		maxBase := maxLen - len(suffix)
		if maxBase < 1 {
			maxBase = 1
		}
		if len(base) > maxBase {
			clean = base[:maxBase] + suffix
		} else {
			clean = base + suffix
		}
	}
}
