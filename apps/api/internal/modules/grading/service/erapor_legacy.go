package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
)

// EraporLegacyFile is the old per-subject e-Rapor sheet -- No/NIS/Nama/
// Nilai Rapor/<TP export code: T|R>/Validasi, with a T/R dropdown on the
// TP columns -- kept as a second export option alongside the current
// NISN/predicate export for schools whose import tooling still expects
// this shape (grading_extended.go:421-485).
type EraporLegacyFile struct {
	ClassID     uuid.UUID
	SubjectID   uuid.UUID
	TermID      uuid.UUID
	ContentType string
	FileName    string
	Content     []byte
}

// ExportEraporLegacy renders the legacy sheet for one class-subject-term,
// the same scope the old app's teacher-facing export used.
func (s *Service) ExportEraporLegacy(ctx context.Context, tenantID, actorID uuid.UUID, canManageAny bool, classID, subjectID uuid.UUID, termID uuid.NullUUID) (EraporLegacyFile, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return EraporLegacyFile{}, err
	}
	var out EraporLegacyFile
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		term, err := s.resolveTerm(ctx, tenantID, yearID, termID)
		if err != nil {
			return err
		}
		if err := s.requireTeaches(ctx, tenantID, yearID, actorID, classID, subjectID, canManageAny); err != nil {
			return err
		}
		scale, err := s.loadScale(ctx, tenantID)
		if err != nil {
			return err
		}
		components, err := s.repo.ListComponents(ctx, tenantID, term.ID, classID, subjectID)
		if err != nil {
			return err
		}
		if len(components) == 0 {
			return domain.ErrNoGradableSubjects
		}
		componentIDs := make([]uuid.UUID, len(components))
		for i, c := range components {
			componentIDs[i] = c.ID
		}
		grades, err := s.repo.ListGradesForComponents(ctx, tenantID, componentIDs)
		if err != nil {
			return err
		}
		byStudent := map[uuid.UUID]map[uuid.UUID]float64{}
		for _, g := range grades {
			row, ok := byStudent[g.StudentUserID]
			if !ok {
				row = map[uuid.UUID]float64{}
				byStudent[g.StudentUserID] = row
			}
			row[g.ComponentID] = g.Score
		}
		mappings, err := s.repo.ListTPMappingsForComponents(ctx, tenantID, componentIDs)
		if err != nil {
			return err
		}
		ranges, err := s.applicableRanges(ctx, tenantID, yearID, subjectID, components[0].TeacherUserID)
		if err != nil {
			return err
		}
		previous, err := s.previousScores(ctx, tenantID, yearID, term.ID, classID, subjectID)
		if err != nil {
			return err
		}
		manual, err := s.manualScores(ctx, tenantID, term.ID, classID, subjectID)
		if err != nil {
			return err
		}
		studentIDs, err := s.repo.ClassStudentIDs(ctx, tenantID, yearID, classID)
		if err != nil {
			return err
		}
		info, err := s.repo.StudentNISNs(ctx, tenantID, studentIDs)
		if err != nil {
			return err
		}

		sources := make([]domain.LegacyEraporStudentSource, len(studentIDs))
		for i, id := range studentIDs {
			sources[i] = domain.LegacyEraporStudentSource{
				NIS: info[id].NIS, Name: info[id].Name, Grades: byStudent[id], Previous: previous[id], Manual: manual[id],
			}
		}
		export := domain.BuildLegacyEraporRows(scale, components, ranges, mappings, sources)
		content, err := renderLegacyErapor(export)
		if err != nil {
			return err
		}
		out = EraporLegacyFile{
			ClassID: classID, SubjectID: subjectID, TermID: term.ID,
			ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			FileName:    "e-rapor-legacy.xlsx", Content: content,
		}
		return nil
	})
	return out, err
}

// manualScores reads the manual override already on record for one
// class-subject-term, keyed by student -- what the legacy export's
// "Nilai Rapor" column and Validasi warning need alongside the raw
// average, without triggering a recompute.
func (s *Service) manualScores(ctx context.Context, tenantID, termID, classID, subjectID uuid.UUID) (map[uuid.UUID]*float64, error) {
	reports, err := s.repo.ListReportScores(ctx, tenantID, termID, classID, subjectID)
	if err != nil {
		return nil, err
	}
	out := map[uuid.UUID]*float64{}
	for _, r := range reports {
		if r.ManualScore != nil {
			value := *r.ManualScore
			out[r.StudentUserID] = &value
		}
	}
	return out, nil
}

var legacyEraporFixedHeaders = []string{"No", "NIS", "Nama", "Nilai Rapor"}

// renderLegacyErapor writes the old app's sheet layout: the fixed columns,
// one column per mapped TP export code with a T/R dropdown, and a
// trailing Validasi column.
func renderLegacyErapor(export domain.LegacyEraporExport) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // an in-memory workbook cannot fail to close after WriteToBuffer

	const sheet = "e-Rapor"
	if err := f.SetSheetName("Sheet1", sheet); err != nil {
		return nil, fmt.Errorf("rename sheet: %w", err)
	}

	headers := make([]string, 0, len(legacyEraporFixedHeaders)+len(export.ExportCodes)+1)
	headers = append(headers, legacyEraporFixedHeaders...)
	headers = append(headers, export.ExportCodes...)
	headers = append(headers, "Validasi")
	for col, header := range headers {
		cell, err := excelize.CoordinatesToCellName(col+1, 1)
		if err != nil {
			return nil, fmt.Errorf("cell name: %w", err)
		}
		if err := f.SetCellValue(sheet, cell, header); err != nil {
			return nil, fmt.Errorf("write header: %w", err)
		}
	}

	for i, row := range export.Rows {
		var final any = ""
		if row.FinalScore != nil {
			final = *row.FinalScore
		}
		values := make([]any, 0, len(headers))
		values = append(values, i+1, row.NIS, row.Name, final)
		for _, mark := range row.TPMarks {
			values = append(values, mark)
		}
		values = append(values, row.Validation)
		for col, v := range values {
			cell, err := excelize.CoordinatesToCellName(col+1, i+2)
			if err != nil {
				return nil, fmt.Errorf("cell name: %w", err)
			}
			if err := f.SetCellValue(sheet, cell, v); err != nil {
				return nil, fmt.Errorf("write cell: %w", err)
			}
		}
	}

	// A T/R dropdown on every TP column, the same data validation the old
	// app's export attached (grading_extended.go:475-481).
	for i := range export.ExportCodes {
		col, err := excelize.ColumnNumberToName(len(legacyEraporFixedHeaders) + 1 + i)
		if err != nil {
			return nil, fmt.Errorf("column name: %w", err)
		}
		dv := excelize.NewDataValidation(true)
		dv.Sqref = fmt.Sprintf("%s2:%s%d", col, col, len(export.Rows)+1)
		if err := dv.SetDropList([]string{"T", "R"}); err != nil {
			return nil, fmt.Errorf("set drop list: %w", err)
		}
		if err := f.AddDataValidation(sheet, dv); err != nil {
			return nil, fmt.Errorf("add data validation: %w", err)
		}
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, fmt.Errorf("write workbook: %w", err)
	}
	return buf.Bytes(), nil
}
