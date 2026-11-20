package service

import (
	"testing"

	"github.com/go-pdf/fpdf"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// The monthly report's tables stop 20 mm above the page's bottom edge
// (reportdoc's content bottom); a heading line is 7 mm and a one-line
// header or data row 8 mm.
const (
	layoutBottomMM  = 20.0
	layoutHeadingMM = 7.0
	layoutRowMM     = 8.0
	layoutGapMM     = 3.0
)

func newMonthlyReportTestPDF() *fpdf.Fpdf {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(18, 16, 18)
	pdf.AddPage()
	return pdf
}

// placeBelowHeadingAndHeader puts the cursor where the heading and the
// header row still fit above the page foot but the first row does not.
func placeBelowHeadingAndHeader(pdf *fpdf.Fpdf) {
	_, pageH := pdf.GetPageSize()
	pdf.SetY(pageH - layoutBottomMM - layoutHeadingMM - layoutRowMM - 2)
}

// When only the heading and the header row fitted above the page foot, the
// "Kunjungan per Kelas" heading and an empty header were left at the bottom
// of page 1 with every row on page 2. The heading, the header and the first
// row now move to the next page together.
func TestMonthlyReportTableKeepsItsHeadingWithTheFirstRow(t *testing.T) {
	pdf := newMonthlyReportTestPDF()
	_, top, _, _ := pdf.GetMargins()
	placeBelowHeadingAndHeader(pdf)

	writeMonthlyReportTable(pdf, monthlyVisitsPerClassTable, [][]string{{"X-A", "2"}, {"Lainnya", "2"}})

	assert.Equal(t, 2, pdf.PageCount())
	assert.InDelta(t, top+layoutHeadingMM+layoutRowMM+2*layoutRowMM+layoutGapMM, pdf.GetY(), 0.01,
		"heading, header and both rows are drawn on the new page, with no second header")
}

// A tall first row (a title wrapping to three lines) counts in full.
func TestMonthlyReportTableMeasuresAWrappedFirstRow(t *testing.T) {
	pdf := newMonthlyReportTestPDF()
	_, pageH := pdf.GetPageSize()
	_, top, _, _ := pdf.GetMargins()
	long := "Ensiklopedia Lengkap Sejarah Kebudayaan dan Peradaban Nusantara dari Masa Prasejarah hingga Masa Kemerdekaan Republik Indonesia Jilid Pertama"
	// Heading, header and an 8 mm row would fit; the wrapped row does not.
	pdf.SetY(pageH - layoutBottomMM - layoutHeadingMM - 2*layoutRowMM - 1)

	row := []string{"1", long, "Tim Penyusun", "2"}
	pdf.SetFont(monthlyReportBodyFont())
	rowHeight := reportdoc.WrappedRowHeight(pdf, monthlyTopTitlesTable.widths, row)
	require.Greater(t, rowHeight, 2*layoutRowMM)

	writeMonthlyReportTable(pdf, monthlyTopTitlesTable, [][]string{row})

	assert.Equal(t, 2, pdf.PageCount())
	assert.InDelta(t, top+layoutHeadingMM+layoutRowMM+rowHeight+layoutGapMM, pdf.GetY(), 0.01,
		"the heading, the header and the wrapped row are all on page 2")
}

func TestMonthlyReportTableKeepsTheEmptyRowWithItsHeading(t *testing.T) {
	pdf := newMonthlyReportTestPDF()
	_, top, _, _ := pdf.GetMargins()
	placeBelowHeadingAndHeader(pdf)

	writeMonthlyReportTable(pdf, monthlyVisitsPerClassTable, nil)

	assert.Equal(t, 2, pdf.PageCount())
	assert.InDelta(t, top+layoutHeadingMM+2*layoutRowMM+layoutGapMM, pdf.GetY(), 0.01)
}

func TestMonthlyReportTableThatFitsStaysOnItsPage(t *testing.T) {
	pdf := newMonthlyReportTestPDF()
	_, pageH := pdf.GetPageSize()
	start := pageH - layoutBottomMM - layoutHeadingMM - 2*layoutRowMM
	pdf.SetY(start)

	writeMonthlyReportTable(pdf, monthlyVisitsPerClassTable, [][]string{{"X-A", "2"}})

	assert.Equal(t, 1, pdf.PageCount())
	assert.InDelta(t, start+layoutHeadingMM+2*layoutRowMM+layoutGapMM, pdf.GetY(), 0.01)
}
