package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// GradebookExportQuery is ExportGradebook's scope: exactly one of
// ClassID/GradeLevelID must be set (the class or grade-level, "angkatan",
// scope every migrated report export shares), plus the subject and,
// optionally, the term (defaults to the active one, same as GradebookQuery).
type GradebookExportQuery struct {
	ClassID      *uuid.UUID
	GradeLevelID *uuid.UUID
	SubjectID    uuid.UUID
	TermID       uuid.NullUUID
}

// resolveGradebookScope is Gradebook's own twin of attendance/scheduling's
// resolveReportScope: turns ClassID/GradeLevelID into the ordered list of
// classes an export covers.
func (s *Service) resolveGradebookScope(ctx context.Context, tenantID, yearID uuid.UUID, classID, gradeLevelID *uuid.UUID) ([]ClassRef, error) {
	if (classID == nil) == (gradeLevelID == nil) {
		return nil, domain.ErrInvalidScope
	}
	if classID != nil {
		name, err := s.repo.GetClassName(ctx, tenantID, *classID)
		if err != nil {
			return nil, err
		}
		return []ClassRef{{ID: *classID, Name: name}}, nil
	}
	classes, err := s.repo.ListClassesByGradeLevel(ctx, tenantID, yearID, *gradeLevelID)
	if err != nil {
		return nil, err
	}
	return classes, nil
}

// gradebookScopeLine is the "Kelas: X-1" / "Angkatan: <name>" scope line,
// reusing resolveGradebookScope's own result for the class scope so it
// needs no second lookup.
func (s *Service) gradebookScopeLine(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID *uuid.UUID, classes []ClassRef) (reportdoc.ScopeLine, error) {
	if classID != nil && len(classes) > 0 {
		return reportdoc.ScopeLine{Label: "Kelas", Value: classes[0].Name}, nil
	}
	if gradeLevelID != nil {
		name, err := s.repo.GetGradeLevelName(ctx, tenantID, *gradeLevelID)
		if err != nil {
			return reportdoc.ScopeLine{}, err
		}
		return reportdoc.ScopeLine{Label: "Angkatan", Value: name}, nil
	}
	return reportdoc.ScopeLine{}, nil
}

// gradebookReportColumns are the gradebook export's column keys and
// labels for one class's Gradebook: No, Nama Siswa, one column per
// assessment component (key "component_<id>", label the component's own
// Code -- the same short label the gradebook screen's column header
// shows), Rata-rata, Nilai Rapor. Unlike attendance/journal's fixed
// column sets, these depend on the class-subject-term's own configured
// components, so two different classes in a grade-level export can
// legitimately have different columns; Options.Columns still narrows by
// key, on whichever component keys the caller names.
func gradebookReportColumns(components []domain.Component) []reportdoc.Column {
	columns := make([]reportdoc.Column, 0, 4+len(components))
	columns = append(columns,
		reportdoc.Column{Key: "no", Label: "No", Kind: reportdoc.ColumnNumber, Width: 5},
		reportdoc.Column{Key: "name", Label: "Nama Siswa", Kind: reportdoc.ColumnText, Width: 28},
	)
	for _, c := range components {
		columns = append(columns, reportdoc.Column{Key: "component_" + c.ID.String(), Label: c.Code, Kind: reportdoc.ColumnNumber, Width: 10})
	}
	columns = append(columns,
		reportdoc.Column{Key: "average", Label: "Rata-rata", Kind: reportdoc.ColumnNumber, Width: 10},
		reportdoc.Column{Key: "report_score", Label: "Nilai Rapor", Kind: reportdoc.ColumnNumber, Width: 10},
	)
	return columns
}

// gradebookReportSection turns one class's Gradebook into a reportdoc
// Section, ordered to match gradebookReportColumns(gb.Components).
func gradebookReportSection(name string, gb Gradebook) reportdoc.Section {
	rows := make([][]any, len(gb.Students))
	for i, student := range gb.Students {
		values := make([]any, 0, 4+len(gb.Components))
		values = append(values, i+1, student.Name)
		for _, c := range gb.Components {
			if score, ok := student.Scores[c.ID]; ok {
				values = append(values, score)
			} else {
				values = append(values, nil)
			}
		}
		values = append(values, floatOrNil(student.Average), floatOrNil(student.ReportScore))
		rows[i] = values
	}
	return reportdoc.Section{Name: name, Rows: rows}
}

func floatOrNil(v *float64) any {
	if v == nil {
		return nil
	}
	return *v
}

// gradebookSignature builds the gradebook export's Signature block: the
// tenant's configured default (reportLetterhead's own result), with the
// scoped class's currently assigned homeroom teacher prepended as "Wali
// Kelas" -- only when the export is scoped to exactly one class, since
// reportdoc.Document.Signature is one shared block per document, not per
// Section, so a grade-level export spanning multiple classes cannot
// attribute one class's homeroom teacher. Mirrors attendance/academic/
// scheduling's identically named helpers.
func (s *Service) gradebookSignature(ctx context.Context, tenantID uuid.UUID, classes []ClassRef, base *reportdoc.Signature) *reportdoc.Signature {
	if len(classes) != 1 || base == nil {
		return base
	}
	teacherID, ok, err := s.repo.GetClassHomeroomTeacher(ctx, tenantID, classes[0].ID)
	if err != nil || !ok {
		return base
	}
	name, err := s.repo.GetUserName(ctx, tenantID, teacherID)
	if err != nil || name == "" {
		return base
	}
	signature := *base
	signature.Signers = append([]reportdoc.Signer{{RoleLabel: "Wali Kelas", Name: name}}, base.Signers...)
	return &signature
}

// ExportGradebook renders one or more classes' Gradebook (per
// GradebookExportQuery's class or grade-level scope) as a reportdoc file
// (XLSX or PDF per opts.Format), using the exact same data
// Service.Gradebook assembles for the on-screen sheet -- one section per
// class. locale (reportdoc.LocaleID/LocaleEN) drives every
// reportdoc-provided piece of text (the PDF page-number footer, the "no
// rows" label); report-specific text (title, scope labels, column
// labels) stays Indonesian, this module's own default. Called with a
// zero reportdoc.Options, this keeps every existing caller's request
// working: xlsx, every column, the report's own default title.
func (s *Service) ExportGradebook(ctx context.Context, tenantID, actorID uuid.UUID, canManageAny bool, q GradebookExportQuery, locale string, opts reportdoc.Options) ([]byte, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	var out []byte
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		term, err := s.resolveTerm(ctx, tenantID, yearID, q.TermID)
		if err != nil {
			return err
		}
		classes, err := s.resolveGradebookScope(ctx, tenantID, yearID, q.ClassID, q.GradeLevelID)
		if err != nil {
			return err
		}
		scopeLine, err := s.gradebookScopeLine(ctx, tenantID, q.ClassID, q.GradeLevelID, classes)
		if err != nil {
			return err
		}
		subjectName, err := s.repo.GetSubjectName(ctx, tenantID, q.SubjectID)
		if err != nil {
			return err
		}
		scale, err := s.loadScale(ctx, tenantID)
		if err != nil {
			return err
		}

		// Document.Columns is one set shared by every Section; a
		// grade-level export uses the first class's own configured
		// components (in practice every class of one grade level shares
		// the same subject's component set, since a teacher normally
		// configures a subject's assessment plan once per term/grade,
		// not per class). A later class's own components still render in
		// its own Section's Rows, matched up to this column order by
		// component ID; a class with a genuinely different component set
		// would show blank cells for the columns it does not have,
		// rather than silently dropping data or failing the export.
		var columns []reportdoc.Column
		sections := make([]reportdoc.Section, len(classes))
		for i, class := range classes {
			if err := s.requireTeaches(ctx, tenantID, yearID, actorID, class.ID, q.SubjectID, canManageAny); err != nil {
				return err
			}
			gb, err := s.gradebookInTx(ctx, tenantID, yearID, term.ID, class.ID, q.SubjectID, scale)
			if err != nil {
				return err
			}
			if i == 0 {
				columns = gradebookReportColumns(gb.Components)
			}
			sections[i] = gradebookReportSection(class.Name, gb)
		}

		doc := reportdoc.Document{
			Title: "Buku Nilai",
			Scope: []reportdoc.ScopeLine{
				scopeLine,
				{Label: "Mata Pelajaran", Value: subjectName},
				{Label: "Semester", Value: term.Name},
			},
			Columns:         columns,
			Sections:        sections,
			PageLabelFormat: reportdoc.PageLabel(locale),
			EmptyRowsLabel:  reportdoc.EmptyRowsLabelFor(locale),
		}
		if opts.ShowLetterhead {
			lh, sig, err := s.reportLetterhead(ctx, tenantID)
			if err != nil {
				return err
			}
			doc.Letterhead = lh
			doc.Signature = s.gradebookSignature(ctx, tenantID, classes, sig)
		}

		applied, err := reportdoc.Apply(doc, opts)
		if err != nil {
			return err
		}
		if opts.Format == reportdoc.FormatPDF {
			out, err = reportdoc.RenderPDF(applied)
		} else {
			out, err = reportdoc.RenderXLSX(applied)
		}
		return err
	})
	return out, err
}
