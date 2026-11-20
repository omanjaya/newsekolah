package documents

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// naturalWidth is the width columnWidths gives a cell that fits.
func naturalWidth(t *testing.T, text string) float64 {
	t.Helper()
	pdf := newPDF()
	tr := pdf.UnicodeTranslatorFromDescriptor("")
	return pdf.GetStringWidth(tr(text)) + 2*cellPaddingMM + 2*pdf.GetCellMargin() + 0.5
}

// TestColumnWidthsFullWidthKeepsNarrowColumns pins the receipt whose long
// fee name squeezed the amount onto two lines ("Rp" / "1.275.000"): a
// full-width table that does not fit shrinks only its wide column.
func TestColumnWidthsFullWidthKeepsNarrowColumns(t *testing.T) {
	name := strings.Repeat("Uang Kegiatan Class Meeting dan Studi Tour ", 2)[:70]
	table := layoutTable{FullWidth: true, Border: true, Rows: []layoutRow{
		{Cells: []layoutCell{{Text: "Tagihan", Bold: true}, {Text: "Periode", Bold: true}, {Text: "Jumlah", Bold: true}}},
		{Cells: []layoutCell{{Text: name}, {Text: "2026-classmeeting"}, {Text: "Rp 1.275.000"}}},
	}}
	pdf := newPDF()
	widths := columnWidths(pdf, pdf.UnicodeTranslatorFromDescriptor(""), table)

	require.GreaterOrEqual(t, widths[2], naturalWidth(t, "Rp 1.275.000"))
	require.GreaterOrEqual(t, widths[1], naturalWidth(t, "2026-classmeeting"))
	pageW, _ := pdf.GetPageSize()
	require.InDelta(t, pageW-2*pageMarginMM, widths[0]+widths[1]+widths[2], 0.01)
	require.Len(t, pdf.SplitText("Rp 1.275.000", widths[2]-2*cellPaddingMM), 1)
}

// TestColumnWidthsFullWidthExpands keeps a fitting full-width table
// stretched to the printable width, equal columns for a signature block.
func TestColumnWidthsFullWidthExpands(t *testing.T) {
	table := layoutTable{FullWidth: true, Rows: []layoutRow{
		{Cells: []layoutCell{{Text: "Orang tua"}, {Text: "Wali kelas"}}},
	}}
	pdf := newPDF()
	widths := columnWidths(pdf, pdf.UnicodeTranslatorFromDescriptor(""), table)
	pageW, _ := pdf.GetPageSize()
	require.InDelta(t, (pageW-2*pageMarginMM)/2, widths[0], 0.01)
	require.InDelta(t, widths[0], widths[1], 0.01)
}

// TestDrawTableSplitsRowTallerThanAPage pins a custom template whose one
// table cell held 1500 words: it printed 68 pages, the first one blank.
// The row now starts on the current page and continues page by page.
func TestDrawTableSplitsRowTallerThanAPage(t *testing.T) {
	words := make([]string, 1500)
	for i := range words {
		words[i] = "kata"
	}
	table := layoutTable{FullWidth: true, Border: true, Rows: []layoutRow{
		{Cells: []layoutCell{{Text: strings.Join(words, " ")}}},
	}}
	pdf := newPDF()
	tr := pdf.UnicodeTranslatorFromDescriptor("")
	widths := columnWidths(pdf, tr, table)
	lines := len(pdf.SplitText(table.Rows[0].Cells[0].Text, widths[0]-2*cellPaddingMM))
	_, pageH := pdf.GetPageSize()
	perPage := linesThatFit(pageMarginMM, pageH-pageMarginMM)

	drawTable(pdf, tr, table)

	require.NoError(t, pdf.Error())
	require.Equal(t, (lines+perPage-1)/perPage, pdf.PageNo())
	// The cursor sits right after the row's last line on the last page.
	last := lines - (pdf.PageNo()-1)*perPage
	require.InDelta(t, pageMarginMM+float64(last)*lineHeightMM, pdf.GetY(), 0.01)
}

// TestDrawTableMovesFittingRowToNextPage keeps a row that fits a page
// whole: it moves to the next page instead of splitting.
func TestDrawTableMovesFittingRowToNextPage(t *testing.T) {
	pdf := newPDF()
	tr := pdf.UnicodeTranslatorFromDescriptor("")
	_, pageH := pdf.GetPageSize()
	pdf.SetY(pageH - pageMarginMM - lineHeightMM*1.5)
	table := layoutTable{Rows: []layoutRow{{Cells: []layoutCell{{Text: "Satu\nDua"}}}}}

	drawTable(pdf, tr, table)

	require.Equal(t, 2, pdf.PageNo())
	require.InDelta(t, pageMarginMM+2*lineHeightMM, pdf.GetY(), 0.01)
}
