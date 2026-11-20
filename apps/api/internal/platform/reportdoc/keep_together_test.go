package reportdoc

import (
	"testing"

	"github.com/go-pdf/fpdf"
	"github.com/stretchr/testify/assert"
)

const oneLineRowMM = pdfCellLineHeightMM + 2*pdfCellPadMM

func TestKeepTogetherBreaksOnlyWhenTheBlockDoesNotFit(t *testing.T) {
	pdf := newWrappedRowPDF()
	_, pageH := pdf.GetPageSize()
	limit := pageH - pdfContentBottomMM

	pdf.SetY(limit - 20)
	assert.False(t, KeepTogether(pdf, 20), "a block that ends on the limit fits")
	assert.Equal(t, 1, pdf.PageCount())

	assert.True(t, KeepTogether(pdf, 21))
	assert.Equal(t, 2, pdf.PageCount())
	_, top, _, _ := pdf.GetMargins()
	assert.InDelta(t, top, pdf.GetY(), 0.01)

	// At the top of a page, or for a block taller than a whole page, a new
	// page would only add a blank one.
	assert.False(t, KeepTogether(pdf, pageH))
	pdf.SetY(limit - 5)
	assert.False(t, KeepTogether(pdf, pageH))
	assert.Equal(t, 2, pdf.PageCount())
}

func TestWrappedRowHeightMatchesTheDrawnRow(t *testing.T) {
	pdf := newWrappedRowPDF()
	widths := []float64{10, 40}
	texts := []string{"1", "Kamus Besar Bahasa Indonesia Edisi Kelima"}
	height := WrappedRowHeight(pdf, widths, texts)
	start := pdf.GetY()
	DrawWrappedRow(pdf, widths, texts, nil)
	assert.InDelta(t, start+height, pdf.GetY(), 0.01)
}

func newSectionPDF() *fpdf.Fpdf {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(pdfMarginMM, pdfMarginMM, pdfMarginMM)
	pdf.SetAutoPageBreak(false, 0)
	pdf.AddPage()
	return pdf
}

// A section that started where only its heading and header row fitted
// left both at the foot of the page, with every row on the next page under
// a repeated header. The section now starts on the next page as a whole.
func TestWritePDFSectionKeepsItsHeadingAndHeaderWithTheFirstRow(t *testing.T) {
	columns := []Column{{Key: "name", Label: "Nama", Kind: ColumnText}, {Key: "n", Label: "Jumlah", Kind: ColumnNumber}}
	widths := []float64{90, 40}
	section := Section{Name: "X-1", Rows: [][]any{{"Budi", 2}, {"Wayan", 3}}}

	pdf := newSectionPDF()
	_, pageH := pdf.GetPageSize()
	pdf.SetY(pageH - pdfContentBottomMM - pdfSectionHeadingMM - oneLineRowMM - 2)

	writePDFSection(pdf, columns, widths, section, "")

	assert.Equal(t, 2, pdf.PageCount())
	assert.InDelta(t, pdfMarginMM+pdfSectionHeadingMM+3*oneLineRowMM+2, pdf.GetY(), 0.01,
		"heading, header and both rows are on the new page, with no second header")

	// With room for the first row too, the section stays where it is.
	pdf = newSectionPDF()
	start := pageH - pdfContentBottomMM - pdfSectionHeadingMM - 2*oneLineRowMM
	pdf.SetY(start)
	writePDFSection(pdf, columns, widths, Section{Name: "X-1", Rows: [][]any{{"Budi", 2}}}, "")
	assert.Equal(t, 1, pdf.PageCount())
	assert.InDelta(t, start+pdfSectionHeadingMM+2*oneLineRowMM+2, pdf.GetY(), 0.01)
}

func TestWritePDFSectionKeepsTheEmptyLabelWithItsHeader(t *testing.T) {
	columns := []Column{{Key: "name", Label: "Nama", Kind: ColumnText}}
	pdf := newSectionPDF()
	_, pageH := pdf.GetPageSize()
	pdf.SetY(pageH - pdfContentBottomMM - pdfSectionHeadingMM - oneLineRowMM - 2)

	writePDFSection(pdf, columns, []float64{90}, Section{Name: "X-1"}, "Tidak ada data")

	assert.Equal(t, 2, pdf.PageCount())
	assert.InDelta(t, pdfMarginMM+pdfSectionHeadingMM+2*oneLineRowMM+2, pdf.GetY(), 0.01)
}
