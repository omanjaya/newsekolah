package http

import (
	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// reportdocOptions decodes the shared reportdoc query-param contract
// (docs/05-shared-components.md, "Laporan dan ekspor": format, title,
// letterhead, columns -- openapi/modules/_shared.yaml's ReportFormatParam
// et al.) into reportdoc.Options, using httpx.ParseReportColumns for the
// "columns" param (shared across every reportdoc-backed export, per that
// function's own doc comment). Every parameter is optional; leaving all
// of them out (an unmigrated caller, including the mobile app) produces
// the zero Options that keeps a report's old default rendering: xlsx,
// every column, letterhead on. Mirrors attendance/academic/scheduling's
// identically named helpers (duplicated, not shared, per docs/03-layered-
// architecture.md section 1: transport packages own their own request
// parsing).
func reportdocOptions(format *api.ExportGradebookParamsFormat, title *string, letterhead *bool, columns *string) reportdoc.Options {
	opts := reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true}
	if format != nil && *format == api.ExportGradebookParamsFormatPdf {
		opts.Format = reportdoc.FormatPDF
	}
	if title != nil {
		opts.Title = *title
	}
	if letterhead != nil {
		opts.ShowLetterhead = *letterhead
	}
	if columns != nil {
		for _, choice := range httpx.ParseReportColumns(*columns) {
			opts.Columns = append(opts.Columns, reportdoc.ColumnChoice{Key: choice.Key, Label: choice.Label})
		}
	}
	return opts
}
