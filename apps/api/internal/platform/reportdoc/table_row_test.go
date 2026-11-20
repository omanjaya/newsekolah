package reportdoc

import (
	"bytes"
	"strings"
	"testing"

	"github.com/go-pdf/fpdf"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newWrappedRowPDF() *fpdf.Fpdf {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(18, 16, 18)
	pdf.SetCompression(false)
	pdf.AddPage()
	pdf.SetFont("Helvetica", "", 8)
	return pdf
}

// A title longer than its 90 mm column used to be printed on one line
// over the author and count columns and off the page; it now wraps, and
// the row grows to hold it.
func TestDrawWrappedRowWrapsLongTextInsideItsColumn(t *testing.T) {
	pdf := newWrappedRowPDF()
	widths := []float64{10, 90, 60, 14}
	long := strings.Repeat("Kamus Besar Bahasa Indonesia Edisi Kelima ", 6)
	startY := pdf.GetY()

	DrawWrappedRow(pdf, widths, []string{"3", long, "Tim Penyusun", "4"}, nil)

	lines := len(pdf.SplitLines([]byte(long), 90-2*pdfCellPadMM))
	require.Greater(t, lines, 1)
	assert.InDelta(t, startY+float64(lines)*pdfCellLineHeightMM+2*pdfCellPadMM, pdf.GetY(), 0.01,
		"the row is as tall as its wrapped title")
	left, _, _, _ := pdf.GetMargins()
	assert.InDelta(t, left, pdf.GetX(), 0.01, "the next row starts at the left margin")

	var out bytes.Buffer
	require.NoError(t, pdf.Output(&out))
	// Every wrapped line stays a separate text run, so no single line holds
	// the whole title.
	assert.NotContains(t, out.String(), "("+long+")")
	assert.Contains(t, out.String(), "(Tim Penyusun)")
}

func TestDrawWrappedRowStartsANewPageUnderARepeatedHeader(t *testing.T) {
	pdf := newWrappedRowPDF()
	_, pageH := pdf.GetPageSize()
	pdf.SetY(pageH - pdfContentBottomMM - 3)
	headers := 0
	DrawWrappedRow(pdf, []float64{100}, []string{"Baris terakhir"}, func() {
		headers++
		DrawWrappedRow(pdf, []float64{100}, []string{"Judul"}, nil)
	})
	assert.Equal(t, 2, pdf.PageCount())
	assert.Equal(t, 1, headers)
	_, top, _, _ := pdf.GetMargins()
	assert.InDelta(t, top+2*(pdfCellLineHeightMM+2*pdfCellPadMM), pdf.GetY(), 0.01,
		"header then row at the top of the new page")
}
