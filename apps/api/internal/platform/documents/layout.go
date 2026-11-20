package documents

import (
	"bytes"
	"regexp"
	"strconv"
	"strings"

	"golang.org/x/net/html"
)

// This file turns rendered template HTML into the small set of layout
// blocks htmlToPDF draws: paragraphs (with alignment, weight and size)
// and tables (rows of cells laid out as columns). It understands only
// what document templates use -- block tags, <br>, <table>/<tr>/<td>/<th>,
// <strong>/<b>, and the text-align, font-weight, font-size (pt) and
// padding-top (px) inline styles -- and ignores everything else, so it
// stays a letter layout, not a browser.

// Text alignment, as fpdf's alignStr expects it.
const (
	alignLeft   = "L"
	alignCenter = "C"
	alignRight  = "R"
)

// layoutParagraph is one block of text. Text may hold "\n" for a <br>.
type layoutParagraph struct {
	Text  string
	Align string
	Bold  bool
	Size  float64 // font size in points; 0 is the body size
}

type layoutCell struct {
	Text   string
	Align  string
	Bold   bool
	Header bool
}

type layoutRow struct {
	Cells []layoutCell
	// PadTop is extra space above the row in millimetres, from a cell's
	// padding-top (signature blocks leave room to sign that way).
	PadTop float64
}

type layoutTable struct {
	Border    bool
	FullWidth bool
	Rows      []layoutRow
}

// layoutBlock is either a paragraph or a table.
type layoutBlock struct {
	Paragraph *layoutParagraph
	Table     *layoutTable
}

// blockTags start and end a paragraph of their own.
var blockTags = map[string]bool{
	"p": true, "div": true, "li": true, "ul": true, "ol": true, "body": true, "html": true,
	"h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true,
	"section": true, "article": true, "header": true, "footer": true, "blockquote": true,
}

// headingSizes are the point sizes headings print at.
var headingSizes = map[string]float64{"h1": 18, "h2": 15, "h3": 13, "h4": 12, "h5": 12, "h6": 12}

// skippedTags hold no printable text.
var skippedTags = map[string]bool{"head": true, "style": true, "script": true, "title": true}

// voidTags have no end tag, so they are never pushed on the element stack.
var voidTags = map[string]bool{"br": true, "img": true, "hr": true, "meta": true, "link": true, "input": true, "col": true}

type element struct {
	tag    string
	align  string  // own text-align, "" when unset
	bold   bool    // own weight
	size   float64 // own font size, 0 when unset
	padTop float64
}

type layoutBuilder struct {
	stack  []element
	blocks []layoutBlock
	skip   int

	para      strings.Builder
	paraBold  bool // every printable rune so far was bold
	paraAny   bool
	paraAlign string
	paraSize  float64

	tables []*layoutTable
	row    *layoutRow
	cell   *layoutCell
	cellSB strings.Builder
}

// layoutHTML parses rendered template HTML into layout blocks.
func layoutHTML(rendered []byte) []layoutBlock {
	b := &layoutBuilder{}
	z := html.NewTokenizer(bytes.NewReader(rendered))
	for {
		tt := z.Next()
		switch tt {
		case html.ErrorToken:
			b.flushParagraph()
			b.closeTables()
			return b.blocks
		case html.TextToken:
			if b.skip == 0 {
				b.text(string(z.Text()))
			}
		case html.StartTagToken, html.SelfClosingTagToken:
			tok := z.Token()
			b.start(tok, tt == html.SelfClosingTagToken)
		case html.EndTagToken:
			tok := z.Token()
			b.end(tok.Data)
		}
	}
}

func (b *layoutBuilder) start(tok html.Token, selfClosing bool) {
	tag := tok.Data
	if skippedTags[tag] {
		if !selfClosing {
			b.skip++
		}
		return
	}
	el := element{tag: tag}
	style := attr(tok, "style")
	el.align = styleAlign(style, attr(tok, "align"))
	el.bold = tag == "strong" || tag == "b" || tag == "th" || headingSizes[tag] > 0 || styleBold(style)
	el.size = headingSizes[tag]
	if s := stylePoints(style, "font-size"); s > 0 {
		el.size = s
	}
	el.padTop = stylePixelsAsMM(style, "padding-top")

	switch {
	case tag == "br":
		if b.cell != nil {
			b.cellSB.WriteString(lineBreak)
		} else {
			b.para.WriteString(lineBreak)
		}
		return
	case tag == "table":
		b.flushParagraph()
		b.tables = append(b.tables, &layoutTable{
			Border:    attr(tok, "border") != "" && attr(tok, "border") != "0",
			FullWidth: styleFullWidth(style),
		})
	case tag == "tr":
		b.endRow()
		if len(b.tables) > 0 {
			b.row = &layoutRow{}
		}
	case tag == "td" || tag == "th":
		b.endCell()
		if b.row == nil && len(b.tables) > 0 {
			b.row = &layoutRow{}
		}
		if b.row != nil {
			b.cell = &layoutCell{Header: tag == "th"}
			b.cellSB.Reset()
		}
	case blockTags[tag]:
		b.flushParagraph()
	}
	if voidTags[tag] || selfClosing {
		return
	}
	b.stack = append(b.stack, el)
	switch {
	case tag == "td" || tag == "th":
		if b.cell != nil {
			b.cell.Align = b.currentAlign()
			b.cell.Bold = b.currentBold()
			if el.padTop > b.row.PadTop {
				b.row.PadTop = el.padTop
			}
		}
	case blockTags[tag]:
		b.paraAlign, b.paraSize = b.currentAlign(), b.currentSize()
	}
}

func (b *layoutBuilder) end(tag string) {
	if skippedTags[tag] {
		if b.skip > 0 {
			b.skip--
		}
		return
	}
	switch {
	case tag == "td" || tag == "th":
		b.endCell()
	case tag == "tr":
		b.endRow()
	case tag == "table":
		b.endRow()
		b.closeTable()
	case blockTags[tag]:
		b.flushParagraph()
	}
	// Pop back to the matching element; an unmatched end tag is ignored.
	for i := len(b.stack) - 1; i >= 0; i-- {
		if b.stack[i].tag == tag {
			b.stack = b.stack[:i]
			break
		}
	}
	if blockTags[tag] {
		b.paraAlign, b.paraSize = b.currentAlign(), b.currentSize()
	}
}

func (b *layoutBuilder) text(s string) {
	if b.cell != nil {
		b.cellSB.WriteString(s)
		return
	}
	if len(b.tables) > 0 && b.row != nil {
		return // stray text between cells
	}
	if strings.TrimSpace(s) != "" {
		bold := b.currentBold()
		if !b.paraAny {
			b.paraBold = bold
			b.paraAlign, b.paraSize = b.currentAlign(), b.currentSize()
		} else if !bold {
			b.paraBold = false
		}
		b.paraAny = true
	}
	b.para.WriteString(s)
}

func (b *layoutBuilder) flushParagraph() {
	text := collapseText(b.para.String())
	b.para.Reset()
	hadText := b.paraAny
	b.paraAny = false
	if !hadText || text == "" {
		return
	}
	b.blocks = append(b.blocks, layoutBlock{Paragraph: &layoutParagraph{
		Text: text, Align: orLeft(b.paraAlign), Bold: b.paraBold, Size: b.paraSize,
	}})
}

func (b *layoutBuilder) endCell() {
	if b.cell == nil || b.row == nil {
		b.cell = nil
		return
	}
	b.cell.Text = collapseText(b.cellSB.String())
	b.cell.Align = orLeft(b.cell.Align)
	b.row.Cells = append(b.row.Cells, *b.cell)
	b.cell = nil
	b.cellSB.Reset()
}

func (b *layoutBuilder) endRow() {
	b.endCell()
	if b.row == nil || len(b.tables) == 0 {
		b.row = nil
		return
	}
	if len(b.row.Cells) > 0 {
		t := b.tables[len(b.tables)-1]
		t.Rows = append(t.Rows, *b.row)
	}
	b.row = nil
}

func (b *layoutBuilder) closeTable() {
	if len(b.tables) == 0 {
		return
	}
	t := b.tables[len(b.tables)-1]
	b.tables = b.tables[:len(b.tables)-1]
	if len(t.Rows) > 0 {
		b.blocks = append(b.blocks, layoutBlock{Table: t})
	}
}

func (b *layoutBuilder) closeTables() {
	b.endRow()
	for len(b.tables) > 0 {
		b.closeTable()
	}
}

func (b *layoutBuilder) currentAlign() string {
	for i := len(b.stack) - 1; i >= 0; i-- {
		if b.stack[i].align != "" {
			return b.stack[i].align
		}
	}
	return ""
}

func (b *layoutBuilder) currentBold() bool {
	for i := len(b.stack) - 1; i >= 0; i-- {
		if b.stack[i].bold {
			return true
		}
	}
	return false
}

func (b *layoutBuilder) currentSize() float64 {
	for i := len(b.stack) - 1; i >= 0; i-- {
		if b.stack[i].size > 0 {
			return b.stack[i].size
		}
	}
	return 0
}

func orLeft(align string) string {
	if align == "" {
		return alignLeft
	}
	return align
}

var spaceRun = regexp.MustCompile(`[ \t\r\n\f]+`)

// lineBreak is what a <br> writes into the text being collected. It is a
// rune templates never contain, so source newlines (plain whitespace in
// HTML) and <br> line breaks stay apart until collapseText.
const lineBreak = " "

// collapseText collapses whitespace the way a browser does, then turns
// each <br> into "\n", dropping empty lines.
func collapseText(s string) string {
	parts := strings.Split(s, lineBreak)
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(spaceRun.ReplaceAllString(p, " "))
		if p != "" {
			out = append(out, p)
		}
	}
	return strings.Join(out, "\n")
}

func attr(tok html.Token, name string) string {
	for _, a := range tok.Attr {
		if a.Key == name {
			return strings.TrimSpace(a.Val)
		}
	}
	return ""
}

// styleValue returns one inline-style property's value, lower-cased.
func styleValue(style, prop string) string {
	for _, decl := range strings.Split(style, ";") {
		name, value, ok := strings.Cut(decl, ":")
		if ok && strings.EqualFold(strings.TrimSpace(name), prop) {
			return strings.ToLower(strings.TrimSpace(value))
		}
	}
	return ""
}

func styleAlign(style, alignAttr string) string {
	v := styleValue(style, "text-align")
	if v == "" {
		v = strings.ToLower(alignAttr)
	}
	switch v {
	case "center":
		return alignCenter
	case "right", "end":
		return alignRight
	case "left", "start", "justify":
		return alignLeft
	}
	return ""
}

func styleBold(style string) bool {
	v := styleValue(style, "font-weight")
	if v == "bold" || v == "bolder" {
		return true
	}
	n, err := strconv.Atoi(v)
	return err == nil && n >= 600
}

func styleFullWidth(style string) bool {
	return styleValue(style, "width") == "100%"
}

// stylePoints reads a "<n>pt" length (the unit document templates use for
// font sizes); any other unit is ignored.
func stylePoints(style, prop string) float64 {
	v := styleValue(style, prop)
	if !strings.HasSuffix(v, "pt") {
		return 0
	}
	n, err := strconv.ParseFloat(strings.TrimSuffix(v, "pt"), 64)
	if err != nil || n <= 0 || n > 72 {
		return 0
	}
	return n
}

// stylePixelsAsMM reads a "<n>px" length as millimetres (96 px per inch).
func stylePixelsAsMM(style, prop string) float64 {
	v := styleValue(style, prop)
	if !strings.HasSuffix(v, "px") {
		return 0
	}
	n, err := strconv.ParseFloat(strings.TrimSuffix(v, "px"), 64)
	if err != nil || n <= 0 || n > 400 {
		return 0
	}
	return n * 25.4 / 96
}
