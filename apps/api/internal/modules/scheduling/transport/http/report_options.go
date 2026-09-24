package http

import (
	"strings"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// reportdocOptions decodes the shared reportdoc query-param contract
// (docs/05-shared-components.md, "Laporan dan ekspor": title, letterhead,
// columns -- openapi/modules/_shared.yaml's ReportTitleParam et al. --
// plus format, which this endpoint declares locally since it also
// accepts "docx", not one of reportdoc.Format's two values) into
// reportdoc.Options. Every parameter is optional; leaving all of them out
// (an unmigrated caller, including the mobile app) produces the zero
// Options that keeps a report's old default rendering: xlsx, every
// column, letterhead on. Mirrors attendance/transport/http's identically
// named helper (duplicated, not shared, per docs/03-layered-
// architecture.md section 1: transport packages own their own request
// parsing).
func reportdocOptions(pdf bool, title *string, letterhead *bool, columns *string) reportdoc.Options {
	opts := reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true}
	if pdf {
		opts.Format = reportdoc.FormatPDF
	}
	if title != nil {
		opts.Title = *title
	}
	if letterhead != nil {
		opts.ShowLetterhead = *letterhead
	}
	if columns != nil && *columns != "" {
		opts.Columns = parseColumnChoices(*columns)
	}
	return opts
}

// parseColumnChoices splits "columns" into its comma-separated entries,
// each either a bare column key or "key:label" to rename that column.
func parseColumnChoices(raw string) []reportdoc.ColumnChoice {
	parts := strings.Split(raw, ",")
	choices := make([]reportdoc.ColumnChoice, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		key, label, _ := strings.Cut(part, ":")
		choices = append(choices, reportdoc.ColumnChoice{Key: strings.TrimSpace(key), Label: strings.TrimSpace(label)})
	}
	return choices
}
