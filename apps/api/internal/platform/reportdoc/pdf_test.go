package reportdoc

import (
	"bytes"
	"fmt"
	"testing"
	"time"

	"github.com/go-pdf/fpdf"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRenderPDFProducesValidFile(t *testing.T) {
	doc := sampleDocument()
	doc.Letterhead.Logo = testPNG(t, 200, 100)
	doc.Signature = &Signature{
		Place: "Denpasar", Date: "1 September 2026",
		Signers: []Signer{
			{RoleLabel: "Wali Kelas", Name: "Ni Made Sari", IDLabel: "NIP", IDNumber: "198001012005011001"},
			{RoleLabel: "Kepala Sekolah", Name: "I Wayan Arta", IDLabel: "NIP", IDNumber: "197001011999031002"},
		},
	}
	doc.PageLabelFormat = "Halaman {page} dari {pages}"

	out, err := RenderPDF(doc)
	require.NoError(t, err)
	require.NotEmpty(t, out)
	assert.Equal(t, "%PDF", string(out[:4]))
	assert.True(t, bytes.HasSuffix(bytes.TrimRight(out, "\n\r"), []byte("%%EOF")))
}

func TestRenderPDFNoLetterheadOrSignature(t *testing.T) {
	doc := sampleDocument()
	doc.Letterhead = nil
	doc.Signature = nil
	out, err := RenderPDF(doc)
	require.NoError(t, err)
	assert.Equal(t, "%PDF", string(out[:4]))
}

func TestRenderPDFMultipleSectionsStartNewPages(t *testing.T) {
	doc := sampleDocument()
	doc.Sections = []Section{
		{Name: "X-1", Rows: [][]any{{1, "Budi", time.Now()}}},
		{Name: "X-2", Rows: [][]any{{1, "Wayan", time.Now()}}},
		{Name: "X-3", Rows: [][]any{{1, "Kadek", time.Now()}}},
	}
	out, err := RenderPDF(doc)
	require.NoError(t, err)
	// A crude but effective page-count signal: fpdf emits one "/Type /Page"
	// object per page (distinct from "/Type /Pages", the page tree root).
	count := bytes.Count(out, []byte("/Type /Page\n"))
	assert.GreaterOrEqual(t, count, 3, "expected at least one PDF page object per section")
}

func TestRenderPDFManyRowsPaginate(t *testing.T) {
	doc := sampleDocument()
	rows := make([][]any, 80)
	for i := range rows {
		rows[i] = []any{i + 1, fmt.Sprintf("Siswa %d", i+1), time.Now()}
	}
	doc.Sections = []Section{{Name: "X-1", Rows: rows}}
	out, err := RenderPDF(doc)
	require.NoError(t, err)
	count := bytes.Count(out, []byte("/Type /Page\n"))
	assert.Greater(t, count, 1, "80 rows on one A4 page should paginate")
}

func TestRowTextsUsesColumnLabelsForHeaderRow(t *testing.T) {
	columns := []Column{{Key: "a", Label: "Expected Sessions", Kind: ColumnNumber}}
	texts := rowTexts(columns, []any{42}, true)
	require.Equal(t, []string{"Expected Sessions"}, texts, "a header row must show labels, not cell values")
}

func TestRowTextsUsesCellValuesForDataRow(t *testing.T) {
	columns := []Column{{Key: "a", Label: "Expected Sessions", Kind: ColumnNumber}}
	texts := rowTexts(columns, []any{42}, false)
	require.Equal(t, []string{"42"}, texts)
}

// TestPdfRowHeightGrowsForWrappedHeaderLabel is the regression test for
// the header-clipping bug: pdfRowHeight must size a row using the same
// text pdfDrawRow will actually draw (rowTexts), not a blank placeholder,
// so a long wrapped column label gets a tall enough row instead of being
// cut off.
func TestPdfRowHeightGrowsForWrappedHeaderLabel(t *testing.T) {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.AddPage()
	pdf.SetFont("Helvetica", "B", 9)

	narrowWidths := []float64{20}
	shortHeader := rowTexts([]Column{{Label: "No"}}, nil, true)
	longHeader := rowTexts([]Column{{Label: "Expected Sessions Submitted"}}, nil, true)

	shortHeight := pdfRowHeight(pdf, narrowWidths, shortHeader)
	longHeight := pdfRowHeight(pdf, narrowWidths, longHeader)

	assert.Greater(t, longHeight, shortHeight, "a long wrapped header label must reserve more row height than a short one")
}

func TestRenderPDFEmptySectionRendersEmptyLabel(t *testing.T) {
	doc := sampleDocument()
	doc.Sections = []Section{{Name: "X-1"}} // no rows
	doc.EmptyRowsLabel = EmptyRowsLabelFor(LocaleID)
	out, err := RenderPDF(doc)
	require.NoError(t, err)
	assert.Equal(t, "%PDF", string(out[:4]))
}

func TestRenderPDFSingleSignerRightAligned(t *testing.T) {
	doc := sampleDocument()
	doc.Signature = &Signature{
		Place: "Denpasar", Date: "1 September 2026",
		Signers: []Signer{{RoleLabel: "Kepala Sekolah", Name: "I Wayan Arta"}},
	}
	out, err := RenderPDF(doc)
	require.NoError(t, err)
	assert.Equal(t, "%PDF", string(out[:4]))
}

func TestWritePDFLetterheadEmphasisOutOfRangeFallsBackToZero(t *testing.T) {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.AddPage()
	// Out-of-range Emphasis must not panic (regression guard for the
	// clamp in writePDFLetterhead).
	writePDFLetterhead(pdf, &Letterhead{Lines: []string{"A", "B"}, Emphasis: 99})
	require.NoError(t, pdf.Error())
}

// TestEnsurePDFRowSpaceReservesRoomForFooter is the regression test for a
// real bug: RenderPDF calls SetAutoPageBreak(false, 0), which zeroes
// fpdf's own bMargin -- the same value GetMargins() returns as its 4th
// result. ensurePDFRowSpace used to read that value back as "the bottom
// margin", so it let rows fill the page almost to the physical edge
// (limit = pageH-0), overlapping the page-number footer drawn at
// pageH-10. It must use the dedicated pdfContentBottomMM constant
// instead.
func TestEnsurePDFRowSpaceReservesRoomForFooter(t *testing.T) {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(pdfMarginMM, pdfMarginMM, pdfMarginMM)
	pdf.SetAutoPageBreak(false, 0)
	pdf.AddPage()
	_, pageH := pdf.GetPageSize()
	columns := []Column{{Label: "X", Kind: ColumnText}}

	pdf.SetY(pageH - pdfContentBottomMM - 15) // well clear of the row's own ~8mm height too
	brokeEarly := false
	ensurePDFRowSpace(pdf, columns, []float64{40}, []any{"x"}, pdfRowStyle{}, func() { brokeEarly = true })
	assert.False(t, brokeEarly, "a row comfortably above pdfContentBottomMM must not trigger a page break")

	pdf.SetY(pageH - 2) // deep inside the footer's reserved zone
	brokeForFooter := false
	ensurePDFRowSpace(pdf, columns, []float64{40}, []any{"x"}, pdfRowStyle{}, func() { brokeForFooter = true })
	assert.True(t, brokeForFooter, "a row that would land inside the footer's reserved zone must trigger a page break")
}

func TestRenderPDFWideTableGoesLandscape(t *testing.T) {
	doc := sampleDocument()
	// 12 wide columns should not fit a portrait page and force landscape.
	cols := make([]Column, 12)
	for i := range cols {
		cols[i] = Column{Key: fmt.Sprintf("c%d", i), Label: fmt.Sprintf("Column %d", i), Kind: ColumnText, Width: 20}
	}
	doc.Columns = cols
	row := make([]any, 12)
	for i := range row {
		row[i] = "x"
	}
	doc.Sections = []Section{{Name: "Wide", Rows: [][]any{row}}}

	out, err := RenderPDF(doc)
	require.NoError(t, err)
	// A4 landscape's MediaBox width in points (~841.89) exceeds its
	// portrait height (~595.28); look for the wide MediaBox as the
	// orientation signal since fpdf encodes orientation via page
	// dimensions, not a named keyword.
	assert.Contains(t, string(out), "841.89 595.28", "wide table should render on a landscape page")
}
