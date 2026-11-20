// Package documents renders a document_templates row (an html/template
// body with named variables) into HTML and PDF. It is a leaf platform
// package: no module import, no database access -- callers pass a
// Template and a value map, get bytes back.
//
// The PDF path is deliberately not a full HTML layout engine (no
// chromedp/headless-browser dependency, per this module's brief): it
// executes the html/template, then lays the resulting tree out with
// github.com/go-pdf/fpdf (layout.go). It covers what letters and reports
// use -- headings, paragraphs with bold runs, alignment and spacing,
// lists, and tables drawn as real columns (bordered data tables,
// label/value rows, side-by-side signature blocks) -- and is not a
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
	// than as an <img> tag in Body: the layout does not draw images, so a
	// tag here would render nothing.
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

// htmlToPDF lays rendered HTML out on A4 pages (a new page when the text
// runs past the bottom margin), with letterhead (if non-empty, a JPEG or
// PNG) placed at the top of the first page. See layout for the HTML it
// understands.
func htmlToPDF(renderedHTML, letterhead []byte) ([]byte, error) {
	pdf, err := layoutPDF(renderedHTML, letterhead)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("write pdf output: %w", err)
	}
	return buf.Bytes(), nil
}

func layoutPDF(renderedHTML, letterhead []byte) (*fpdf.Fpdf, error) {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(pageMarginMM, pageMarginMM, pageMarginMM)
	pdf.SetAutoPageBreak(true, pageMarginMM)
	pdf.AddPage()
	pdf.SetFont("Helvetica", "", bodyFontSize)

	if len(letterhead) > 0 {
		if err := placeLetterhead(pdf, letterhead); err != nil {
			return nil, err
		}
	}
	if err := newLayout(pdf).render(renderedHTML); err != nil {
		return nil, err
	}
	return pdf, nil
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
