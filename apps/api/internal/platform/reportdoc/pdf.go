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
	// pdfContentBottomMM is how far from the page's bottom edge table
	// rows and the signature block must stop -- deliberately not
	// pdf.GetMargins()'s own bottom value, since RenderPDF calls
	// SetAutoPageBreak(false, 0), which zeroes that value (fpdf's
	// bMargin backs both). Tall enough to clear the page-number footer,
	// drawn at pageH-10 (see the SetFooterFunc closure in RenderPDF).
	pdfContentBottomMM = 20.0
	// pdfSingleSignerWidthFraction is how much of the printable width a
	// lone signer's block occupies, right-aligned -- roomy enough for a
	// role line, a name, and "NIP. ..." without wrapping, narrow enough
	// to visibly sit on the right rather than spanning the page.
	pdfSingleSignerWidthFraction = 0.45
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
	sections := doc.Sections
	if len(sections) == 0 {
		sections = []Section{{}}
	}
	sectionColumns := make([][]Column, len(sections))
	for i, section := range sections {
		sectionColumns[i] = section.columns(doc)
	}
	orientation, available := pdfDocumentOrientation(sectionColumns)

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

	for i, section := range sections {
		if i > 0 {
			pdf.AddPage()
		}
		cols := sectionColumns[i]
		widths := pdfFitColumnWidths(pdfNaturalColumnWidths(cols), available)
		writePDFSection(pdf, cols, widths, section, doc.EmptyRowsLabel)
	}

	if doc.Signature != nil {
		writePDFSignature(pdf, doc.Signature)
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

// pdfNaturalColumnWidths converts each Column.Width hint to millimetres,
// before either the document's orientation is chosen or the final
// stretch/scale-to-fit is applied. Used both to decide orientation (see
// pdfDocumentOrientation, which sums these) and, once an available width
// is known, to fit a section's own columns to it (see
// pdfFitColumnWidths).
func pdfNaturalColumnWidths(columns []Column) []float64 {
	widths := make([]float64, len(columns))
	for i, c := range columns {
		w := c.Width
		if w <= 0 {
			w = defaultColWidth
		}
		widths[i] = math.Max(w*pdfMMPerWidthUnit, pdfMinColWidthMM)
	}
	return widths
}

func sumFloat64(values []float64) float64 {
	total := 0.0
	for _, v := range values {
		total += v
	}
	return total
}

// pdfFitColumnWidths scales natural widths (from pdfNaturalColumnWidths)
// to span exactly available millimetres: scaled down proportionally if
// they overflow it, stretched evenly to fill any leftover space
// otherwise, so a section's table never leaves a ragged right edge.
func pdfFitColumnWidths(natural []float64, available float64) []float64 {
	if len(natural) == 0 {
		return natural
	}
	total := sumFloat64(natural)
	widths := make([]float64, len(natural))
	copy(widths, natural)
	if total > available {
		scale := available / total
		for i := range widths {
			widths[i] *= scale
		}
	} else {
		extra := (available - total) / float64(len(widths))
		for i := range widths {
			widths[i] += extra
		}
	}
	return widths
}

// pdfDocumentOrientation picks portrait or landscape for the whole PDF
// from every section's own effective column set: fpdf fixes a document's
// page size/orientation at creation, so one section needing landscape
// (its natural column widths do not fit a portrait page) puts the entire
// document in landscape, not just that section's pages. Returns the
// chosen orientation and the printable width available at it, in
// millimetres, for pdfFitColumnWidths.
func pdfDocumentOrientation(columnSets [][]Column) (string, float64) {
	orientation, available := "P", pdfPortraitContentMM
	for _, cols := range columnSets {
		if sumFloat64(pdfNaturalColumnWidths(cols)) > pdfPortraitContentMM {
			orientation, available = "L", pdfLandscapeContentMM
			break
		}
	}
	return orientation, available
}

// pdfEmphasisSize/pdfPlainLineSize are the letterhead's two font sizes:
// the school name (Letterhead.Emphasis) is visibly dominant, matching
// RenderXLSX's 14pt emphasis style; every other line is small and plain.
const (
	pdfEmphasisSize  = 14.0
	pdfPlainLineSize = 10.0
)

// DrawLetterhead renders lh (a kop laporan: logo plus text lines) onto
// pdf at its current position, exactly like RenderPDF's own letterhead
// block -- for a caller that builds its own fpdf.Fpdf document with a
// layout RenderPDF cannot express (e.g. the library module's monthly
// report, a fixed indicator grid and three tables with different column
// counts) but still wants the tenant's configured letterhead rendered
// the same way every other reportdoc-backed document does. A nil lh
// draws nothing, so a caller can pass the result of
// LetterheadSource.Letterhead unchecked.
func DrawLetterhead(pdf *fpdf.Fpdf, lh *Letterhead) {
	writePDFLetterhead(pdf, lh)
}

// DrawSignature renders sig (the place/date line plus one column per
// signer) onto pdf at its current position, exactly like RenderPDF's own
// signature block -- see DrawLetterhead for why a caller outside this
// package would reach for it. A nil sig draws nothing.
func DrawSignature(pdf *fpdf.Fpdf, sig *Signature) {
	if sig == nil {
		return
	}
	writePDFSignature(pdf, sig)
}

// writePDFLetterhead draws the logo (scaled to a fixed height, natural
// aspect ratio, natural width) pinned to the left margin and the text
// lines as a centered block spanning the full page width below it --
// the emphasised line (the school name) bold and visibly larger than the
// rest -- then a double rule line under the block, the standard
// Indonesian kop surat layout.
func writePDFLetterhead(pdf *fpdf.Fpdf, lh *Letterhead) {
	if lh == nil {
		return
	}
	left, top, right, _ := pdf.GetMargins()
	pageW, _ := pdf.GetPageSize()
	blockBottom := top

	if len(lh.Logo) > 0 {
		if imgType, ok := pdfImageType(lh.Logo); ok {
			const imageID = "reportdoc-letterhead-logo"
			pdf.RegisterImageOptionsReader(imageID, fpdf.ImageOptions{ImageType: imgType}, bytes.NewReader(lh.Logo))
			w := pdfLogoNaturalWidth(lh.Logo, pdfLogoHeightMM)
			pdf.ImageOptions(imageID, left, top, w, pdfLogoHeightMM, false, fpdf.ImageOptions{ImageType: imgType}, 0, "")
			blockBottom = top + pdfLogoHeightMM
		}
	}

	emphasis := lh.Emphasis
	if emphasis < 0 || emphasis >= len(lh.Lines) {
		emphasis = 0
	}
	width := pageW - left - right
	y := top
	for i, line := range lh.Lines {
		if i == emphasis {
			pdf.SetFont("Helvetica", "B", pdfEmphasisSize)
		} else {
			pdf.SetFont("Helvetica", "", pdfPlainLineSize)
		}
		pdf.SetXY(left, y)
		pdf.CellFormat(width, pdfCellLineHeightMM, line, "", 2, "C", false, 0, "")
		y = pdf.GetY()
	}
	blockBottom = math.Max(blockBottom, y)

	// A double rule -- two close horizontal lines -- is the kop surat
	// convention for closing the letterhead block, not a single line.
	pdf.SetDrawColor(pdfBorder[0], pdfBorder[1], pdfBorder[2])
	pdf.Line(left, blockBottom+2, pageW-right, blockBottom+2)
	pdf.Line(left, blockBottom+2.8, pageW-right, blockBottom+2.8)
	pdf.SetXY(left, blockBottom+7)
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
// header row redrawn -- whenever a row would not fit. A section with no
// rows (and no footer) prints a single emptyLabel row instead of just a
// bare header, when emptyLabel is non-empty.
func writePDFSection(pdf *fpdf.Fpdf, columns []Column, widths []float64, section Section, emptyLabel string) {
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

	if len(section.Rows) == 0 && len(section.Footer) == 0 && emptyLabel != "" {
		writePDFEmptyRow(pdf, left, widths, emptyLabel)
	}

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

// writePDFEmptyRow draws one bordered row spanning every column's
// combined width, centered italic text -- "Tidak ada data" and
// equivalents -- in place of a section that has nothing to show.
func writePDFEmptyRow(pdf *fpdf.Fpdf, left float64, widths []float64, label string) {
	total := 0.0
	for _, w := range widths {
		total += w
	}
	pdf.SetFont("Helvetica", "I", 9)
	height := pdfCellLineHeightMM + 2*pdfCellPadMM
	y := pdf.GetY()
	pdf.SetDrawColor(pdfBorder[0], pdfBorder[1], pdfBorder[2])
	pdf.Rect(left, y, total, height, "D")
	pdf.SetTextColor(107, 114, 128)
	pdf.SetXY(left, y+pdfCellPadMM)
	pdf.CellFormat(total, pdfCellLineHeightMM, label, "", 0, "C", false, 0, "")
	pdf.SetTextColor(0, 0, 0)
	pdf.SetXY(left, y+height)
}

// ensurePDFRowSpace adds a page (redrawing the table header via
// redrawHeader) when the row about to be drawn would not fit above the
// page's bottom margin.
func ensurePDFRowSpace(pdf *fpdf.Fpdf, columns []Column, widths []float64, values []any, style pdfRowStyle, redrawHeader func()) {
	setRowFont(pdf, style)
	height := pdfRowHeight(pdf, widths, rowTexts(columns, values, style.isHeader))
	_, pageH := pdf.GetPageSize()
	if pdf.GetY()+height > pageH-pdfContentBottomMM {
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

func setRowFont(pdf *fpdf.Fpdf, style pdfRowStyle) {
	weight := ""
	if style.bold {
		weight = "B"
	}
	pdf.SetFont("Helvetica", weight, 9)
}

// rowTexts resolves the display text for every column of one row: the
// column's Label for a header row, otherwise its typed cell value. Both
// pdfRowHeight (sizing) and pdfDrawRow (drawing) call this so the two can
// never disagree about what text a row holds -- the header-clipping bug
// this replaced came from sizing off blank text while drawing the real,
// often multi-line, label.
func rowTexts(columns []Column, values []any, isHeader bool) []string {
	texts := make([]string, len(columns))
	for i, c := range columns {
		if isHeader {
			texts[i] = c.Label
		} else {
			texts[i] = cellText(c.Kind, valueAt(values, i))
		}
	}
	return texts
}

// pdfRowHeight computes how tall a row must be to fit every cell's
// word-wrapped text, using the current font metrics -- callers must
// SetFont (see setRowFont) before calling this and before drawing with
// the same texts, so sizing and drawing always agree.
func pdfRowHeight(pdf *fpdf.Fpdf, widths []float64, texts []string) float64 {
	maxLines := 1
	for i, text := range texts {
		if i >= len(widths) {
			break
		}
		w := widths[i] - 2*pdfCellPadMM
		if w < 5 {
			w = 5
		}
		if n := len(pdf.SplitLines([]byte(text), w)); n > maxLines {
			maxLines = n
		}
	}
	return float64(maxLines)*pdfCellLineHeightMM + 2*pdfCellPadMM
}

// pdfDrawRow draws one row of cells at the current Y: a filled/bordered
// rectangle per cell sized to the row's full (wrap-aware) height, then
// the cell's possibly-wrapped text on top.
func pdfDrawRow(pdf *fpdf.Fpdf, left float64, columns []Column, widths []float64, values []any, style pdfRowStyle) {
	setRowFont(pdf, style)
	texts := rowTexts(columns, values, style.isHeader)
	height := pdfRowHeight(pdf, widths, texts)
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
		pdf.SetXY(x+pdfCellPadMM, y+pdfCellPadMM)
		pdf.MultiCell(w-2*pdfCellPadMM, pdfCellLineHeightMM, texts[i], "", pdfAlign(c.Kind), false)
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
// bottom margin, it starts on a new page rather than splitting across
// two. Sized off the page's own printable width, not any section's
// column widths -- the signature block always spans the full page.
func writePDFSignature(pdf *fpdf.Fpdf, sig *Signature) {
	left, _, right, _ := pdf.GetMargins()
	pageW, pageH := pdf.GetPageSize()

	signerRows := 0
	if len(sig.Signers) > 0 {
		signerRows = 1
	}
	blockHeight := 8.0 + float64(signerRows)*(6+22+6)
	if pdf.GetY()+blockHeight > pageH-pdfContentBottomMM {
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

	// One signer stays a single block aligned to the right (the standard
	// Indonesian layout for a single Kepala Sekolah signature); two or
	// more split the width evenly into side-by-side columns, e.g. Wali
	// Kelas on the left and Kepala Sekolah on the right.
	total := pageW - left - right
	n := len(sig.Signers)
	colW := total / float64(n)
	startX := left
	if n == 1 {
		colW = total * pdfSingleSignerWidthFraction
		startX = left + total - colW
	}
	y := pdf.GetY() + 2
	for i, signer := range sig.Signers {
		x := startX + float64(i)*colW
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
