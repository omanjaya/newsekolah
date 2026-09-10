package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"strconv"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
)

// EraporFormat is the file format an e-Rapor export is rendered as.
type EraporFormat string

const (
	EraporFormatXLSX EraporFormat = "xlsx"
	EraporFormatCSV  EraporFormat = "csv"
)

// EraporPreview is the mapping result before any file is rendered, so the
// caller can show what will be exported and what will be skipped.
type EraporPreview struct {
	ClassID uuid.UUID
	TermID  uuid.UUID
	Rows    []domain.EraporRow
	Skipped []domain.EraporSkip
}

// EraporFile is a rendered export: the workbook bytes plus the same
// per-row report the preview shows, so a caller never has to choose
// between the file and knowing what it left out.
type EraporFile struct {
	EraporPreview
	Format      EraporFormat
	ContentType string
	FileName    string
	Content     []byte
}

// PreviewErapor computes the e-Rapor mapping for one class-term without
// rendering a file, for a "here is what will be exported" screen.
func (s *Service) PreviewErapor(ctx context.Context, tenantID, actorID uuid.UUID, canManageAny bool, classID uuid.UUID, termID uuid.NullUUID) (EraporPreview, error) {
	var out EraporPreview
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		export, term, err := s.buildEraporExport(ctx, tenantID, actorID, canManageAny, classID, termID)
		if err != nil {
			return err
		}
		out = EraporPreview{ClassID: classID, TermID: term.ID, Rows: export.Rows, Skipped: export.Skipped}
		return nil
	})
	return out, err
}

// ExportErapor renders the e-Rapor import file for one class-term, refusing
// when the term has no published grades at all for this class. The skip
// report travels with the file as its own sheet (or trailing section for
// CSV), so a downloaded file never hides what it left out.
func (s *Service) ExportErapor(ctx context.Context, tenantID, actorID uuid.UUID, canManageAny bool, classID uuid.UUID, termID uuid.NullUUID, format EraporFormat) (EraporFile, error) {
	var out EraporFile
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		export, term, err := s.buildEraporExport(ctx, tenantID, actorID, canManageAny, classID, termID)
		if err != nil {
			return err
		}
		content, contentType, fileName, err := renderErapor(export, format)
		if err != nil {
			return err
		}
		out = EraporFile{
			EraporPreview: EraporPreview{ClassID: classID, TermID: term.ID, Rows: export.Rows, Skipped: export.Skipped},
			Format:        format, ContentType: contentType, FileName: fileName, Content: content,
		}
		return nil
	})
	return out, err
}

// buildEraporExport resolves the class's subjects and this term's report
// scores, then delegates the actual row-by-row mapping to the pure domain
// function. Refuses when the actor may not export any of the class's
// subjects, or when none of them have published grades for this term.
func (s *Service) buildEraporExport(ctx context.Context, tenantID, actorID uuid.UUID, canManageAny bool, classID uuid.UUID, termID uuid.NullUUID) (domain.EraporExport, Term, error) {
	yearID, err := s.activeYear(ctx, tenantID)
	if err != nil {
		return domain.EraporExport{}, Term{}, err
	}
	term, err := s.resolveTerm(ctx, tenantID, yearID, termID)
	if err != nil {
		return domain.EraporExport{}, Term{}, err
	}
	scale, err := s.loadScale(ctx, tenantID)
	if err != nil {
		return domain.EraporExport{}, Term{}, err
	}

	subjects, err := s.repo.ListClassSubjects(ctx, tenantID, yearID, classID)
	if err != nil {
		return domain.EraporExport{}, Term{}, err
	}
	if len(subjects) == 0 {
		return domain.EraporExport{}, Term{}, domain.ErrNoGradableSubjects
	}

	authorized, err := s.authorizedSubjects(ctx, tenantID, yearID, actorID, canManageAny, classID, subjects)
	if err != nil {
		return domain.EraporExport{}, Term{}, err
	}

	published, err := s.publishedSubjectSet(ctx, tenantID, term.ID, classID, authorized)
	if err != nil {
		return domain.EraporExport{}, Term{}, err
	}
	if len(published) == 0 {
		return domain.EraporExport{}, Term{}, domain.ErrGradesNotPublished
	}

	studentIDs, err := s.repo.ClassStudentIDs(ctx, tenantID, yearID, classID)
	if err != nil {
		return domain.EraporExport{}, Term{}, err
	}
	students, err := s.repo.StudentNISNs(ctx, tenantID, studentIDs)
	if err != nil {
		return domain.EraporExport{}, Term{}, err
	}

	sources, err := s.eraporSources(ctx, tenantID, term.ID, classID, authorized, published, studentIDs, students)
	if err != nil {
		return domain.EraporExport{}, Term{}, err
	}
	return domain.BuildEraporRows(scale, sources), term, nil
}

// authorizedSubjects keeps only the subjects the caller may export: every
// subject for a curriculum lead or admin, or just the ones the actor
// personally teaches otherwise.
func (s *Service) authorizedSubjects(ctx context.Context, tenantID, yearID, actorID uuid.UUID, canManageAny bool, classID uuid.UUID, subjects []EraporSubject) ([]EraporSubject, error) {
	if canManageAny {
		return subjects, nil
	}
	out := make([]EraporSubject, 0, len(subjects))
	for _, subject := range subjects {
		teaches, err := s.repo.TeacherTeaches(ctx, tenantID, yearID, actorID, classID, subject.ID)
		if err != nil {
			return nil, err
		}
		if teaches {
			out = append(out, subject)
		}
	}
	if len(out) == 0 {
		return nil, domain.ErrNotTeachingThisClass
	}
	return out, nil
}

// publishedSubjectSet is the subset of subjects whose grades are published
// for this class-term.
func (s *Service) publishedSubjectSet(ctx context.Context, tenantID, termID, classID uuid.UUID, subjects []EraporSubject) (map[uuid.UUID]bool, error) {
	out := map[uuid.UUID]bool{}
	for _, subject := range subjects {
		pub, ok, err := s.repo.GetPublication(ctx, tenantID, termID, classID, subject.ID)
		if err != nil {
			return nil, err
		}
		if ok && pub.IsPublished {
			out[subject.ID] = true
		}
	}
	return out, nil
}

// eraporSources builds one source row per student per subject: every
// student in the class, crossed with every subject the caller may export,
// carrying the report score when one exists.
func (s *Service) eraporSources(ctx context.Context, tenantID, termID, classID uuid.UUID, subjects []EraporSubject, published map[uuid.UUID]bool, studentIDs []uuid.UUID, students map[uuid.UUID]EraporStudent) ([]domain.EraporSourceRow, error) {
	out := make([]domain.EraporSourceRow, 0, len(studentIDs)*len(subjects))
	for _, subject := range subjects {
		scores := map[uuid.UUID]float64{}
		if published[subject.ID] {
			reportScores, err := s.repo.ListReportScores(ctx, tenantID, termID, classID, subject.ID)
			if err != nil {
				return nil, err
			}
			for _, rs := range reportScores {
				scores[rs.StudentUserID] = rs.FinalScore
			}
		}
		for _, studentID := range studentIDs {
			info := students[studentID]
			var score *float64
			if value, ok := scores[studentID]; ok {
				value := value
				score = &value
			}
			out = append(out, domain.EraporSourceRow{
				StudentUserID: studentID, StudentName: info.Name, NISN: info.NISN,
				SubjectCode: subject.Code, SubjectName: subject.Name,
				SubjectPublished: published[subject.ID], Score: score,
			})
		}
	}
	return out, nil
}

var eraporHeaders = []string{"NISN", "Kode Mata Pelajaran", "Nilai", "Predikat"}

// renderErapor turns the mapped rows into a downloadable file, with the
// skip report kept alongside the data rather than discarded: a second
// sheet for XLSX, a trailing section for CSV.
func renderErapor(export domain.EraporExport, format EraporFormat) (content []byte, contentType, fileName string, err error) {
	if format == EraporFormatCSV {
		content, err = renderEraporCSV(export)
		if err != nil {
			return nil, "", "", err
		}
		return content, "text/csv; charset=utf-8", "e-rapor.csv", nil
	}
	content, err = renderEraporXLSX(export)
	if err != nil {
		return nil, "", "", err
	}
	return content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "e-rapor.xlsx", nil
}

func renderEraporCSV(export domain.EraporExport) ([]byte, error) {
	var buf bytes.Buffer
	buf.Write([]byte{0xEF, 0xBB, 0xBF}) // BOM: Excel on Windows otherwise mis-detects the encoding.
	w := csv.NewWriter(&buf)
	if err := w.Write(eraporHeaders); err != nil {
		return nil, fmt.Errorf("write csv header: %w", err)
	}
	for _, row := range export.Rows {
		record := []string{row.NISN, row.SubjectCode, strconv.FormatFloat(row.Score, 'f', -1, 64), row.Predicate}
		if err := w.Write(record); err != nil {
			return nil, fmt.Errorf("write csv row: %w", err)
		}
	}
	if len(export.Skipped) > 0 {
		if err := w.Write(nil); err != nil {
			return nil, fmt.Errorf("write csv separator: %w", err)
		}
		if err := w.Write([]string{"Nama Siswa", "Mata Pelajaran", "Alasan Dilewati"}); err != nil {
			return nil, fmt.Errorf("write csv skip header: %w", err)
		}
		for _, skip := range export.Skipped {
			if err := w.Write([]string{skip.StudentName, skip.SubjectName, string(skip.Reason)}); err != nil {
				return nil, fmt.Errorf("write csv skip row: %w", err)
			}
		}
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, fmt.Errorf("flush csv: %w", err)
	}
	return buf.Bytes(), nil
}

func renderEraporXLSX(export domain.EraporExport) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // an in-memory workbook cannot fail to close after WriteToBuffer

	const sheet = "e-Rapor"
	if err := f.SetSheetName("Sheet1", sheet); err != nil {
		return nil, fmt.Errorf("rename sheet: %w", err)
	}
	if err := writeEraporSheet(f, sheet, eraporHeaders, rowsToRecords(export.Rows)); err != nil {
		return nil, err
	}

	if len(export.Skipped) > 0 {
		const skipSheet = "Dilewati"
		if _, err := f.NewSheet(skipSheet); err != nil {
			return nil, fmt.Errorf("add skip sheet: %w", err)
		}
		if err := writeEraporSheet(f, skipSheet, []string{"Nama Siswa", "Mata Pelajaran", "Alasan Dilewati"}, skipsToRecords(export.Skipped)); err != nil {
			return nil, err
		}
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, fmt.Errorf("write workbook: %w", err)
	}
	return buf.Bytes(), nil
}

func rowsToRecords(rows []domain.EraporRow) [][]any {
	out := make([][]any, len(rows))
	for i, row := range rows {
		out[i] = []any{row.NISN, row.SubjectCode, row.Score, row.Predicate}
	}
	return out
}

func skipsToRecords(skips []domain.EraporSkip) [][]any {
	out := make([][]any, len(skips))
	for i, skip := range skips {
		out[i] = []any{skip.StudentName, skip.SubjectName, string(skip.Reason)}
	}
	return out
}

// writeEraporSheet writes one header row and the data below it into an
// existing sheet.
func writeEraporSheet(f *excelize.File, sheet string, headers []string, rows [][]any) error {
	for col, header := range headers {
		cell, err := excelize.CoordinatesToCellName(col+1, 1)
		if err != nil {
			return fmt.Errorf("cell name: %w", err)
		}
		if err := f.SetCellValue(sheet, cell, header); err != nil {
			return fmt.Errorf("write header: %w", err)
		}
	}
	for i, row := range rows {
		for col, value := range row {
			cell, err := excelize.CoordinatesToCellName(col+1, i+2)
			if err != nil {
				return fmt.Errorf("cell name: %w", err)
			}
			if err := f.SetCellValue(sheet, cell, value); err != nil {
				return fmt.Errorf("write cell: %w", err)
			}
		}
	}
	return nil
}
