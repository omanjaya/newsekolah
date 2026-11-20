package reportdoc

import "github.com/go-pdf/fpdf"

// DrawWrappedRow draws one bordered table row of plain-text cells for a
// module that lays out its own PDF (the library's monthly report): each
// cell's text wraps inside its column and the row is as tall as its
// tallest cell, the same way RenderPDF draws its tables. fpdf's CellFormat
// is single-line and neither wraps nor clips, so a long title printed over
// the next columns and off the page.
//
// The row is measured with the current font, so set it first. When the
// row would cross the bottom of the page it starts a new page and calls
// onNewPage (may be nil), which redraws the table header and sets the body
// font again, before the row is drawn there.
func DrawWrappedRow(pdf *fpdf.Fpdf, widths []float64, texts []string, onNewPage func()) {
	height := pdfRowHeight(pdf, widths, texts)
	_, pageH := pdf.GetPageSize()
	if pdf.GetY()+height > pageH-pdfContentBottomMM {
		pdf.AddPage()
		if onNewPage != nil {
			onNewPage()
			height = pdfRowHeight(pdf, widths, texts)
		}
	}
	left, _, _, _ := pdf.GetMargins()
	y := pdf.GetY()
	x := left
	for i, w := range widths {
		text := ""
		if i < len(texts) {
			text = texts[i]
		}
		pdf.Rect(x, y, w, height, "D")
		pdf.SetXY(x+pdfCellPadMM, y+pdfCellPadMM)
		pdf.MultiCell(w-2*pdfCellPadMM, pdfCellLineHeightMM, text, "", "L", false)
		x += w
	}
	pdf.SetXY(left, y+height)
}

// WrappedCellLines is how many lines text takes in a DrawWrappedRow cell
// of the given column width, measured with the current font. A layout test
// uses it to check that every header label fits its column on one line:
// fpdf breaks a single word that is wider than the cell mid-word.
func WrappedCellLines(pdf *fpdf.Fpdf, width float64, text string) int {
	return len(pdf.SplitLines([]byte(text), width-2*pdfCellPadMM))
}
