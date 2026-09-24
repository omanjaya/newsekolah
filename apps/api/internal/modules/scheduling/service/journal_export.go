package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// journalExportRowLimit caps a single export: large enough for any one
// school's journal history, small enough to keep the request bounded
// rather than paging through an unbounded ListJournals result.
const journalExportRowLimit = 5000

// journalReportColumns are the journal export's stable column keys and
// default Indonesian labels, shared by the XLSX and PDF renderers
// (reportdoc.Apply's Options.Columns refers to these keys, never the
// label).
func journalReportColumns() []reportdoc.Column {
	return []reportdoc.Column{
		{Key: "date", Label: "Tanggal", Kind: reportdoc.ColumnDate, Width: 14},
		{Key: "class", Label: "Kelas", Kind: reportdoc.ColumnText, Width: 14},
		{Key: "subject", Label: "Mata Pelajaran", Kind: reportdoc.ColumnText, Width: 18},
		{Key: "teacher", Label: "Guru", Kind: reportdoc.ColumnText, Width: 20},
		{Key: "author", Label: "Ditulis Oleh", Kind: reportdoc.ColumnText, Width: 20},
		{Key: "topic", Label: "Topik", Kind: reportdoc.ColumnText, Width: 28},
		{Key: "activities", Label: "Kegiatan", Kind: reportdoc.ColumnText, Width: 32},
		{Key: "reflection", Label: "Refleksi", Kind: reportdoc.ColumnText, Width: 32},
	}
}

// journalSignature builds the journal export's Signature block: the
// tenant's configured default (reportLetterhead's own result), with the
// filter's class's currently assigned homeroom teacher prepended as
// "Wali Kelas" when the export is scoped to one class -- reportdoc
// renders multiple Signers side by side, left to right, so the homeroom
// teacher lands on the left and the tenant's own default signer(s) on
// the right. An unscoped ("my own journals" or "every class") export or
// a class with no homeroom teacher assigned keeps base unchanged.
func (s *Service) journalSignature(ctx context.Context, tenantID uuid.UUID, filter JournalFilter, base *reportdoc.Signature) *reportdoc.Signature {
	if !filter.ClassID.Valid || base == nil {
		return base
	}
	teacherID, ok, err := s.repo.GetClassHomeroomTeacher(ctx, tenantID, filter.ClassID.UUID)
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

// ExportJournalsReport renders every journal matching filter (ignoring
// filter.Limit/Offset) as a reportdoc file (XLSX or PDF per opts.Format),
// with resolved class/subject/teacher/writer names, replacing the old
// export's raw IDs (docs/analysis/backend-inventory.md section 1.12).
// locale (reportdoc.LocaleID/LocaleEN) drives every reportdoc-provided
// piece of text (dates, the PDF page-number footer, the "no rows"
// label); report-specific text (title, scope labels, column labels)
// stays Indonesian, this module's own default. Called with a zero
// reportdoc.Options, this keeps every existing caller's request working:
// xlsx, every column, the report's own default title.
func (s *Service) ExportJournalsReport(ctx context.Context, tenantID, academicYearID uuid.UUID, filter JournalFilter, locale string, opts reportdoc.Options) ([]byte, error) {
	var out []byte
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		filter.Limit, filter.Offset = journalExportRowLimit, 0
		journals, err := s.repo.ListJournalsFiltered(ctx, tenantID, academicYearID, filter)
		if err != nil {
			return err
		}
		names := journalNameResolver{ctx: ctx, tenantID: tenantID, repo: s.repo, classes: map[uuid.UUID]string{}, subjects: map[uuid.UUID]string{}, users: map[uuid.UUID]string{}}

		rows := make([][]any, len(journals))
		for i, j := range journals {
			rows[i] = []any{
				j.LessonDate, names.class(j.ClassID), names.subject(j.SubjectID), names.user(j.TeacherUserID), names.user(j.WrittenByUserID),
				j.Topic, j.Activities, j.Reflection,
			}
		}

		var scope []reportdoc.ScopeLine
		if filter.ClassID.Valid {
			scope = append(scope, reportdoc.ScopeLine{Label: "Kelas", Value: names.class(filter.ClassID.UUID)})
		}
		if filter.DateFrom != nil {
			scope = append(scope, reportdoc.ScopeLine{Label: "Dari Tanggal", Value: reportdoc.FormatDate(locale, *filter.DateFrom)})
		}
		if filter.DateTo != nil {
			scope = append(scope, reportdoc.ScopeLine{Label: "Sampai Tanggal", Value: reportdoc.FormatDate(locale, *filter.DateTo)})
		}

		doc := reportdoc.Document{
			Title:           "Jurnal Mengajar",
			Scope:           scope,
			Columns:         journalReportColumns(),
			Sections:        []reportdoc.Section{{Rows: rows}},
			PageLabelFormat: reportdoc.PageLabel(locale),
			EmptyRowsLabel:  reportdoc.EmptyRowsLabelFor(locale),
		}
		if opts.ShowLetterhead {
			lh, sig, err := s.reportLetterhead(ctx, tenantID)
			if err != nil {
				return err
			}
			doc.Letterhead = lh
			doc.Signature = s.journalSignature(ctx, tenantID, filter, sig)
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

// journalExportRows resolves names inside the tenant transaction so RLS also
// applies to class, subject and user lookups rather than returning raw IDs.
// Used by ExportJournalsDOCX only -- reportdoc's XLSX/PDF path uses
// journalReportRows instead (typed rows, an Indonesian long date rather
// than ISO).
func (s *Service) journalExportRows(ctx context.Context, tenantID, academicYearID uuid.UUID, filter JournalFilter) ([][]string, error) {
	filter.Limit, filter.Offset = journalExportRowLimit, 0
	var rows [][]string
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		journals, err := s.repo.ListJournalsFiltered(ctx, tenantID, academicYearID, filter)
		if err != nil {
			return err
		}
		names := journalNameResolver{ctx: ctx, tenantID: tenantID, repo: s.repo, classes: map[uuid.UUID]string{}, subjects: map[uuid.UUID]string{}, users: map[uuid.UUID]string{}}
		for _, j := range journals {
			rows = append(rows, []string{j.LessonDate.Format("2006-01-02"), names.class(j.ClassID), names.subject(j.SubjectID), names.user(j.TeacherUserID), names.user(j.WrittenByUserID), j.Topic, j.Activities, j.Reflection})
		}
		return nil
	})
	return rows, err
}

// journalNameResolver memoizes class/subject/user name lookups across one
// export so a class or teacher shared by many rows is only fetched once.
// A lookup failure falls back to the raw ID rather than failing the whole
// export over one stale reference.
type journalNameResolver struct {
	ctx      context.Context
	tenantID uuid.UUID
	repo     Repository
	classes  map[uuid.UUID]string
	subjects map[uuid.UUID]string
	users    map[uuid.UUID]string
}

func (n journalNameResolver) class(id uuid.UUID) string {
	if name, ok := n.classes[id]; ok {
		return name
	}
	name := id.String()
	if ref, err := n.repo.GetClassRef(n.ctx, n.tenantID, id); err == nil {
		name = ref.Name
	}
	n.classes[id] = name
	return name
}

func (n journalNameResolver) subject(id uuid.UUID) string {
	if name, ok := n.subjects[id]; ok {
		return name
	}
	name := id.String()
	if ref, err := n.repo.GetSubjectRef(n.ctx, n.tenantID, id); err == nil {
		name = ref.Name
	}
	n.subjects[id] = name
	return name
}

func (n journalNameResolver) user(id uuid.UUID) string {
	if name, ok := n.users[id]; ok {
		return name
	}
	name := id.String()
	if resolved, err := n.repo.GetUserName(n.ctx, n.tenantID, id); err == nil && resolved != "" {
		name = resolved
	}
	n.users[id] = name
	return name
}
