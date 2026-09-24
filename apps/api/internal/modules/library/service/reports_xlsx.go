package service

import (
	"bytes"
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

const dateLayout = "2006-01-02"

func formatDate(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.Format(dateLayout)
}

func formatDatePtr(t *time.Time) string {
	if t == nil {
		return ""
	}
	return formatDate(*t)
}

// periodScope builds the "Periode" scope line every from/to-bounded
// report shares, following locale (the caller's resolved tenant locale)
// for the date text, and falling back to "Semua data" when the caller
// gave no bound (these endpoints default to the last 30 days
// server-side, but AccessionRegister and PopularReport allow an
// unbounded query too).
func periodScope(locale string, from, to *time.Time) reportdoc.ScopeLine {
	if from == nil && to == nil {
		return reportdoc.ScopeLine{Label: "Periode", Value: "Semua data"}
	}
	value := "s.d. "
	if from != nil {
		value = reportdoc.FormatDate(locale, *from) + " s.d. "
	}
	if to != nil {
		value += reportdoc.FormatDate(locale, *to)
	} else {
		value += "sekarang"
	}
	return reportdoc.ScopeLine{Label: "Periode", Value: value}
}

// loanStatusLabel maps a LoanStatus onto the Indonesian label the web
// app's own "app.library" catalogue uses.
func loanStatusLabel(status domain.LoanStatus) string {
	switch status {
	case domain.LoanActive:
		return "Dipinjam"
	case domain.LoanReturned:
		return "Dikembalikan"
	case domain.LoanLost:
		return "Hilang"
	default:
		return string(status)
	}
}

// copyStatusLabel maps a CopyStatus onto the Indonesian label the web
// app's own "app.library" catalogue uses.
func copyStatusLabel(status domain.CopyStatus) string {
	switch status {
	case domain.CopyAvailable:
		return "Tersedia"
	case domain.CopyOnLoan:
		return "Dipinjam"
	case domain.CopyReserved:
		return "Dipesan"
	case domain.CopyDamaged:
		return "Rusak"
	case domain.CopyLost:
		return "Hilang"
	case domain.CopyInRepair:
		return "Diperbaiki"
	case domain.CopyProcessing:
		return "Diproses"
	case domain.CopyDonated:
		return "Dihibahkan"
	case domain.CopyReserveStack:
		return "Rak cadangan"
	default:
		return string(status)
	}
}

// loansReportColumns is the loans report's stable column set.
func loansReportColumns() []reportdoc.Column {
	return []reportdoc.Column{
		{Key: "title", Label: "Judul", Kind: reportdoc.ColumnText, Width: 30},
		{Key: "borrower", Label: "Peminjam", Kind: reportdoc.ColumnText, Width: 22},
		{Key: "borrowed_at", Label: "Tanggal Pinjam", Kind: reportdoc.ColumnDate, Width: 14},
		{Key: "due_on", Label: "Jatuh Tempo", Kind: reportdoc.ColumnDate, Width: 14},
		{Key: "returned_at", Label: "Tanggal Kembali", Kind: reportdoc.ColumnDate, Width: 14},
		{Key: "status", Label: "Status", Kind: reportdoc.ColumnText, Width: 12},
		{Key: "fine", Label: "Denda", Kind: reportdoc.ColumnNumber, Width: 12},
	}
}

// ExportLoansReport renders LoansInPeriod per opts (format, title override,
// letterhead visibility, column subset/order), following locale (the
// caller's resolved tenant locale) for the scope line and every other
// piece of generated text.
func (s *Service) ExportLoansReport(ctx context.Context, tenantID uuid.UUID, from, to *time.Time, locale string, opts reportdoc.Options) ([]byte, error) {
	rows, err := s.LoansInPeriod(ctx, tenantID, from, to)
	if err != nil {
		return nil, err
	}
	tableRows := make([][]any, len(rows))
	for i, r := range rows {
		var returned any
		if r.Loan.ReturnedAt != nil {
			returned = *r.Loan.ReturnedAt
		}
		tableRows[i] = []any{r.Title, r.MemberName, r.Loan.BorrowedAt, r.Loan.DueOn, returned, loanStatusLabel(r.Loan.Status), r.Loan.FineAmount}
	}
	doc := reportdoc.Document{
		Title:    "Laporan Peminjaman",
		Scope:    []reportdoc.ScopeLine{periodScope(locale, from, to)},
		Columns:  loansReportColumns(),
		Sections: []reportdoc.Section{{Name: "Peminjaman", Rows: tableRows}},
	}
	return s.renderLibraryReport(ctx, tenantID, locale, doc, opts)
}

// overdueMembersReportColumns is the overdue-members report's stable
// column set.
func overdueMembersReportColumns() []reportdoc.Column {
	return []reportdoc.Column{
		{Key: "member", Label: "Anggota", Kind: reportdoc.ColumnText, Width: 26},
		{Key: "loan_count", Label: "Jumlah Pinjaman Telat", Kind: reportdoc.ColumnNumber, Width: 18},
		{Key: "fine", Label: "Estimasi Denda", Kind: reportdoc.ColumnNumber, Width: 16},
	}
}

// ExportOverdueMembersReport renders OverdueMembers per opts (format, title
// override, letterhead visibility, column subset/order).
func (s *Service) ExportOverdueMembersReport(ctx context.Context, tenantID uuid.UUID, locale string, opts reportdoc.Options) ([]byte, error) {
	rows, err := s.OverdueMembers(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	tableRows := make([][]any, len(rows))
	for i, r := range rows {
		name := r.MemberUserID.String()
		if s.members != nil {
			if resolved, err := s.members.UserDisplayName(ctx, tenantID, r.MemberUserID); err == nil && resolved != "" {
				name = resolved
			}
		}
		tableRows[i] = []any{name, r.LoanCount, r.TotalFine}
	}
	doc := reportdoc.Document{
		Title:    "Laporan Anggota Terlambat",
		Columns:  overdueMembersReportColumns(),
		Sections: []reportdoc.Section{{Name: "Terlambat", Rows: tableRows}},
	}
	return s.renderLibraryReport(ctx, tenantID, locale, doc, opts)
}

// mostBorrowedReportColumns is the most-borrowed report's stable column
// set. Its two sections describe different things (a title's author, a
// borrower's class), so "detail" is deliberately generic -- reportdoc
// shares one column set across every section of a Document (see its
// package comment), and a title-popularity report and a top-borrower
// report are two views of the same "who/what and how many loans" shape
// rather than two unrelated tables.
func mostBorrowedReportColumns() []reportdoc.Column {
	return []reportdoc.Column{
		{Key: "name", Label: "Nama", Kind: reportdoc.ColumnText, Width: 28},
		{Key: "detail", Label: "Keterangan", Kind: reportdoc.ColumnText, Width: 18},
		{Key: "loan_count", Label: "Jumlah Pinjam", Kind: reportdoc.ColumnNumber, Width: 14},
	}
}

// ExportMostBorrowedReport renders PopularReport per opts (format, title
// override, letterhead visibility, column subset/order) as a two-section
// report: most borrowed titles ("Keterangan" is the author), then top
// borrowers ("Keterangan" is the class).
func (s *Service) ExportMostBorrowedReport(ctx context.Context, tenantID uuid.UUID, from, to *time.Time, limit int, locale string, opts reportdoc.Options) ([]byte, error) {
	report, err := s.PopularReport(ctx, tenantID, from, to, limit)
	if err != nil {
		return nil, err
	}
	titleRows := make([][]any, len(report.Titles))
	for i, t := range report.Titles {
		titleRows[i] = []any{t.Title.Title.Title, t.Title.Author, t.LoanCount}
	}
	borrowerRows := make([][]any, len(report.Borrowers))
	for i, b := range report.Borrowers {
		borrowerRows[i] = []any{b.MemberName, labelClass(b.ClassName), b.LoanCount}
	}
	doc := reportdoc.Document{
		Title:   "Laporan Judul dan Peminjam Terpopuler",
		Scope:   []reportdoc.ScopeLine{periodScope(locale, from, to)},
		Columns: mostBorrowedReportColumns(),
		Sections: []reportdoc.Section{
			{Name: "Judul Terpopuler", Rows: titleRows},
			{Name: "Peminjam Teraktif", Rows: borrowerRows},
		},
	}
	return s.renderLibraryReport(ctx, tenantID, locale, doc, opts)
}

// catalogueSummaryVocabulary is the accreditation summary's own small
// id/en vocabulary (docs/05-shared-components.md, "Lokalisasi"): title,
// section names, and every indicator/column label -- reportdoc itself
// stays free of this vocabulary (see its package doc comment).
var catalogueSummaryVocabulary = map[string]map[string]string{
	reportdoc.LocaleID: {
		"title": "Ringkasan Katalog", "sectionSummary": "Ringkasan", "sectionDDC": "Judul per DDC",
		"colIndicator": "Indikator", "colValue": "Nilai",
		"colDDCCode": "Kelas DDC", "colDDCName": "Nama", "colDDCCount": "Jumlah Judul",
		"rowTotalTitles": "Total Judul Aktif", "rowAdditions": "Judul Baru Periode Ini",
		"rowLoans": "Peminjaman Periode Ini", "rowActiveBorrowers": "Peminjam Aktif",
		"rowOverdue": "Terlambat Saat Ini", "rowFictionRatio": "Rasio Fiksi",
		"rowStudentsTotal": "Total Siswa Aktif", "rowMembersTotal": "Total Anggota",
		"rowItemsPerStudent": "Eksemplar per Siswa", "rowLoansPerStudent": "Peminjaman per Siswa",
		"rowVisits": "Kunjungan Periode Ini", "rowVisitsPerStudent": "Kunjungan per Siswa",
	},
	reportdoc.LocaleEN: {
		"title": "Catalogue Summary", "sectionSummary": "Summary", "sectionDDC": "Titles by DDC class",
		"colIndicator": "Indicator", "colValue": "Value",
		"colDDCCode": "DDC class", "colDDCName": "Name", "colDDCCount": "Title count",
		"rowTotalTitles": "Active titles", "rowAdditions": "New titles this period",
		"rowLoans": "Loans this period", "rowActiveBorrowers": "Active borrowers",
		"rowOverdue": "Currently overdue", "rowFictionRatio": "Fiction ratio",
		"rowStudentsTotal": "Active students", "rowMembersTotal": "Total members",
		"rowItemsPerStudent": "Copies per student", "rowLoansPerStudent": "Loans per student",
		"rowVisits": "Visits this period", "rowVisitsPerStudent": "Visits per student",
	},
}

func catalogueSummaryText(locale, key string) string {
	if m, ok := catalogueSummaryVocabulary[locale]; ok {
		if v, ok := m[key]; ok {
			return v
		}
	}
	return catalogueSummaryVocabulary[reportdoc.LocaleEN][key]
}

// ExportCatalogueSummaryReport renders CatalogueSummary per opts (format,
// title override, letterhead visibility -- deliberately no column
// customisation: its two sections have different column counts, so an
// end-user column selection keyed to one would silently corrupt the
// other, see reportdoc.Apply). A key/value indicator sheet and a
// Dewey-class breakdown, in one Document, is exactly the case
// reportdoc.Section.Columns exists for.
func (s *Service) ExportCatalogueSummaryReport(ctx context.Context, tenantID uuid.UUID, from, to *time.Time, locale string, opts reportdoc.Options) ([]byte, error) {
	summary, err := s.CatalogueSummary(ctx, tenantID, from, to)
	if err != nil {
		return nil, err
	}
	text := func(key string) string { return catalogueSummaryText(locale, key) }

	summaryColumns := []reportdoc.Column{
		{Key: "indicator", Label: text("colIndicator"), Kind: reportdoc.ColumnText, Width: 30},
		{Key: "value", Label: text("colValue"), Kind: reportdoc.ColumnText, Width: 16},
	}
	summaryRows := [][]any{
		{text("rowTotalTitles"), summary.FictionTotal},
		{text("rowAdditions"), summary.AdditionsInPeriod},
		{text("rowLoans"), summary.LoansInPeriod},
		{text("rowActiveBorrowers"), summary.ActiveBorrowers},
		{text("rowOverdue"), summary.OverdueNow},
		{text("rowFictionRatio"), fmt.Sprintf("%d/%d", summary.FictionCount, summary.FictionTotal)},
		{text("rowStudentsTotal"), summary.StudentsTotal},
		{text("rowMembersTotal"), summary.MembersTotal},
		// Per-student ratios share this section's "value" column with
		// strings like the fiction ratio above, so the column is
		// ColumnText and these floats are formatted here rather than left
		// to render at full float64 precision (the web's own summary
		// table already rounds the same figures to 2 decimals).
		{text("rowItemsPerStudent"), fmt.Sprintf("%.2f", summary.ItemsPerStudent)},
		{text("rowLoansPerStudent"), fmt.Sprintf("%.2f", summary.LoansPerStudent)},
		{text("rowVisits"), summary.VisitsInPeriod},
		{text("rowVisitsPerStudent"), fmt.Sprintf("%.2f", summary.VisitsPerStudent)},
	}

	ddcColumns := []reportdoc.Column{
		{Key: "code", Label: text("colDDCCode"), Kind: reportdoc.ColumnText, Width: 12},
		{Key: "name", Label: text("colDDCName"), Kind: reportdoc.ColumnText, Width: 30},
		{Key: "count", Label: text("colDDCCount"), Kind: reportdoc.ColumnNumber, Width: 14},
	}
	ddcRows := make([][]any, len(summary.TitlesByDDC))
	for i, d := range summary.TitlesByDDC {
		ddcRows[i] = []any{d.Code, d.Name, d.TitleCount}
	}

	doc := reportdoc.Document{
		Title: text("title"),
		Scope: []reportdoc.ScopeLine{periodScope(locale, from, to)},
		Sections: []reportdoc.Section{
			{Name: text("sectionSummary"), Columns: summaryColumns, Rows: summaryRows},
			{Name: text("sectionDDC"), Columns: ddcColumns, Rows: ddcRows},
		},
	}
	return s.renderLibraryReport(ctx, tenantID, locale, doc, opts)
}

// labelCountColumns is the shared two-column ("what, how many") shape
// behind the visits and members reports: each has two sections that
// break the same total down along a different axis (day vs class, type
// vs class), so one generic label column serves both, the same reasoning
// mostBorrowedReportColumns documents.
func labelCountColumns(labelHeader string) []reportdoc.Column {
	return []reportdoc.Column{
		{Key: "label", Label: labelHeader, Kind: reportdoc.ColumnText, Width: 26},
		{Key: "count", Label: "Jumlah", Kind: reportdoc.ColumnNumber, Width: 14},
	}
}

// ExportVisitsReport renders VisitsReport per opts (format, title
// override, letterhead visibility, column subset/order) as a two-section
// report: visits per day, then per class.
func (s *Service) ExportVisitsReport(ctx context.Context, tenantID uuid.UUID, from, to *time.Time, locale string, opts reportdoc.Options) ([]byte, error) {
	report, err := s.VisitsReport(ctx, tenantID, from, to)
	if err != nil {
		return nil, err
	}
	dayRows := make([][]any, len(report.PerDay))
	for i, d := range report.PerDay {
		dayRows[i] = []any{reportdoc.FormatDate(locale, d.Day), d.Count}
	}
	classRows := make([][]any, len(report.PerClass))
	for i, c := range report.PerClass {
		classRows[i] = []any{c.ClassName, c.Count}
	}
	doc := reportdoc.Document{
		Title:   "Laporan Kunjungan Perpustakaan",
		Scope:   []reportdoc.ScopeLine{periodScope(locale, from, to)},
		Columns: labelCountColumns("Keterangan"),
		Sections: []reportdoc.Section{
			{Name: "Per Hari", Rows: dayRows},
			{Name: "Per Kelas", Rows: classRows},
		},
	}
	return s.renderLibraryReport(ctx, tenantID, locale, doc, opts)
}

// ExportMembersReport renders MembersReport per opts (format, title
// override, letterhead visibility, column subset/order) as a two-section
// report: members per type, then per class.
func (s *Service) ExportMembersReport(ctx context.Context, tenantID uuid.UUID, locale string, opts reportdoc.Options) ([]byte, error) {
	report, err := s.MembersReport(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	typeRows := make([][]any, len(report.PerType))
	for i, t := range report.PerType {
		typeRows[i] = []any{t.Name, t.Count}
	}
	classRows := make([][]any, len(report.PerClass))
	for i, c := range report.PerClass {
		classRows[i] = []any{c.ClassName, c.Count}
	}
	doc := reportdoc.Document{
		Title:   "Laporan Anggota Perpustakaan",
		Columns: labelCountColumns("Keterangan"),
		Sections: []reportdoc.Section{
			{Name: "Per Jenis", Rows: typeRows},
			{Name: "Per Kelas", Rows: classRows},
		},
	}
	return s.renderLibraryReport(ctx, tenantID, locale, doc, opts)
}

// accessionRegisterColumns is the accession register (Buku Induk)
// report's stable column set.
func accessionRegisterColumns() []reportdoc.Column {
	return []reportdoc.Column{
		{Key: "accession_number", Label: "Nomor Induk", Kind: reportdoc.ColumnText, Width: 16},
		{Key: "barcode", Label: "Barcode", Kind: reportdoc.ColumnText, Width: 16},
		{Key: "call_number", Label: "Nomor Panggil", Kind: reportdoc.ColumnText, Width: 16},
		{Key: "status", Label: "Status", Kind: reportdoc.ColumnText, Width: 12},
		{Key: "price", Label: "Harga", Kind: reportdoc.ColumnNumber, Width: 12},
		{Key: "acquired_on", Label: "Tanggal Pengadaan", Kind: reportdoc.ColumnDate, Width: 16},
	}
}

// ExportAccessionRegisterReport renders AccessionRegister (Buku Induk)
// per opts (format, title override, letterhead visibility, column
// subset/order).
func (s *Service) ExportAccessionRegisterReport(ctx context.Context, tenantID uuid.UUID, from, to *time.Time, locale string, opts reportdoc.Options) ([]byte, error) {
	copies, err := s.AccessionRegister(ctx, tenantID, from, to)
	if err != nil {
		return nil, err
	}
	tableRows := make([][]any, len(copies))
	for i, c := range copies {
		var acquired any
		if c.AcquiredOn != nil {
			acquired = *c.AcquiredOn
		}
		tableRows[i] = []any{c.AccessionNumber, c.Barcode, c.CallNumber, copyStatusLabel(c.Status), c.Price, acquired}
	}
	doc := reportdoc.Document{
		Title:    "Buku Induk",
		Scope:    []reportdoc.ScopeLine{periodScope(locale, from, to)},
		Columns:  accessionRegisterColumns(),
		Sections: []reportdoc.Section{{Name: "Buku Induk", Rows: tableRows}},
	}
	return s.renderLibraryReport(ctx, tenantID, locale, doc, opts)
}

// renderLibraryReport loads tenantID's configured kop laporan (nil
// letterhead source or a tenant that has not configured one both degrade
// to "no letterhead" rather than an error), sets the locale-correct PDF
// page-number footer and empty-section placeholder, applies opts to doc,
// and renders it in the format opts requests, defaulting to XLSX when the
// caller (or an old client that predates this query-param contract) did
// not name one.
func (s *Service) renderLibraryReport(ctx context.Context, tenantID uuid.UUID, locale string, doc reportdoc.Document, opts reportdoc.Options) ([]byte, error) {
	doc.PageLabelFormat = reportdoc.PageLabel(locale)
	doc.EmptyRowsLabel = reportdoc.EmptyRowsLabelFor(locale)
	if s.letterhead != nil {
		if lh, sig, err := s.letterhead.Letterhead(ctx, tenantID); err == nil {
			doc.Letterhead = lh
			doc.Signature = sig
		}
	}
	narrowed, err := reportdoc.Apply(doc, opts)
	if err != nil {
		return nil, err
	}
	if opts.Format == reportdoc.FormatPDF {
		return reportdoc.RenderPDF(narrowed)
	}
	return reportdoc.RenderXLSX(narrowed)
}

func writeXLSXBuffer(f *excelize.File) ([]byte, error) {
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, fmt.Errorf("write xlsx: %w", err)
	}
	return buf.Bytes(), nil
}
