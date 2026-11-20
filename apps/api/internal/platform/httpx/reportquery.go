package httpx

import (
	"net/url"
	"strings"
)

// ParseReportColumns decodes the "columns" query parameter contract every
// reportdoc-backed export shares (docs: reportdoc's own package comment):
// a comma-separated list of "key" or "key:label" entries. An entry with no
// ":" keeps the Document's own label for that column. The label half is
// percent-encoded by the client on its own (encodeURIComponent, before the
// whole query string's own encoding pass) so a comma or colon in a
// user-typed label cannot split the list; it is decoded here with
// url.PathUnescape ("+" stays a literal plus), and a label that is not
// valid percent-encoding is kept as sent. Blank input returns
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
		if decoded, err := url.PathUnescape(label); err == nil {
			label = decoded
		}
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
