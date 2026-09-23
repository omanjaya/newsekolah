package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

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
		rows[i] = []any{day.Date, string(day.StatusCode), arrival, departure, day.LateMinutes, day.EarlyLeaveMinutes, string(day.Source)}
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

// ExportMonthlyRecapReport renders one employee's monthly recap per opts
// (format, title override, letterhead visibility, column subset/order).
// Letterhead is always nil today: no tenant report-header reader is wired
// into this module yet, so opts.ShowLetterhead has no visible effect
// until one is (see apps/api/internal/platform/reportdoc's package
// comment for that follow-up).
func (s *Service) ExportMonthlyRecapReport(ctx context.Context, tenantID, employeeUserID uuid.UUID, month string, opts reportdoc.Options) ([]byte, error) {
	recap, err := s.GetMonthlyRecap(ctx, tenantID, employeeUserID, month)
	if err != nil {
		return nil, err
	}
	doc := reportdoc.Document{
		Title:   "Rekap Bulanan Presensi Pegawai",
		Scope:   []reportdoc.ScopeLine{{Label: "Bulan", Value: month}, {Label: "Pegawai", Value: recap.EmployeeName}},
		Columns: monthlyRecapColumns(),
		Sections: []reportdoc.Section{
			monthlyRecapSection(recap),
		},
	}
	return renderReport(doc, opts)
}

// ExportAllEmployeesMonthlyRecapReport is the tenant-wide counterpart to
// ExportMonthlyRecapReport: every tracked employee's recap for month, one
// reportdoc Section per employee.
func (s *Service) ExportAllEmployeesMonthlyRecapReport(ctx context.Context, tenantID uuid.UUID, month string, opts reportdoc.Options) ([]byte, error) {
	recaps, err := s.GetAllEmployeesMonthlyRecap(ctx, tenantID, month)
	if err != nil {
		return nil, err
	}
	sections := make([]reportdoc.Section, len(recaps))
	for i, recap := range recaps {
		sections[i] = monthlyRecapSection(recap)
	}
	doc := reportdoc.Document{
		Title:    "Rekap Bulanan Presensi Pegawai",
		Scope:    []reportdoc.ScopeLine{{Label: "Bulan", Value: month}},
		Columns:  monthlyRecapColumns(),
		Sections: sections,
	}
	return renderReport(doc, opts)
}
