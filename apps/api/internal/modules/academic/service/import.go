package service

import (
	"bytes"
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

const importSheetName = "Sheet1"

// ImportRowAction is what one import row will do (preview) or did (commit).
type ImportRowAction string

const (
	ImportRowAssign    ImportRowAction = "assign"
	ImportRowMove      ImportRowAction = "move"
	ImportRowUnchanged ImportRowAction = "unchanged"
	ImportRowError     ImportRowAction = "error"
)

// ImportRowResult is one spreadsheet row's outcome, returned by both
// preview (nothing written) and commit (written unless Action is
// ImportRowError).
type ImportRowResult struct {
	RowNumber   int
	NIS         string
	Username    string
	ClassName   string
	StudentName string
	Action      ImportRowAction
	Message     string
}

// ImportTemplate builds the xlsx template students-by-class import expects:
// one identifier column (NIS or username) and the destination class name.
func (s *Service) ImportTemplate() ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // best-effort close of an in-memory workbook

	if err := f.SetSheetName("Sheet1", importSheetName); err != nil {
		return nil, err
	}
	headers := []string{"NIS", "Username", "Kelas Tujuan"}
	for i, h := range headers {
		cell, err := excelize.CoordinatesToCellName(i+1, 1)
		if err != nil {
			return nil, err
		}
		if err := f.SetCellValue(importSheetName, cell, h); err != nil {
			return nil, err
		}
	}
	if err := f.SetCellValue(importSheetName, "A2", "1234567890"); err != nil {
		return nil, err
	}
	if err := f.SetCellValue(importSheetName, "C2", "X IPA 1"); err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ImportPreview parses an uploaded workbook and reports, per row, what
// would happen -- assign (no current enrollment), move (different class
// than today), unchanged, or an error (student or class not found) --
// without writing anything.
func (s *Service) ImportPreview(ctx context.Context, tenantID, yearID uuid.UUID, file []byte) ([]ImportRowResult, error) {
	rows, err := parseImportRows(file)
	if err != nil {
		return nil, err
	}

	var results []ImportRowResult
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		for _, row := range rows {
			results = append(results, s.evaluate(ctx, tenantID, yearID, row).ImportRowResult)
		}
		return nil
	})
	return results, err
}

// ImportCommit re-parses and re-evaluates the same file (so preview and
// commit never drift) and applies every row that isn't an error: assign or
// move, inside one transaction. A row-level error (unmatched student or
// class) is skipped and reported, not fatal to the rest of the file.
func (s *Service) ImportCommit(ctx context.Context, tenantID, yearID uuid.UUID, file []byte, joinedOn time.Time) ([]ImportRowResult, error) {
	rows, err := parseImportRows(file)
	if err != nil {
		return nil, err
	}

	var results []ImportRowResult
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		for _, row := range rows {
			evaluated := s.evaluate(ctx, tenantID, yearID, row)
			switch evaluated.Action {
			case ImportRowAssign:
				if _, err := s.repo.CreateEnrollment(ctx, tenantID, yearID, evaluated.matchedID, evaluated.matchedClassID, joinedOn); err != nil {
					return err
				}
			case ImportRowMove:
				if _, err := s.repo.CloseEnrollment(ctx, tenantID, evaluated.currentEnrollmentID, domain.EnrollmentStatusMoved, joinedOn); err != nil {
					return err
				}
				if _, err := s.repo.CreateEnrollment(ctx, tenantID, yearID, evaluated.matchedID, evaluated.matchedClassID, joinedOn); err != nil {
					return err
				}
			}
			results = append(results, evaluated.ImportRowResult)
		}
		return nil
	})
	return results, err
}

// importRawRow is one parsed spreadsheet line before student/class
// matching.
type importRawRow struct {
	rowNumber int
	nis       string
	username  string
	className string
}

func parseImportRows(file []byte) ([]importRawRow, error) {
	f, err := excelize.OpenReader(bytes.NewReader(file))
	if err != nil {
		return nil, domain.ErrImportRowInvalid
	}
	defer f.Close() //nolint:errcheck // best-effort close of an in-memory workbook

	sheet := f.GetSheetName(0)
	lines, err := f.GetRows(sheet)
	if err != nil {
		return nil, domain.ErrImportRowInvalid
	}

	var rows []importRawRow
	for i, line := range lines {
		if i == 0 {
			continue // header
		}
		row := importRawRow{rowNumber: i + 1}
		if len(line) > 0 {
			row.nis = strings.TrimSpace(line[0])
		}
		if len(line) > 1 {
			row.username = strings.TrimSpace(line[1])
		}
		if len(line) > 2 {
			row.className = strings.TrimSpace(line[2])
		}
		if row.nis == "" && row.username == "" {
			continue // fully blank row (trailing rows are common in exports)
		}
		rows = append(rows, row)
	}
	return rows, nil
}

// evaluatedImportRow carries the IDs evaluate resolved, so ImportCommit can
// act without re-matching.
type evaluatedImportRow struct {
	ImportRowResult
	matchedID           uuid.UUID
	matchedClassID      uuid.UUID
	currentEnrollmentID uuid.UUID
}

func (s *Service) evaluate(ctx context.Context, tenantID, yearID uuid.UUID, row importRawRow) evaluatedImportRow {
	base := ImportRowResult{RowNumber: row.rowNumber, NIS: row.nis, Username: row.username, ClassName: row.className}

	student, found := s.resolveStudent(ctx, tenantID, row.nis, row.username)
	if !found {
		base.Action = ImportRowError
		base.Message = "student not matched by NIS or username"
		return evaluatedImportRow{ImportRowResult: base}
	}
	base.StudentName = student.Name

	targetClass, ok := s.findClassByName(ctx, tenantID, yearID, row.className)
	if !ok {
		base.Action = ImportRowError
		base.Message = "class not found in this academic year"
		return evaluatedImportRow{ImportRowResult: base}
	}

	current, err := s.repo.GetActiveEnrollment(ctx, tenantID, yearID, student.ID)
	if err != nil {
		base.Action = ImportRowAssign
		return evaluatedImportRow{ImportRowResult: base, matchedID: student.ID, matchedClassID: targetClass}
	}
	if current.ClassID == targetClass {
		base.Action = ImportRowUnchanged
		return evaluatedImportRow{ImportRowResult: base, matchedID: student.ID, matchedClassID: targetClass}
	}
	base.Action = ImportRowMove
	return evaluatedImportRow{
		ImportRowResult:     base,
		matchedID:           student.ID,
		matchedClassID:      targetClass,
		currentEnrollmentID: current.ID,
	}
}

// findClassByName looks up a class by exact name within the given year.
// Import files name classes the way staff already know them ("X IPA 1"),
// not by ID.
func (s *Service) findClassByName(ctx context.Context, tenantID, yearID uuid.UUID, name string) (uuid.UUID, bool) {
	classes, _, err := s.repo.ListClasses(ctx, tenantID, yearID, name, nil, Page{Limit: 200})
	if err != nil {
		return uuid.UUID{}, false
	}
	for _, c := range classes {
		if strings.EqualFold(c.Name, name) {
			return c.ID, true
		}
	}
	return uuid.UUID{}, false
}
