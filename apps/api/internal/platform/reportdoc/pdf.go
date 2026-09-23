package reportdoc

import (
	"bytes"
	"fmt"
	"image"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
)

const (
	pdfMarginMM           = 15.0
	pdfCellLineHeightMM   = 5.0
	pdfCellPadMM          = 1.5
	pdfMMPerWidthUnit     = 1.7 // Column.Width (Excel "characters") -> millimetres at the table's 9pt font
	pdfPortraitContentMM  = 210 - 2*pdfMarginMM
	pdfLandscapeContentMM = 297 - 2*pdfMarginMM
	pdfLogoHeightMM       = 16.0
	pdfMinColWidthMM      = 14.0
)

var (
	pdfHeaderFill = [3]int{31, 41, 55}    // slate-800, matches RenderXLSX's header fill
	pdfZebraFill  = [3]int{243, 244, 246} // gray-100
	pdfBorder     = [3]int{156, 163, 175} // gray-400
	pdfFooterFill = [3]int{229, 231, 235} // gray-200
)

// RenderPDF renders doc as an A4 PDF: a letterhead (logo + rule line), the
// title, the scope lines, then one page group per Section -- a heading
// (when the section is named), a table with its header row repeated on
// every page, zebra-striped wrapped-text rows, an optional totals block,
// and finally a signature block kept on one page. Orientation is chosen
// from the columns' total width; a page-number footer is printed when
// Document.PageLabelFormat is set.
func RenderPDF(doc Document) ([]byte, error) {
	orientation, widths := pdfColumnWidths(doc.Columns)

	pdf := fpdf.New(orientation, "mm", "A4", "")
	pdf.SetMargins(pdfMarginMM, pdfMarginMM, pdfMarginMM)
	pdf.SetAutoPageBreak(false, 0)
	pdf.AliasNbPages("{nb}")
	pdf.SetFont("Helvetica", "", 10)

	if doc.PageLabelFormat != "" {
		pdf.SetFooterFunc(func() {
			_, pageH := pdf.GetPageSize()
			pdf.SetY(pageH - 10)
			pdf.SetFont("Helvetica", "", 8)
			pdf.SetTextColor(107, 114, 128)
			text := strings.NewReplacer("{page}", strconv.Itoa(pdf.PageNo()), "{pages}", "{nb}").Replace(doc.PageLabelFormat)
			pdf.CellFormat(0, 6, text, "", 0, "C", false, 0, "")
			pdf.SetTextColor(0, 0, 0)
		})
	}

	pdf.AddPage()
	writePDFLetterhead(pdf, doc.Letterhead)
	writePDFTitleScope(pdf, doc.Title, doc.Scope)

	sections := doc.Sections
	if len(sections) == 0 {
		sections = []Section{{}}
	}
	for i, section := range sections {
		if i > 0 {
			pdf.AddPage()
		}
		writePDFSection(pdf, doc.Columns, widths, section)
	}

	if doc.Signature != nil {
		writePDFSignature(pdf, doc.Signature, widths)
	}

	if err := pdf.Error(); err != nil {
		return nil, fmt.Errorf("reportdoc: render pdf: %w", err)
	}
	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("reportdoc: write pdf: %w", err)
	}
	return buf.Bytes(), nil
}

// pdfColumnWidths converts each Column.Width hint to millimetres and
// picks portrait or landscape from the total: landscape when the columns
// do not fit a portrait page's printable width. If they do not fit even
// landscape, every column is scaled down proportionally so the table
// always spans exactly the page's printable width.
func pdfColumnWidths(columns []Column) (string, []float64) {
	widths := make([]float64, len(columns))
	total := 0.0
	for i, c := range columns {
		w := c.Width
		if w <= 0 {
			w = defaultColWidth
		}
		mm := math.Max(w*pdfMMPerWidthUnit, pdfMinColWidthMM)
		widths[i] = mm
		total += mm
	}
	if len(widths) == 0 {
		return "P", widths
	}

	orientation := "P"
	available := pdfPortraitContentMM
	if total > pdfPortraitContentMM {
		orientation = "L"
		available = pdfLandscapeContentMM
	}
	if total > available {
		scale := available / total
		for i := range widths {
			widths[i] *= scale
		}
	} else {
		// Stretch columns to fill the printable width evenly rather than
		// leaving a ragged right edge.
		extra := (available - total) / float64(len(widths))
		for i := range widths {
			widths[i] += extra
		}
	}
	return orientation, widths
}

// writePDFLetterhead draws the logo (scaled to a fixed height, natural
// aspect ratio) at the top-left and the text lines beside it (first line
// bold/larger, the school name), then a rule line under the block.
func writePDFLetterhead(pdf *fpdf.Fpdf, lh *Letterhead) {
	if lh == nil {
		return
	}
	left, top, right, _ := pdf.GetMargins()
	pageW, _ := pdf.GetPageSize()
	textX := left
	blockBottom := top

	if len(lh.Logo) > 0 {
		if imgType, ok := pdfImageType(lh.Logo); ok {
			const imageID = "reportdoc-letterhead-logo"
			pdf.RegisterImageOptionsReader(imageID, fpdf.ImageOptions{ImageType: imgType}, bytes.NewReader(lh.Logo))
			w := pdfLogoNaturalWidth(lh.Logo, pdfLogoHeightMM)
			pdf.ImageOptions(imageID, left, top, w, pdfLogoHeightMM, false, fpdf.ImageOptions{ImageType: imgType}, 0, "")
			textX = left + w + 4
			blockBottom = top + pdfLogoHeightMM
		}
	}

	y := top
	for i, line := range lh.Lines {
		if i == 0 {
			pdf.SetFont("Helvetica", "B", 13)
		} else {
			pdf.SetFont("Helvetica", "", 9)
		}
		pdf.SetXY(textX, y)
		pdf.CellFormat(pageW-textX-right, pdfCellLineHeightMM, line, "", 2, "L", false, 0, "")
		y = pdf.GetY()
	}
	blockBottom = math.Max(blockBottom, y)

	pdf.SetDrawColor(pdfBorder[0], pdfBorder[1], pdfBorder[2])
	pdf.Line(left, blockBottom+2, pageW-right, blockBottom+2)
	pdf.SetXY(left, blockBottom+6)
	pdf.SetFont("Helvetica", "", 10)
}

// pdfLogoNaturalWidth decodes the logo's own pixel dimensions and returns
// the width, in millimetres, that keeps its aspect ratio at targetHeightMM
// -- rather than trusting fpdf's own dpi-based sizing, which depends on
// metadata a phone-camera logo photo may not carry.
func pdfLogoNaturalWidth(logo []byte, targetHeightMM float64) float64 {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(logo))
	if err != nil || cfg.Width == 0 || cfg.Height == 0 {
		return targetHeightMM // square fallback
	}
	return targetHeightMM * float64(cfg.Width) / float64(cfg.Height)
}

func pdfImageType(data []byte) (string, bool) {
	ext, err := imageExtension(data)
	if err != nil {
		return "", false
	}
	return strings.ToUpper(strings.TrimPrefix(ext, ".")), true
}

// writePDFTitleScope prints the centered title and the left-aligned scope
// lines beneath the letterhead.
func writePDFTitleScope(pdf *fpdf.Fpdf, title string, scope []ScopeLine) {
	left, _, right, _ := pdf.GetMargins()
	pageW, _ := pdf.GetPageSize()
	if title != "" {
		pdf.SetFont("Helvetica", "B", 14)
		pdf.CellFormat(pageW-left-right, 8, title, "", 1, "C", false, 0, "")
	}
	pdf.SetFont("Helvetica", "", 10)
	for _, line := range scope {
		pdf.CellFormat(pageW-left-right, 6, fmt.Sprintf("%s: %s", line.Label, line.Value), "", 1, "L", false, 0, "")
	}
	pdf.Ln(3)
}

// writePDFSection draws one section's heading (when named), table header
// row, data rows and footer rows, breaking to a new page -- with the
// header row redrawn -- whenever a row would not fit.
func writePDFSection(pdf *fpdf.Fpdf, columns []Column, widths []float64, section Section) {
	left, _, _, _ := pdf.GetMargins()

	if section.Name != "" {
		pageW, _ := pdf.GetPageSize()
		_, _, right, _ := pdf.GetMargins()
		pdf.SetFont("Helvetica", "B", 12)
		pdf.CellFormat(pageW-left-right, 7, section.Name, "", 1, "L", false, 0, "")
		pdf.Ln(1)
	}

	if len(columns) == 0 {
		return
	}

	drawHeader := func() {
		pdfDrawRow(pdf, left, columns, widths, nil, pdfRowStyle{fill: pdfHeaderFill, bold: true, textWhite: true, isHeader: true})
	}
	drawHeader()

	for i, values := range section.Rows {
		style := pdfRowStyle{}
		if i%2 == 1 {
			style.fill = pdfZebraFill
		}
		ensurePDFRowSpace(pdf, columns, widths, values, style, drawHeader)
		pdfDrawRow(pdf, left, columns, widths, values, style)
	}
	for _, values := range section.Footer {
		style := pdfRowStyle{fill: pdfFooterFill, bold: true}
		ensurePDFRowSpace(pdf, columns, widths, values, style, drawHeader)
		pdfDrawRow(pdf, left, columns, widths, values, style)
	}
	pdf.Ln(2)
}

// ensurePDFRowSpace adds a page (redrawing the table header via
// redrawHeader) when the row about to be drawn would not fit above the
// page's bottom margin.
func ensurePDFRowSpace(pdf *fpdf.Fpdf, columns []Column, widths []float64, values []any, style pdfRowStyle, redrawHeader func()) {
	height := pdfRowHeight(pdf, columns, widths, values)
	_, pageH := pdf.GetPageSize()
	_, _, _, bottom := pdf.GetMargins()
	if pdf.GetY()+height > pageH-bottom {
		pdf.AddPage()
		redrawHeader()
	}
}

type pdfRowStyle struct {
	fill      [3]int
	bold      bool
	textWhite bool
	isHeader  bool
}

func (s pdfRowStyle) hasFill() bool { return s.fill != [3]int{} }

// pdfRowHeight computes how tall a row must be to fit every cell's
// word-wrapped text, using the current font metrics (so callers must set
// the row's font before calling this and before drawing).
func pdfRowHeight(pdf *fpdf.Fpdf, columns []Column, widths []float64, values []any) float64 {
	pdf.SetFont("Helvetica", "", 9)
	maxLines := 1
	for i, c := range columns {
		if i >= len(widths) {
			break
		}
		text := cellText(c.Kind, valueAt(values, i))
		w := widths[i] - 2*pdfCellPadMM
		if w < 5 {
			w = 5
		}
		lines := pdf.SplitLines([]byte(text), w)
		if n := len(lines); n > maxLines {
			maxLines = n
		}
	}
	return float64(maxLines)*pdfCellLineHeightMM + 2*pdfCellPadMM
}

// pdfDrawRow draws one row of cells at the current Y: a filled/bordered
// rectangle per cell sized to the row's full height, then the cell's
// (possibly wrapped) text on top.
func pdfDrawRow(pdf *fpdf.Fpdf, left float64, columns []Column, widths []float64, values []any, style pdfRowStyle) {
	weight := ""
	if style.bold {
		weight = "B"
	}
	pdf.SetFont("Helvetica", weight, 9)
	height := pdfRowHeight(pdf, columns, widths, values)
	y := pdf.GetY()

	pdf.SetDrawColor(pdfBorder[0], pdfBorder[1], pdfBorder[2])
	if style.hasFill() {
		pdf.SetFillColor(style.fill[0], style.fill[1], style.fill[2])
	}
	rectStyle := "D"
	if style.hasFill() {
		rectStyle = "FD"
	}
	if style.textWhite {
		pdf.SetTextColor(255, 255, 255)
	}

	x := left
	for i, c := range columns {
		if i >= len(widths) {
			break
		}
		w := widths[i]
		pdf.Rect(x, y, w, height, rectStyle)
		text := c.Label
		if !style.isHeader {
			text = cellText(c.Kind, valueAt(values, i))
		}
		pdf.SetXY(x+pdfCellPadMM, y+pdfCellPadMM)
		pdf.MultiCell(w-2*pdfCellPadMM, pdfCellLineHeightMM, text, "", pdfAlign(c.Kind), false)
		x += w
	}
	if style.textWhite {
		pdf.SetTextColor(0, 0, 0)
	}
	pdf.SetXY(left, y+height)
}

func pdfAlign(kind ColumnKind) string {
	switch kind {
	case ColumnNumber, ColumnPercent:
		return "R"
	case ColumnDate:
		return "C"
	default:
		return "L"
	}
}

func valueAt(values []any, i int) any {
	if i < len(values) {
		return values[i]
	}
	return nil
}

// cellText formats a typed cell value as PDF table text; RenderXLSX keeps
// values natively typed instead, since Excel has its own numeric/date
// cell types -- a PDF table has only text.
func cellText(kind ColumnKind, v any) string {
	if v == nil {
		return ""
	}
	switch kind {
	case ColumnDate:
		if t, ok := v.(time.Time); ok {
			return t.Format("02/01/2006")
		}
	case ColumnNumber:
		if f, ok := toFloat64(v); ok {
			if f == math.Trunc(f) {
				return strconv.FormatFloat(f, 'f', 0, 64)
			}
			return strconv.FormatFloat(f, 'f', 2, 64)
		}
	case ColumnPercent:
		if f, ok := toFloat64(v); ok {
			return strconv.FormatFloat(f*100, 'f', 1, 64) + "%"
		}
	}
	return fmt.Sprint(v)
}

func toFloat64(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int32:
		return float64(n), true
	case int64:
		return float64(n), true
	default:
		return 0, false
	}
}

// writePDFSignature prints the place/date line and one signer column per
// Signer, kept together on one page: if the block does not fit above the
// bottom margin, it starts on a new page rather than splitting across two.
func writePDFSignature(pdf *fpdf.Fpdf, sig *Signature, widths []float64) {
	left, _, right, _ := pdf.GetMargins()
	pageW, pageH := pdf.GetPageSize()
	_, _, _, bottom := pdf.GetMargins()

	signerRows := 0
	if len(sig.Signers) > 0 {
		signerRows = 1
	}
	blockHeight := 8.0 + float64(signerRows)*(6+22+6)
	if pdf.GetY()+blockHeight > pageH-bottom {
		pdf.AddPage()
	}
	pdf.Ln(4)

	if sig.Place != "" || sig.Date != "" {
		pdf.SetFont("Helvetica", "", 10)
		line := strings.TrimSpace(strings.Join(nonEmpty(sig.Place, sig.Date), ", "))
		pdf.CellFormat(pageW-left-right, 6, line, "", 1, "R", false, 0, "")
	}
	if len(sig.Signers) == 0 {
		return
	}

	total := pageW - left - right
	colW := total / float64(len(sig.Signers))
	y := pdf.GetY() + 2
	for i, signer := range sig.Signers {
		x := left + float64(i)*colW
		pdf.SetXY(x, y)
		pdf.SetFont("Helvetica", "", 10)
		pdf.CellFormat(colW, 6, signer.RoleLabel+",", "", 0, "C", false, 0, "")

		pdf.SetXY(x, y+28)
		pdf.SetFont("Helvetica", "BU", 10)
		pdf.CellFormat(colW, 6, signer.Name, "", 0, "C", false, 0, "")

		if signer.IDLabel != "" {
			pdf.SetXY(x, y+34)
			pdf.SetFont("Helvetica", "", 9)
			pdf.CellFormat(colW, 6, fmt.Sprintf("%s. %s", signer.IDLabel, signer.IDNumber), "", 0, "C", false, 0, "")
		}
	}
	pdf.SetXY(left, y+40)
}
