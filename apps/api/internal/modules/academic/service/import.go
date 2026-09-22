package service

import (
	"bytes"
	"context"
	"fmt"
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
	ImportRowSkipped   ImportRowAction = "skipped"
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

// maxImportTemplateDropdownClasses caps how many class names go into the
// template's inline dropdown list: excelize (and Excel itself) rejects a
// data-validation list whose encoded form exceeds 255 characters, so a
// tenant with very many classes still gets a usable template, just without
// the dropdown.
const maxImportTemplateDropdownClasses = 60

// ImportTemplate builds the xlsx template students-by-class import expects:
// one identifier column (NIS or username) and the destination class name.
// Per row it prefills every student in yearID with no active enrollment
// yet (the same list ListUnassignedStudents returns), and the class-name
// column carries a dropdown of the year's classes -- staff fill in a class
// next to a name already on the sheet instead of typing NIS and class name
// from memory.
func (s *Service) ImportTemplate(ctx context.Context, tenantID, yearID uuid.UUID) ([]byte, error) {
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

	students, _, err := s.ListUnassignedStudents(ctx, tenantID, yearID, "", Page{Limit: 1000})
	if err != nil {
		return nil, err
	}
	for i, student := range students {
		row := i + 2
		if err := f.SetCellValue(importSheetName, fmt.Sprintf("B%d", row), student.Username); err != nil {
			return nil, err
		}
	}

	var classes []domain.Class
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		classes, _, err = s.repo.ListClasses(ctx, tenantID, yearID, "", nil, Page{Limit: 200})
		return err
	})
	if err != nil {
		return nil, err
	}
	if len(classes) > 0 && len(classes) <= maxImportTemplateDropdownClasses {
		names := make([]string, len(classes))
		for i, c := range classes {
			names[i] = c.Name
		}
		lastRow := len(students) + 1
		if lastRow < 1000 {
			lastRow = 1000
		}
		dv := excelize.NewDataValidation(true)
		dv.SetSqref(fmt.Sprintf("C2:C%d", lastRow))
		if err := dv.SetDropList(names); err == nil {
			_ = f.AddDataValidation(importSheetName, dv) //nolint:errcheck // dropdown is a convenience, not required for the import to work
		}
	}

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ImportPreview parses an uploaded workbook and reports, per row, what
// would happen -- assign (no current enrollment), move (different class
// than today, only when moveExisting is true), skipped (would move but
// moveExisting is false, or a duplicate of an earlier row's student),
// unchanged, or an error (student or class not found) -- without writing
// anything.
func (s *Service) ImportPreview(ctx context.Context, tenantID, yearID uuid.UUID, file []byte, moveExisting bool) ([]ImportRowResult, error) {
	rows, err := parseImportRows(file)
	if err != nil {
		return nil, err
	}

	var results []evaluatedImportRow
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		results = s.evaluateAll(ctx, tenantID, yearID, rows, moveExisting)
		return nil
	})
	return toRowResults(results), err
}

// ImportCommit re-parses and re-evaluates the same file with the same
// flags (so preview and commit never drift) and, in one transaction,
// applies every row that resolves to assign or move. Per the old app's
// behaviour, an invalid file is rejected outright -- nothing is written --
// unless partial is true, in which case error rows are skipped and every
// other row is still applied.
func (s *Service) ImportCommit(ctx context.Context, tenantID, yearID uuid.UUID, file []byte, joinedOn time.Time, moveExisting, partial bool) ([]ImportRowResult, error) {
	rows, err := parseImportRows(file)
	if err != nil {
		return nil, err
	}

	var results []evaluatedImportRow
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireYearNotArchived(ctx, tenantID, yearID); err != nil {
			return err
		}

		results = s.evaluateAll(ctx, tenantID, yearID, rows, moveExisting)
		if !partial {
			for _, r := range results {
				if r.Action == ImportRowError {
					return domain.ErrImportHasInvalidRow
				}
			}
		}

		for _, evaluated := range results {
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
		}
		return nil
	})
	return toRowResults(results), err
}

// evaluateAll evaluates every row in order, tracking which students have
// already matched an earlier row in the same file: a repeat is reported as
// a skipped duplicate rather than applied twice.
func (s *Service) evaluateAll(ctx context.Context, tenantID, yearID uuid.UUID, rows []importRawRow, moveExisting bool) []evaluatedImportRow {
	results := make([]evaluatedImportRow, 0, len(rows))
	seen := make(map[uuid.UUID]bool)
	for _, row := range rows {
		evaluated := s.evaluate(ctx, tenantID, yearID, row)
		if evaluated.matchedID != uuid.Nil {
			if seen[evaluated.matchedID] {
				evaluated.Action = ImportRowSkipped
				evaluated.Message = "duplicate student in file, only the first row was considered"
			} else {
				seen[evaluated.matchedID] = true
			}
		}
		if evaluated.Action == ImportRowMove && !moveExisting {
			evaluated.Action = ImportRowSkipped
			evaluated.Message = "student already has a different class this year; move_existing=true is required to move them"
		}
		results = append(results, evaluated)
	}
	return results
}

func toRowResults(rows []evaluatedImportRow) []ImportRowResult {
	out := make([]ImportRowResult, len(rows))
	for i, r := range rows {
		out[i] = r.ImportRowResult
	}
	return out
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

	// resolveStudent only checks deleted_at, not status, so a suspended or
	// inactive student can still match by NIS/username; apply the same
	// active-student rule the direct assign endpoints enforce.
	if err := s.requireActiveStudent(ctx, tenantID, student.ID); err != nil {
		base.Action = ImportRowError
		base.Message = "student is not active"
		return evaluatedImportRow{ImportRowResult: base}
	}

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
