package reportdoc

import (
	"errors"
	"fmt"
)

// Format selects the rendered file type.
type Format string

const (
	FormatXLSX Format = "xlsx"
	FormatPDF  Format = "pdf"
)

// Valid reports whether f is a Format this package understands.
func (f Format) Valid() bool {
	switch f {
	case FormatXLSX, FormatPDF:
		return true
	default:
		return false
	}
}

// ColumnChoice is one entry of an end user's column selection: which
// column (by its stable Key) and what to call it. An empty Label keeps
// the Document's own label.
type ColumnChoice struct {
	Key   string
	Label string
}

// Options is what an end user picked in the export dialog (or the
// equivalent query parameters), applied to a module-built Document
// before rendering.
type Options struct {
	Format Format
	// Title, when non-empty, replaces Document.Title.
	Title string
	// ShowLetterhead false drops Document.Letterhead even if the
	// module supplied one.
	ShowLetterhead bool
	// Columns is the chosen subset and order, keyed by Column.Key; an
	// empty slice keeps every column in the Document's own order.
	Columns []ColumnChoice
}

// ErrUnknownColumn is wrapped with the offending key by Apply when an
// Options.Columns entry names a column the Document does not have. The
// HTTP transport layer maps this to a 400 (docs/04-clean-code.md: a
// typed domain error, one place that turns it into a response code).
var ErrUnknownColumn = errors.New("reportdoc: unknown column")

// UnknownColumnError is the concrete error Apply returns; errors.Is
// against ErrUnknownColumn also matches it, and errors.As recovers the
// key for a validation detail.
type UnknownColumnError struct {
	Key string
}

func (e *UnknownColumnError) Error() string {
	return fmt.Sprintf("%s: %q", ErrUnknownColumn, e.Key)
}

func (e *UnknownColumnError) Unwrap() error { return ErrUnknownColumn }

// Apply narrows and relabels doc per opts, returning a new Document (doc
// itself is never mutated). An Options.Columns entry naming a key doc
// does not have returns *UnknownColumnError.
func Apply(doc Document, opts Options) (Document, error) {
	out := doc
	if opts.Title != "" {
		out.Title = opts.Title
	}
	if !opts.ShowLetterhead {
		out.Letterhead = nil
	}
	if len(opts.Columns) == 0 {
		return out, nil
	}

	indexByKey := make(map[string]int, len(doc.Columns))
	for i, c := range doc.Columns {
		indexByKey[c.Key] = i
	}

	selected := make([]int, len(opts.Columns))
	columns := make([]Column, len(opts.Columns))
	for i, choice := range opts.Columns {
		pos, ok := indexByKey[choice.Key]
		if !ok {
			return Document{}, &UnknownColumnError{Key: choice.Key}
		}
		col := doc.Columns[pos]
		if choice.Label != "" {
			col.Label = choice.Label
		}
		columns[i] = col
		selected[i] = pos
	}
	out.Columns = columns

	out.Sections = make([]Section, len(doc.Sections))
	for i, sec := range doc.Sections {
		out.Sections[i] = Section{
			Name:   sec.Name,
			Rows:   projectRows(sec.Rows, selected),
			Footer: projectRows(sec.Footer, selected),
		}
	}
	return out, nil
}

// projectRows picks and reorders each row's cells per selected (a list
// of source column indexes), tolerating rows shorter than doc.Columns
// (a defensive default: a short row contributes blank cells rather than
// panicking on an index out of range).
func projectRows(rows [][]any, selected []int) [][]any {
	if len(rows) == 0 {
		return rows
	}
	out := make([][]any, len(rows))
	for r, row := range rows {
		projected := make([]any, len(selected))
		for i, pos := range selected {
			if pos < len(row) {
				projected[i] = row[pos]
			}
		}
		out[r] = projected
	}
	return out
}
