package documents

import (
	"bytes"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-pdf/fpdf"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// Page geometry and type sizes, in millimetres and points.
const (
	pageMarginMM   = 20.0
	bodyFontSize   = 12.0
	lineHeightMM   = 6.0
	paragraphGapMM = 2.0
	// cellPadMM pads a borderless cell; a bordered table uses its
	// cellpadding attribute instead.
	cellPadMM = 1.0
	// pxToMM converts the CSS pixels templates use (96 per inch).
	pxToMM = 25.4 / 96
	// maxSpaceMM caps a margin or padding taken from a template, so a
	// typo cannot push the rest of a letter off the page.
	maxSpaceMM = 40.0
)

var headingSizes = map[atom.Atom]float64{
	atom.H1: 18, atom.H2: 15, atom.H3: 13, atom.H4: 12, atom.H5: 12, atom.H6: 12,
}

var whitespace = regexp.MustCompile(`\s+`)

// run is a piece of inline text in one style.
type run struct {
	text string
	bold bool
}

// blockStyle is what a block element passes down to the text inside it.
type blockStyle struct {
	align string // "L", "C" or "R"
	size  float64
	bold  bool
}

// layout walks a parsed HTML tree and draws it with fpdf. It understands
// the small vocabulary document templates use: paragraphs and headings
// (with text-align and margin-top), line breaks, lists, bold runs, and
// tables laid out as real columns (border, cellpadding, width:100%,
// text-align and padding-top on cells), which is what letter tables and
// signature blocks need.
type layout struct {
	pdf     *fpdf.Fpdf
	tr      func(string) string
	pending []run
	style   blockStyle
}

func newLayout(pdf *fpdf.Fpdf) *layout {
	return &layout{
		pdf:   pdf,
		tr:    pdf.UnicodeTranslatorFromDescriptor(""),
		style: blockStyle{align: "L", size: bodyFontSize},
	}
}

func (l *layout) render(renderedHTML []byte) error {
	doc, err := html.Parse(bytes.NewReader(renderedHTML))
	if err != nil {
		return fmt.Errorf("parse rendered html: %w", err)
	}
	l.children(doc)
	l.flush()
	return nil
}

func (l *layout) children(n *html.Node) {
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		l.node(c)
	}
}

func (l *layout) node(n *html.Node) {
	switch n.Type {
	case html.TextNode:
		l.pending = append(l.pending, run{text: n.Data, bold: l.style.bold})
		return
	case html.ElementNode:
	default:
		l.children(n)
		return
	}

	switch n.DataAtom {
	case atom.Head, atom.Style, atom.Script, atom.Title:
		return
	case atom.Br:
		l.flush()
	case atom.Table:
		l.flush()
		l.space(styleLength(n, "margin-top"))
		l.table(n)
		l.pdf.Ln(paragraphGapMM)
	case atom.P, atom.Div, atom.Li, atom.Ul, atom.Ol, atom.Blockquote, atom.Section,
		atom.H1, atom.H2, atom.H3, atom.H4, atom.H5, atom.H6:
		l.block(n)
	case atom.Strong, atom.B, atom.Th:
		saved := l.style
		l.style.bold = true
		l.children(n)
		l.style = saved
	default:
		l.children(n)
	}
}

// block lays out a block element: whatever inline text came before it is
// its own paragraph, and so is the text inside it.
func (l *layout) block(n *html.Node) {
	l.flush()
	saved := l.style
	l.space(styleLength(n, "margin-top"))
	if align, ok := textAlign(n); ok {
		l.style.align = align
	}
	if size, ok := headingSizes[n.DataAtom]; ok {
		l.style.size = size
		l.style.bold = true
	}
	if n.DataAtom == atom.Li {
		l.pending = append(l.pending, run{text: "- ", bold: l.style.bold})
	}
	l.children(n)
	l.flush()
	l.style = saved
}

func (l *layout) space(mm float64) {
	if mm > 0 {
		l.pdf.Ln(mm)
	}
}

// flush draws the pending inline runs as one paragraph.
func (l *layout) flush() {
	runs := normalizeRuns(l.pending)
	l.pending = nil
	if len(runs) == 0 {
		return
	}
	mixed := false
	for _, r := range runs {
		if r.bold != runs[0].bold {
			mixed = true
		}
	}
	lineHeight := lineHeightMM * l.style.size / bodyFontSize
	if !mixed || l.style.align != "L" {
		var text strings.Builder
		for _, r := range runs {
			text.WriteString(r.text)
		}
		l.setFont(runs[0].bold, l.style.size)
		l.pdf.MultiCell(0, lineHeight, l.tr(text.String()), "", l.style.align, false)
	} else {
		for _, r := range runs {
			l.setFont(r.bold, l.style.size)
			l.pdf.Write(lineHeight, l.tr(r.text))
		}
		l.pdf.Ln(lineHeight)
	}
	l.setFont(false, bodyFontSize)
	l.pdf.Ln(paragraphGapMM)
}

func (l *layout) setFont(bold bool, size float64) {
	style := ""
	if bold {
		style = "B"
	}
	l.pdf.SetFont("Helvetica", style, size)
}

// normalizeRuns collapses whitespace the way a browser does and trims the
// paragraph's ends, dropping runs left empty.
func normalizeRuns(runs []run) []run {
	out := make([]run, 0, len(runs))
	for _, r := range runs {
		r.text = whitespace.ReplaceAllString(r.text, " ")
		if len(out) > 0 && strings.HasSuffix(out[len(out)-1].text, " ") {
			r.text = strings.TrimLeft(r.text, " ")
		}
		if r.text != "" {
			out = append(out, r)
		}
	}
	for len(out) > 0 {
		out[0].text = strings.TrimLeft(out[0].text, " ")
		if out[0].text != "" {
			break
		}
		out = out[1:]
	}
	for len(out) > 0 {
		last := len(out) - 1
		out[last].text = strings.TrimRight(out[last].text, " ")
		if out[last].text != "" {
			break
		}
		out = out[:last]
	}
	return out
}

// tableCell is one td/th with its text and the style it is drawn in.
type tableCell struct {
	text       string
	bold       bool
	align      string
	paddingTop float64
}

// table lays out rows of cells as columns across the printable width.
//
//   - A bordered table (border="1", the violation lists) fills the width,
//     columns sized by their content.
//   - A borderless table with width:100% (the signature blocks) gets equal
//     columns, one signer each.
//   - Any other table (label/value rows such as "Nama : ...") keeps its
//     first columns as narrow as their text, the last one taking the rest.
func (l *layout) table(n *html.Node) {
	rows := tableRows(n)
	if len(rows) == 0 {
		return
	}
	bordered := attr(n, "border") != "" && attr(n, "border") != "0"
	tableAlign, _ := textAlign(n)
	fullWidth := strings.Contains(strings.ReplaceAll(attr(n, "style"), " ", ""), "width:100%")
	pad := cellPadMM
	if v, err := strconv.ParseFloat(attr(n, "cellpadding"), 64); err == nil {
		pad = v * pxToMM
	}

	columns := 0
	for _, row := range rows {
		columns = max(columns, len(row))
	}
	pageWidth, pageHeight := l.pdf.GetPageSize()
	left, _, right, _ := l.pdf.GetMargins()
	available := pageWidth - left - right

	cellTexts := make([][]tableCell, len(rows))
	for i, row := range rows {
		cellTexts[i] = make([]tableCell, len(row))
		for j, cell := range row {
			cellTexts[i][j] = l.cell(cell, tableAlign)
		}
	}
	widths := l.columnWidths(cellTexts, columns, available, pad, bordered, fullWidth)

	_, _, _, bottom := l.pdf.GetMargins()
	for _, row := range cellTexts {
		height := l.rowHeight(row, widths, pad)
		if l.pdf.GetY()+height > pageHeight-bottom {
			l.pdf.AddPage()
		}
		x, y := left, l.pdf.GetY()
		for j := 0; j < columns; j++ {
			if bordered {
				l.pdf.Rect(x, y, widths[j], height, "D")
			}
			if j < len(row) {
				c := row[j]
				l.setFont(c.bold, bodyFontSize)
				l.pdf.SetXY(x+pad, y+pad+c.paddingTop)
				l.pdf.MultiCell(widths[j]-2*pad, lineHeightMM, c.text, "", c.align, false)
			}
			x += widths[j]
		}
		l.pdf.SetXY(left, y+height)
	}
	l.setFont(false, bodyFontSize)
}

func (l *layout) cell(n *html.Node, tableAlign string) tableCell {
	bold := n.DataAtom == atom.Th
	var runs []run
	var collect func(*html.Node, bool)
	collect = func(n *html.Node, bold bool) {
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			switch {
			case c.Type == html.TextNode:
				runs = append(runs, run{text: c.Data, bold: bold})
			case c.Type == html.ElementNode && c.DataAtom == atom.Br:
				runs = append(runs, run{text: "\n"})
			case c.Type == html.ElementNode:
				collect(c, bold || c.DataAtom == atom.Strong || c.DataAtom == atom.B)
			}
		}
	}
	collect(n, bold)
	var text strings.Builder
	allBold := len(runs) > 0
	for _, r := range normalizeRuns(runs) {
		text.WriteString(r.text)
		allBold = allBold && r.bold
	}
	align := "L"
	if tableAlign != "" {
		align = tableAlign
	}
	if a, ok := textAlign(n); ok {
		align = a
	}
	return tableCell{text: l.tr(text.String()), bold: bold || allBold, align: align, paddingTop: styleLength(n, "padding-top")}
}

// columnWidths shares the printable width between the columns; see table.
func (l *layout) columnWidths(rows [][]tableCell, columns int, available, pad float64, bordered, fullWidth bool) []float64 {
	widths := make([]float64, columns)
	if fullWidth && !bordered {
		for j := range widths {
			widths[j] = available / float64(columns)
		}
		return widths
	}
	natural := make([]float64, columns)
	for _, row := range rows {
		for j, c := range row {
			l.setFont(c.bold, bodyFontSize)
			natural[j] = max(natural[j], l.pdf.GetStringWidth(c.text)+2*pad+2*l.pdf.GetCellMargin()+1)
		}
	}
	l.setFont(false, bodyFontSize)
	total := sum(natural)
	switch {
	case total > available:
		return fitColumns(natural, available)
	case bordered:
		// Fill the width, each column growing in proportion to its content.
		for j, w := range natural {
			widths[j] = available * w / total
		}
	default:
		copy(widths, natural)
		widths[columns-1] = available - (total - natural[columns-1])
	}
	return widths
}

// fitColumns squeezes columns whose single-line text is wider than the
// page, the way a browser's automatic table layout does: a column that
// fits in an even share keeps its natural width (a date, a points figure)
// and the long ones split what is left, wrapping their text.
func fitColumns(natural []float64, available float64) []float64 {
	widths := make([]float64, len(natural))
	fixed := make([]bool, len(natural))
	remaining, flexible := available, len(natural)
	for changed := true; changed && flexible > 0; {
		changed = false
		share := remaining / float64(flexible)
		for j, w := range natural {
			if !fixed[j] && w <= share {
				fixed[j], widths[j] = true, w
				remaining -= w
				flexible--
				changed = true
			}
		}
	}
	flexTotal := 0.0
	for j, w := range natural {
		if !fixed[j] {
			flexTotal += w
		}
	}
	for j, w := range natural {
		if !fixed[j] {
			widths[j] = remaining * w / flexTotal
		}
	}
	return widths
}

func (l *layout) rowHeight(row []tableCell, widths []float64, pad float64) float64 {
	height := lineHeightMM + 2*pad
	for j, c := range row {
		l.setFont(c.bold, bodyFontSize)
		lines := len(l.pdf.SplitText(c.text, widths[j]-2*pad))
		height = max(height, float64(max(lines, 1))*lineHeightMM+2*pad+c.paddingTop)
	}
	l.setFont(false, bodyFontSize)
	return height
}

// tableRows collects the td/th cells of every tr, looking through
// thead/tbody/tfoot.
func tableRows(table *html.Node) [][]*html.Node {
	var rows [][]*html.Node
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if c.Type != html.ElementNode {
				continue
			}
			switch c.DataAtom {
			case atom.Tr:
				var cells []*html.Node
				for cell := c.FirstChild; cell != nil; cell = cell.NextSibling {
					if cell.Type == html.ElementNode && (cell.DataAtom == atom.Td || cell.DataAtom == atom.Th) {
						cells = append(cells, cell)
					}
				}
				if len(cells) > 0 {
					rows = append(rows, cells)
				}
			case atom.Thead, atom.Tbody, atom.Tfoot:
				walk(c)
			}
		}
	}
	walk(table)
	return rows
}

func attr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return strings.TrimSpace(a.Val)
		}
	}
	return ""
}

// styleValue reads one property from an element's inline style.
func styleValue(n *html.Node, property string) (string, bool) {
	for _, decl := range strings.Split(attr(n, "style"), ";") {
		name, value, ok := strings.Cut(decl, ":")
		if ok && strings.EqualFold(strings.TrimSpace(name), property) {
			return strings.ToLower(strings.TrimSpace(value)), true
		}
	}
	return "", false
}

func textAlign(n *html.Node) (string, bool) {
	value, ok := styleValue(n, "text-align")
	if !ok {
		return "", false
	}
	switch value {
	case "center":
		return "C", true
	case "right":
		return "R", true
	default:
		return "L", true
	}
}

// styleLength reads a px (or unitless) length as millimetres.
func styleLength(n *html.Node, property string) float64 {
	value, ok := styleValue(n, property)
	if !ok {
		return 0
	}
	px, err := strconv.ParseFloat(strings.TrimSuffix(value, "px"), 64)
	if err != nil || px <= 0 {
		return 0
	}
	return min(px*pxToMM, maxSpaceMM)
}

func sum(values []float64) float64 {
	total := 0.0
	for _, v := range values {
		total += v
	}
	return total
}
