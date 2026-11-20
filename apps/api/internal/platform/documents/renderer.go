// Package documents renders a document_templates row (an html/template
// body with named variables) into HTML and PDF. It is a leaf platform
// package: no module import, no database access -- callers pass a
// Template and a value map, get bytes back.
//
// The PDF path is deliberately not a full HTML layout engine (no
// chromedp/headless-browser dependency, per this module's brief): it
// executes the html/template, then lays the result out block by block
// with github.com/go-pdf/fpdf -- paragraphs with their alignment, and
// tables as columns (layout.go). That is enough for a letter or a
// receipt -- a title, a few paragraphs, a fee table, a signature block --
// which is everything document_templates is used for; it is not a
// general-purpose HTML renderer.
package documents

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"html/template"
	"io"
	"net/http"
	"strings"

	"github.com/go-pdf/fpdf"
)

// Engine is a document_templates.engine value. Only EngineHTML is
// implemented; EngineDocx templates are accepted by the schema for a
// future module but Render rejects them today rather than pretending to
// support them.
type Engine string

const EngineHTML Engine = "html"

// Template is the subset of a document_templates row Render needs. It is
// this package's own type (not the owning module's domain.Template) so
// documents stays a leaf: modules import documents, documents imports
// nothing module-specific.
type Template struct {
	Engine Engine
	Body   string
	// Letterhead, when non-empty, is a JPEG or PNG image (tenant branding
	// asset) placed above the body -- the kop surat a school letter
	// conventionally carries. It is placed directly through fpdf rather
	// than as an <img> tag in Body: htmlToPDF strips all markup down to
	// plain text (see its doc comment), so a tag here would render
	// nothing.
	Letterhead []byte
}

// Rendered is the pair of representations a rendering produces: HTML for
// the "view before download" case, PDF for the file that gets stored as
// an asset and handed out as a signed download URL.
type Rendered struct {
	HTML []byte
	PDF  []byte
}

// Renderer turns a Template plus variables into Rendered bytes.
type Renderer interface {
	Render(ctx context.Context, tmpl Template, vars map[string]any) (Rendered, error)
}

// HTMLPDFRenderer is the only Renderer implementation today.
type HTMLPDFRenderer struct{}

func NewHTMLPDFRenderer() *HTMLPDFRenderer { return &HTMLPDFRenderer{} }

func (r *HTMLPDFRenderer) Render(_ context.Context, tmpl Template, vars map[string]any) (Rendered, error) {
	if tmpl.Engine != EngineHTML {
		return Rendered{}, fmt.Errorf("documents: unsupported template engine %q", tmpl.Engine)
	}

	t, err := parseHTML(tmpl.Body)
	if err != nil {
		return Rendered{}, fmt.Errorf("parse document template: %w", err)
	}

	var buf bytes.Buffer
	if err := t.Execute(&buf, vars); err != nil {
		return Rendered{}, fmt.Errorf("execute document template: %w", err)
	}
	renderedHTML := buf.Bytes()

	pdf, err := htmlToPDF(renderedHTML, tmpl.Letterhead)
	if err != nil {
		return Rendered{}, fmt.Errorf("render document pdf: %w", err)
	}

	return Rendered{HTML: renderedHTML, PDF: pdf}, nil
}

// parseHTML is the one place a template body is parsed, so ValidateHTML
// accepts exactly the bodies Render can parse.
func parseHTML(body string) (*template.Template, error) {
	return template.New("document").Parse(body)
}

// ValidateHTML reports whether an EngineHTML body would get past every
// step of Render that does not depend on the values passed in: parsing,
// and html/template's contextual escaping (which only runs on the first
// Execute, e.g. an {{if}} whose branches end inside and outside an
// attribute). Callers use it when a template is saved, so a broken body
// is refused there instead of failing every later Render of its kind.
//
// Errors that do depend on the values (a missing variable handed to a
// function, say) are not reported: the trial execution runs against an
// empty map, so they would be false alarms here.
func ValidateHTML(body string) error {
	t, err := parseHTML(body)
	if err != nil {
		return err
	}
	var escapeErr *template.Error
	if err := t.Execute(io.Discard, map[string]any{}); errors.As(err, &escapeErr) {
		return escapeErr
	}
	return nil
}

// Page geometry and type sizes for htmlToPDF, in millimetres and points.
const (
	pageMarginMM   = 20.0
	bodyFontPt     = 12.0
	lineHeightMM   = 6.0
	blockGapMM     = 2.0
	cellPaddingMM  = 1.5
	fontFamilyName = "Helvetica"
)

// htmlToPDF lays rendered HTML out on A4 pages: paragraphs word-wrapped
// with their text-align, headings and <strong>-only paragraphs in bold,
// and tables as real columns (bordered when the table has a border
// attribute), with letterhead (if non-empty, a JPEG or PNG) placed at the
// top of the first page. See layoutHTML for the HTML it understands and
// the package doc comment for why this is not a full HTML layout engine.
func htmlToPDF(renderedHTML, letterhead []byte) ([]byte, error) {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(pageMarginMM, pageMarginMM, pageMarginMM)
	pdf.SetAutoPageBreak(true, pageMarginMM)
	pdf.AddPage()
	pdf.SetFont(fontFamilyName, "", bodyFontPt)

	if len(letterhead) > 0 {
		if err := placeLetterhead(pdf, letterhead); err != nil {
			return nil, err
		}
	}

	// The core PDF fonts are cp1252; translate so accented names and
	// typographic punctuation print instead of turning into mojibake.
	tr := pdf.UnicodeTranslatorFromDescriptor("")
	for _, block := range layoutHTML(renderedHTML) {
		switch {
		case block.Paragraph != nil:
			drawParagraph(pdf, tr, *block.Paragraph)
		case block.Table != nil:
			drawTable(pdf, tr, *block.Table)
		}
		pdf.Ln(blockGapMM)
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("write pdf output: %w", err)
	}
	return buf.Bytes(), nil
}

func setFont(pdf *fpdf.Fpdf, bold bool, size float64) {
	style := ""
	if bold {
		style = "B"
	}
	if size <= 0 {
		size = bodyFontPt
	}
	pdf.SetFont(fontFamilyName, style, size)
}

func drawParagraph(pdf *fpdf.Fpdf, tr func(string) string, p layoutParagraph) {
	setFont(pdf, p.Bold, p.Size)
	lineH := lineHeightMM
	if p.Size > bodyFontPt {
		lineH = lineHeightMM * p.Size / bodyFontPt
	}
	for _, line := range strings.Split(p.Text, "\n") {
		pdf.MultiCell(0, lineH, tr(line), "", p.Align, false)
	}
	setFont(pdf, false, 0)
}

// drawTable lays a table's rows out as columns. Each column is as wide as
// its widest cell, scaled to the printable width when the table asks for
// width:100% or would not fit; a cell's text wraps inside its column.
func drawTable(pdf *fpdf.Fpdf, tr func(string) string, t layoutTable) {
	widths := columnWidths(pdf, tr, t)
	left, _, _, _ := pdf.GetMargins()
	_, pageH := pdf.GetPageSize()
	for _, row := range t.Rows {
		lines := make([][]string, len(row.Cells))
		rowLines := 1
		for i, cell := range row.Cells {
			setFont(pdf, cell.Bold, 0)
			for _, part := range strings.Split(cell.Text, "\n") {
				lines[i] = append(lines[i], pdf.SplitText(tr(part), widths[i]-2*cellPaddingMM)...)
			}
			if len(lines[i]) > rowLines {
				rowLines = len(lines[i])
			}
		}
		rowH := float64(rowLines) * lineHeightMM
		if pdf.GetY()+row.PadTop+rowH > pageH-pageMarginMM {
			pdf.AddPage()
		}
		y := pdf.GetY() + row.PadTop
		x := left
		for i, cell := range row.Cells {
			if t.Border {
				pdf.Rect(x, y, widths[i], rowH, "D")
			}
			setFont(pdf, cell.Bold, 0)
			for j, line := range lines[i] {
				pdf.SetXY(x+cellPaddingMM, y+float64(j)*lineHeightMM)
				pdf.CellFormat(widths[i]-2*cellPaddingMM, lineHeightMM, line, "", 0, cell.Align, false, 0, "")
			}
			x += widths[i]
		}
		pdf.SetXY(left, y+rowH)
	}
	setFont(pdf, false, 0)
}

func columnWidths(pdf *fpdf.Fpdf, tr func(string) string, t layoutTable) []float64 {
	cols := 0
	for _, row := range t.Rows {
		if len(row.Cells) > cols {
			cols = len(row.Cells)
		}
	}
	widths := make([]float64, cols)
	for _, row := range t.Rows {
		for i, cell := range row.Cells {
			setFont(pdf, cell.Bold, 0)
			for _, part := range strings.Split(cell.Text, "\n") {
				// SplitText and CellFormat also keep fpdf's own cell margin
				// on both sides, so a natural width reserves it too.
				if w := pdf.GetStringWidth(tr(part)) + 2*cellPaddingMM + 2*pdf.GetCellMargin() + 0.5; w > widths[i] {
					widths[i] = w
				}
			}
		}
	}
	pageW, _ := pdf.GetPageSize()
	available := pageW - 2*pageMarginMM
	total := 0.0
	for _, w := range widths {
		total += w
	}
	if total > 0 && (t.FullWidth || total > available) {
		// Narrow columns keep their natural width when the table shrinks,
		// so a short "Poin" column is not squeezed to make room.
		if !t.FullWidth {
			fair := available / float64(cols)
			fixed, flexible := 0.0, 0.0
			for _, w := range widths {
				if w <= fair {
					fixed += w
				} else {
					flexible += w
				}
			}
			for i, w := range widths {
				if w > fair {
					widths[i] = w * (available - fixed) / flexible
				}
			}
			return widths
		}
		// A full-width table whose cells all fit an equal share (a
		// signature block) gets equal columns; otherwise widths keep
		// their proportions.
		equal := true
		for _, w := range widths {
			if w > available/float64(cols) {
				equal = false
			}
		}
		for i := range widths {
			if equal {
				widths[i] = available / float64(cols)
			} else {
				widths[i] *= available / total
			}
		}
	}
	setFont(pdf, false, 0)
	return widths
}

// letterheadHeightMM is a fixed height for the kop surat image, wide
// enough for a typical school header strip without needing to decode the
// image's own aspect ratio first; fpdf scales width to the page's
// printable area automatically when only one dimension is given.
const letterheadHeightMM = 25.0

// placeLetterhead registers imageBytes (JPEG or PNG, sniffed by content)
// and draws it at the top margin, then advances the cursor below it so
// the body text that follows does not overlap it.
func placeLetterhead(pdf *fpdf.Fpdf, imageBytes []byte) error {
	format := ""
	switch http.DetectContentType(imageBytes) {
	case "image/png":
		format = "PNG"
	case "image/jpeg":
		format = "JPG"
	default:
		return fmt.Errorf("render document pdf: letterhead must be JPEG or PNG")
	}
	const imageID = "letterhead"
	pdf.RegisterImageOptionsReader(imageID, fpdf.ImageOptions{ImageType: format}, bytes.NewReader(imageBytes))
	left, top, _, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	pdf.ImageOptions(imageID, left, top, pageWidth-2*left, letterheadHeightMM, false, fpdf.ImageOptions{ImageType: format}, 0, "")
	pdf.SetY(top + letterheadHeightMM + 4)
	return nil
}
