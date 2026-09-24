// Package reportdoc renders a generic tabular report -- a class list, a
// grade recap, a discipline export, anything with a letterhead, a title, a
// header row and rows of typed cells -- into XLSX or PDF. It is a leaf
// platform package: no database access, no module import, the same
// constraint documents already follows (see platform/documents). Callers
// build a Document from their own data, optionally let the end user
// customise it through Apply, then hand the result to RenderXLSX or
// RenderPDF.
//
// This package is the foundation other report exports are meant to
// migrate onto. See docs/05-shared-components.md, "Laporan dan ekspor",
// for the query-param contract an HTTP handler decodes into Options and a
// step-by-step migration checklist.
//
// reportdoc itself never reads a database or knows what a tenant is. The
// module that owns tenant branding (apps/api/internal/modules/school)
// exposes the tenant's configured letterhead/default signature through its
// own service; other modules consume that via a narrow reader interface
// they define themselves and wire through apps/api/internal/wiring, the
// same cross-module pattern every other module uses
// (docs/03-layered-architecture.md section 1).
package reportdoc

// ColumnKind tells RenderXLSX how to type a cell and RenderPDF how to
// align and format it.
type ColumnKind string

const (
	ColumnText    ColumnKind = "text"
	ColumnNumber  ColumnKind = "number"
	ColumnDate    ColumnKind = "date"
	ColumnPercent ColumnKind = "percent"
)

// Valid reports whether k is one of the known column kinds.
func (k ColumnKind) Valid() bool {
	switch k {
	case ColumnText, ColumnNumber, ColumnDate, ColumnPercent:
		return true
	default:
		return false
	}
}

// Column describes one column shared by every Section's Rows: a stable
// Key (what Options.Columns refers to, never shown to a user and never
// changed even when Label is renamed), a display Label, a Kind, and a
// Width hint. Width is a relative unit matching Excel's own column-width
// unit (characters of the default font); RenderPDF derives millimetres
// from it so the two renderers stay visually proportional. Width <= 0
// falls back to a sane default in both renderers.
type Column struct {
	Key   string
	Label string
	Kind  ColumnKind
	Width float64
}

// ScopeLine is one "Label: Value" line printed under the title -- e.g.
// {"Kelas", "X-1"} or {"Periode", "September 2026"} -- so a downloaded
// file is self-describing without the screen it came from.
type ScopeLine struct {
	Label string
	Value string
}

// Section is one independent block of rows: one sheet in an XLSX
// workbook, one page group in a PDF (RenderPDF always starts a new
// section on a new page and prints its Name as a heading). A report
// scoped to a single class has one Section; a report scoped to a whole
// grade level (angkatan) has one Section per class in it.
type Section struct {
	Name string
	// Rows holds one []any per row, each element ordered to match
	// Document.Columns and typed to match that column's Kind: string for
	// ColumnText, a numeric Go type for ColumnNumber/ColumnPercent (a
	// percent is a fraction, e.g. 0.5 for 50%), time.Time for ColumnDate.
	// nil renders as a blank cell.
	Rows [][]any
	// Footer holds zero or more extra rows rendered below Rows with a
	// visually distinct style (e.g. a totals row). Same per-column typing
	// as Rows.
	Footer [][]any
}

// Letterhead is a school's kop laporan: an optional logo image and one to
// five text lines (foundation, school name, address, contact) printed as
// a centered block above the title, matching an Indonesian kop surat.
// Logo, when non-empty, must be PNG, JPEG or GIF; the format is sniffed
// from content, matching platform/documents.
type Letterhead struct {
	Logo []byte
	// Lines is one to five text lines, e.g. {"Yayasan ...", "SMA Negeri
	// 1 Denpasar", "Jl. Merdeka No. 1", "Telp. ..."}.
	Lines []string
	// Emphasis is the index into Lines that is the school name: rendered
	// bold and larger than every other line, the way a kop surat makes
	// the school's own name visually dominant. Out of range (including
	// the zero value when Lines is non-empty and index 0 is not
	// intended) falls back to index 0.
	Emphasis int
}

// Signer is one line of a signature block: a role ("Kepala Sekolah"), a
// name, and an optional identifier label/number pair (e.g. "NIP" /
// "198001012005011001").
type Signer struct {
	RoleLabel string
	Name      string
	IDLabel   string
	IDNumber  string
}

// Signature is the block printed under a report's table: where and when
// it was issued, and who signs it.
type Signature struct {
	Place   string
	Date    string
	Signers []Signer
}

// Document is a fully assembled report, ready to render. Build one from
// your own module's data, then call RenderXLSX or RenderPDF (typically
// after narrowing it with Apply so the caller's Options are honoured).
type Document struct {
	Letterhead *Letterhead
	Title      string
	Scope      []ScopeLine
	Columns    []Column
	Sections   []Section
	Signature  *Signature
	// PageLabelFormat is RenderPDF's page-number footer template. It may
	// contain the literal placeholders "{page}" (current page) and
	// "{pages}" (total page count), e.g. the Indonesian "Halaman {page}
	// dari {pages}". Empty means RenderPDF prints no page-number footer.
	// The package intentionally does not hardcode this text -- it stays a
	// leaf package with no i18n catalogue of its own (docs/04-clean-code.md:
	// user-facing text goes through the caller's own i18n, never
	// hardcoded in a platform package).
	PageLabelFormat string
	// EmptyRowsLabel is printed as a single row (spanning every column)
	// in place of a section with zero Rows, e.g. the Indonesian "Tidak
	// ada data" -- caller-supplied text, same reasoning as
	// PageLabelFormat. Empty means a section with no rows renders no
	// rows at all (just its header).
	EmptyRowsLabel string
}
