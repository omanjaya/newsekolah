package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// statusLabel maps a StatusCode onto the Indonesian label the web app's
// own "app.staffAttendance.statuses" catalogue uses, so the export and
// the screen never disagree about what a status is called.
func statusLabel(code domain.StatusCode) string {
	switch code {
	case domain.StatusPresent:
		return "Hadir"
	case domain.StatusLate:
		return "Terlambat"
	case domain.StatusAbsent:
		return "Tidak hadir"
	case domain.StatusOnLeave:
		return "Cuti atau izin"
	case domain.StatusHoliday:
		return "Libur"
	case domain.StatusIncomplete:
		return "Belum lengkap"
	default:
		return string(code)
	}
}

// sourceLabel maps a Source onto the Indonesian label the web app's own
// "app.staffAttendance.sources" catalogue uses.
func sourceLabel(source domain.Source) string {
	switch source {
	case domain.SourceQR:
		return "Pindai QR"
	case domain.SourceManual:
		return "Entri manual"
	case domain.SourceImport:
		return "Impor perangkat"
	default:
		return string(source)
	}
}

// indonesianMonths is the month-name half of reportdoc.FormatDate a
// "Bulan" (month/year, no day) scope line needs and reportdoc.FormatDate
// does not expose on its own (it always anchors on a specific day).
var indonesianMonths = [...]string{
	"Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember",
}

// monthScopeValue turns a "YYYY-MM" month string into a locale-correct
// "<Month> <Year>" for a report's scope line, falling back to the raw
// string if it does not parse.
func monthScopeValue(locale, month string) string {
	t, err := time.Parse("2006-01", month)
	if err != nil {
		return month
	}
	if locale == reportdoc.LocaleID {
		return indonesianMonths[t.Month()-1] + " " + t.Format("2006")
	}
	return t.Format("January 2006")
}

// monthlyRecapColumns is the stable column set every monthly recap export
// shares (the per-employee export and the tenant-wide one below): a
// day-by-day breakdown with the same shape ExportMonthlyRecapXLSX wrote by
// hand before this module moved onto reportdoc.
func monthlyRecapColumns() []reportdoc.Column {
	return []reportdoc.Column{
		{Key: "date", Label: "Tanggal", Kind: reportdoc.ColumnDate, Width: 14},
		{Key: "status", Label: "Status", Kind: reportdoc.ColumnText, Width: 12},
		{Key: "arrival", Label: "Kedatangan", Kind: reportdoc.ColumnText, Width: 12},
		{Key: "departure", Label: "Kepulangan", Kind: reportdoc.ColumnText, Width: 12},
		{Key: "late_minutes", Label: "Terlambat (menit)", Kind: reportdoc.ColumnNumber, Width: 14},
		{Key: "early_leave_minutes", Label: "Pulang Cepat (menit)", Kind: reportdoc.ColumnNumber, Width: 16},
		{Key: "source", Label: "Sumber", Kind: reportdoc.ColumnText, Width: 10},
	}
}

// monthlyRecapSection turns one employee's MonthlyRecap into a reportdoc
// Section: one row per day, plus a totals footer row carrying the two
// figures the old hand-written export printed below the table.
func monthlyRecapSection(recap MonthlyRecap) reportdoc.Section {
	rows := make([][]any, len(recap.Days))
	for i, day := range recap.Days {
		arrival, departure := "", ""
		if day.ArrivalAt != nil {
			arrival = day.ArrivalAt.Format("15:04")
		}
		if day.DepartureAt != nil {
			departure = day.DepartureAt.Format("15:04")
		}
		rows[i] = []any{day.Date, statusLabel(day.StatusCode), arrival, departure, day.LateMinutes, day.EarlyLeaveMinutes, sourceLabel(day.Source)}
	}
	name := recap.EmployeeName
	if name == "" {
		name = recap.EmployeeUserID.String()
	}
	return reportdoc.Section{
		Name: name,
		Rows: rows,
		Footer: [][]any{
			{nil, "Total", nil, nil, recap.TotalLateMinutes, recap.TotalEarlyLeaveMinutes, nil},
		},
	}
}

// renderReport applies opts to doc and renders it in the format opts
// requests, defaulting to XLSX when the caller (or an old client that
// predates this query-param contract) did not name one.
func renderReport(doc reportdoc.Document, opts reportdoc.Options) ([]byte, error) {
	narrowed, err := reportdoc.Apply(doc, opts)
	if err != nil {
		return nil, err
	}
	if opts.Format == reportdoc.FormatPDF {
		return reportdoc.RenderPDF(narrowed)
	}
	return reportdoc.RenderXLSX(narrowed)
}

// withLetterhead loads tenantID's configured kop laporan (nil source or a
// tenant that has not configured one both degrade to "no letterhead"
// rather than an error) and attaches it to doc, so every export in this
// file only has to call this once instead of repeating the nil checks.
func (s *Service) withLetterhead(ctx context.Context, tenantID uuid.UUID, doc reportdoc.Document) reportdoc.Document {
	if s.letterhead == nil {
		return doc
	}
	lh, sig, err := s.letterhead.Letterhead(ctx, tenantID)
	if err != nil {
		return doc
	}
	doc.Letterhead = lh
	if doc.Signature == nil {
		doc.Signature = sig
	}
	return doc
}

// ExportMonthlyRecapReport renders one employee's monthly recap per opts
// (format, title override, letterhead visibility, column subset/order),
// following locale (the caller's resolved tenant locale) for every piece
// of generated text: the scope line, the PDF page-number footer, and the
// empty-section placeholder.
func (s *Service) ExportMonthlyRecapReport(ctx context.Context, tenantID, employeeUserID uuid.UUID, month, locale string, opts reportdoc.Options) ([]byte, error) {
	recap, err := s.GetMonthlyRecap(ctx, tenantID, employeeUserID, month)
	if err != nil {
		return nil, err
	}
	doc := reportdoc.Document{
		Title:           "Rekap Bulanan Presensi Pegawai",
		Scope:           []reportdoc.ScopeLine{{Label: "Bulan", Value: monthScopeValue(locale, month)}, {Label: "Pegawai", Value: recap.EmployeeName}},
		Columns:         monthlyRecapColumns(),
		Sections:        []reportdoc.Section{monthlyRecapSection(recap)},
		PageLabelFormat: reportdoc.PageLabel(locale),
		EmptyRowsLabel:  reportdoc.EmptyRowsLabelFor(locale),
	}
	doc = s.withLetterhead(ctx, tenantID, doc)
	return renderReport(doc, opts)
}

// ExportAllEmployeesMonthlyRecapReport is the tenant-wide counterpart to
// ExportMonthlyRecapReport: every tracked employee's recap for month, one
// reportdoc Section per employee.
func (s *Service) ExportAllEmployeesMonthlyRecapReport(ctx context.Context, tenantID uuid.UUID, month, locale string, opts reportdoc.Options) ([]byte, error) {
	recaps, err := s.GetAllEmployeesMonthlyRecap(ctx, tenantID, month)
	if err != nil {
		return nil, err
	}
	sections := make([]reportdoc.Section, len(recaps))
	for i, recap := range recaps {
		sections[i] = monthlyRecapSection(recap)
	}
	doc := reportdoc.Document{
		Title:           "Rekap Bulanan Presensi Pegawai",
		Scope:           []reportdoc.ScopeLine{{Label: "Bulan", Value: monthScopeValue(locale, month)}},
		Columns:         monthlyRecapColumns(),
		Sections:        sections,
		PageLabelFormat: reportdoc.PageLabel(locale),
		EmptyRowsLabel:  reportdoc.EmptyRowsLabelFor(locale),
	}
	doc = s.withLetterhead(ctx, tenantID, doc)
	return renderReport(doc, opts)
}
