package httpx

import "strings"

// ParseReportColumns decodes the "columns" query parameter contract every
// reportdoc-backed export shares (docs: reportdoc's own package comment):
// a comma-separated list of "key" or "key:label" entries. An entry with no
// ":" keeps the Document's own label for that column. Blank input returns
// nil, which reportdoc.Apply reads as "keep every column, in the
// Document's own order" -- the default every migrated export must keep
// for a caller that predates this query parameter.
func ParseReportColumns(raw string) []ReportColumnChoice {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]ReportColumnChoice, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		key, label, _ := strings.Cut(part, ":")
		out = append(out, ReportColumnChoice{Key: strings.TrimSpace(key), Label: strings.TrimSpace(label)})
	}
	return out
}

// ReportColumnChoice mirrors reportdoc.ColumnChoice's shape without this
// package importing reportdoc: httpx stays a leaf platform package with no
// sibling platform dependency, and each module's transport layer converts
// this into reportdoc.ColumnChoice (a one-line, zero-cost conversion) next
// to the reportdoc.Options it already builds from the other query params.
type ReportColumnChoice struct {
	Key   string
	Label string
}
