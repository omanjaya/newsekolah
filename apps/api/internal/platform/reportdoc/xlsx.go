package reportdoc

import (
	"bytes"
	"fmt"
	"image"
	_ "image/gif" // registers image.DecodeConfig support for GIF logos
	_ "image/jpeg"
	_ "image/png"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

// xlsxLetterheadLogoRows is how many rows tall the logo cell spans when a
// Letterhead.Logo is present, regardless of the image's own aspect ratio
// (RenderXLSX scales it to fit inside that block rather than reading its
// natural size into the layout).
const xlsxLetterheadLogoRows = 3

// defaultColWidth is used for any Column with Width <= 0.
const defaultColWidth = 16.0

// a4PaperSize is excelize's PageLayoutOptions.Size code for A4.
const a4PaperSize = 9

// RenderXLSX renders doc as a workbook with one sheet per Section: a
// letterhead block (logo + text lines), the title, the scope lines, a
// styled and frozen header row with autofilter, typed data cells, an
// optional totals row, a signature block, and A4-fit-to-width print
// settings with the header row repeated on every printed page.
func RenderXLSX(doc Document) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // an in-memory workbook cannot fail to close before WriteToBuffer

	styles, err := newXLSXStyles(f)
	if err != nil {
		return nil, err
	}

	sections := doc.Sections
	if len(sections) == 0 {
		sections = []Section{{Name: doc.Title}}
	}

	usedNames := make(map[string]bool, len(sections))
	for i, section := range sections {
		name := uniqueSheetName(section.Name, doc.Title, i, usedNames)
		if i == 0 {
			if err := f.SetSheetName("Sheet1", name); err != nil {
				return nil, fmt.Errorf("reportdoc: rename sheet: %w", err)
			}
		} else if _, err := f.NewSheet(name); err != nil {
			return nil, fmt.Errorf("reportdoc: add sheet %s: %w", name, err)
		}
		if err := writeXLSXSheet(f, name, doc, section, styles); err != nil {
			return nil, fmt.Errorf("reportdoc: sheet %q: %w", name, err)
		}
	}
	f.SetActiveSheet(0)

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, fmt.Errorf("reportdoc: write workbook: %w", err)
	}
	return buf.Bytes(), nil
}

type xlsxStyles struct {
	header, title, footer int
	// schoolName/letterheadPlain style a kop surat line normally; the
	// *Rule variants add the double bottom border that closes the
	// letterhead block, used only on that block's last line.
	schoolName, schoolNameRule                         int
	letterheadPlain, letterheadPlainRule               int
	signaturePlaceDate, signatureCenter, signatureName int
	data                                               dataStyles
}

// dataStyles holds one cell style per ColumnKind, reused across every row
// so typed cells (numbers, dates, percents) render with Excel's native
// numeric formatting rather than as plain text.
type dataStyles struct {
	text, number, date, percent int
}

func newXLSXStyles(f *excelize.File) (xlsxStyles, error) {
	header, err := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Color: "FFFFFF"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"1F2937"}, Pattern: 1},
		Alignment: &excelize.Alignment{Vertical: "center", WrapText: true},
		Border:    thinBorder(),
	})
	if err != nil {
		return xlsxStyles{}, fmt.Errorf("reportdoc: header style: %w", err)
	}
	title, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true, Size: 14}, Alignment: &excelize.Alignment{Horizontal: "center"}})
	if err != nil {
		return xlsxStyles{}, fmt.Errorf("reportdoc: title style: %w", err)
	}
	// schoolName is the letterhead's emphasised line: bold, visibly
	// larger than the other kop surat lines, centered. schoolNameRule is
	// the same, plus the double bottom border that closes the letterhead
	// block (RenderXLSX's equivalent of RenderPDF's double rule line),
	// used when the emphasised line is also the block's last line.
	schoolNameFont := &excelize.Font{Bold: true, Size: 14}
	schoolNameAlign := &excelize.Alignment{Horizontal: "center"}
	schoolName, err := f.NewStyle(&excelize.Style{Font: schoolNameFont, Alignment: schoolNameAlign})
	if err != nil {
		return xlsxStyles{}, fmt.Errorf("reportdoc: letterhead emphasis style: %w", err)
	}
	schoolNameRule, err := f.NewStyle(&excelize.Style{
		Font: schoolNameFont, Alignment: schoolNameAlign, Border: doubleBottomBorder(),
	})
	if err != nil {
		return xlsxStyles{}, fmt.Errorf("reportdoc: letterhead emphasis+rule style: %w", err)
	}
	plainFont := &excelize.Font{Size: 10}
	plainAlign := &excelize.Alignment{Horizontal: "center"}
	letterheadPlain, err := f.NewStyle(&excelize.Style{Font: plainFont, Alignment: plainAlign})
	if err != nil {
		return xlsxStyles{}, fmt.Errorf("reportdoc: letterhead plain style: %w", err)
	}
	letterheadPlainRule, err := f.NewStyle(&excelize.Style{
		Font: plainFont, Alignment: plainAlign, Border: doubleBottomBorder(),
	})
	if err != nil {
		return xlsxStyles{}, fmt.Errorf("reportdoc: letterhead plain+rule style: %w", err)
	}
	footer, err := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true}, Border: thinBorder(),
		Fill: excelize.Fill{Type: "pattern", Color: []string{"E5E7EB"}, Pattern: 1},
	})
	if err != nil {
		return xlsxStyles{}, fmt.Errorf("reportdoc: footer style: %w", err)
	}
	signaturePlaceDate, err := f.NewStyle(&excelize.Style{Alignment: &excelize.Alignment{Horizontal: "right"}})
	if err != nil {
		return xlsxStyles{}, fmt.Errorf("reportdoc: signature place/date style: %w", err)
	}
	signatureCenter, err := f.NewStyle(&excelize.Style{Alignment: &excelize.Alignment{Horizontal: "center"}})
	if err != nil {
		return xlsxStyles{}, fmt.Errorf("reportdoc: signature style: %w", err)
	}
	signatureName, err := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true, Underline: "single"}, Alignment: &excelize.Alignment{Horizontal: "center"},
	})
	if err != nil {
		return xlsxStyles{}, fmt.Errorf("reportdoc: signature name style: %w", err)
	}
	data, err := newDataStyles(f)
	if err != nil {
		return xlsxStyles{}, err
	}
	return xlsxStyles{
		header: header, title: title,
		schoolName: schoolName, schoolNameRule: schoolNameRule,
		letterheadPlain: letterheadPlain, letterheadPlainRule: letterheadPlainRule,
		signaturePlaceDate: signaturePlaceDate, signatureCenter: signatureCenter, signatureName: signatureName,
		footer: footer, data: data,
	}, nil
}

// doubleBottomBorder is Excel border style 6 (double line), the closing
// rule under a kop surat's letterhead block.
func doubleBottomBorder() []excelize.Border {
	return []excelize.Border{{Type: "bottom", Color: "1F2937", Style: 6}}
}

func newDataStyles(f *excelize.File) (dataStyles, error) {
	text, err := f.NewStyle(&excelize.Style{Border: thinBorder(), Alignment: &excelize.Alignment{Vertical: "center", WrapText: true}})
	if err != nil {
		return dataStyles{}, fmt.Errorf("reportdoc: text style: %w", err)
	}
	number, err := f.NewStyle(&excelize.Style{Border: thinBorder(), CustomNumFmt: strPtr("#,##0.##"), Alignment: &excelize.Alignment{Vertical: "center", Horizontal: "right"}})
	if err != nil {
		return dataStyles{}, fmt.Errorf("reportdoc: number style: %w", err)
	}
	date, err := f.NewStyle(&excelize.Style{Border: thinBorder(), CustomNumFmt: strPtr("dd/mm/yyyy"), Alignment: &excelize.Alignment{Vertical: "center", Horizontal: "center"}})
	if err != nil {
		return dataStyles{}, fmt.Errorf("reportdoc: date style: %w", err)
	}
	percent, err := f.NewStyle(&excelize.Style{Border: thinBorder(), CustomNumFmt: strPtr("0.0%"), Alignment: &excelize.Alignment{Vertical: "center", Horizontal: "right"}})
	if err != nil {
		return dataStyles{}, fmt.Errorf("reportdoc: percent style: %w", err)
	}
	return dataStyles{text: text, number: number, date: date, percent: percent}, nil
}

func (d dataStyles) forKind(kind ColumnKind) int {
	switch kind {
	case ColumnNumber:
		return d.number
	case ColumnDate:
		return d.date
	case ColumnPercent:
		return d.percent
	default:
		return d.text
	}
}

func thinBorder() []excelize.Border {
	sides := []string{"left", "top", "right", "bottom"}
	borders := make([]excelize.Border, len(sides))
	for i, side := range sides {
		borders[i] = excelize.Border{Type: side, Color: "9CA3AF", Style: 1}
	}
	return borders
}

func strPtr(s string) *string { return &s }
func intPtr(i int) *int       { return &i }

// writeXLSXSheet lays out one Section on an already-created sheet: the
// letterhead block, title, scope lines, the styled/frozen header row, the
// section's typed data rows, an optional totals block, the signature
// block, and print setup.
func writeXLSXSheet(f *excelize.File, sheet string, doc Document, section Section, styles xlsxStyles) error {
	cols := section.columns(doc)
	lastCol := len(cols)
	if lastCol == 0 {
		lastCol = 1
	}
	lastColName, err := excelize.ColumnNumberToName(lastCol)
	if err != nil {
		return fmt.Errorf("column name: %w", err)
	}

	row := 1
	if doc.Letterhead != nil {
		row, err = writeLetterhead(f, sheet, doc.Letterhead, lastCol, lastColName, styles)
		if err != nil {
			return err
		}
		row++
	}

	if doc.Title != "" {
		if err := writeMergedLine(f, sheet, row, lastColName, doc.Title, styles.title); err != nil {
			return err
		}
		row++
	}
	if section.Name != "" && section.Name != doc.Title {
		if err := writeMergedLine(f, sheet, row, lastColName, section.Name, styles.schoolName); err != nil {
			return err
		}
		row++
	}
	for _, line := range doc.Scope {
		if err := writeMergedLine(f, sheet, row, lastColName, fmt.Sprintf("%s: %s", line.Label, line.Value), 0); err != nil {
			return err
		}
		row++
	}
	if doc.Title != "" || len(doc.Scope) > 0 {
		row++ // blank row before the table
	}

	headerRow := row
	maxHeaderLines := 1
	for col, c := range cols {
		cell, err := excelize.CoordinatesToCellName(col+1, headerRow)
		if err != nil {
			return err
		}
		if err := f.SetCellValue(sheet, cell, c.Label); err != nil {
			return err
		}
		width := c.Width
		if width <= 0 {
			width = defaultColWidth
		}
		if n := wrapLineCount(c.Label, width-2); n > maxHeaderLines {
			maxHeaderLines = n
		}
	}
	headerRange := fmt.Sprintf("A%d:%s%d", headerRow, lastColName, headerRow)
	if err := f.SetCellStyle(sheet, fmt.Sprintf("A%d", headerRow), fmt.Sprintf("%s%d", lastColName, headerRow), styles.header); err != nil {
		return err
	}
	// WrapText alone auto-fits row height in Excel/LibreOffice once
	// opened, but an explicit height is a safety net for renderers that
	// do not recompute it (a straight XLSX->PDF/image conversion, for
	// instance), matching RenderPDF's own wrap-aware header height.
	if err := f.SetRowHeight(sheet, headerRow, float64(maxHeaderLines)*15); err != nil {
		return fmt.Errorf("header row height: %w", err)
	}

	dataRow := headerRow + 1
	if len(section.Rows) == 0 && len(section.Footer) == 0 && doc.EmptyRowsLabel != "" {
		if err := writeMergedLine(f, sheet, dataRow, lastColName, doc.EmptyRowsLabel, styles.data.text); err != nil {
			return err
		}
		dataRow++
	}
	for _, values := range section.Rows {
		if err := writeTypedRow(f, sheet, dataRow, cols, values, 0, styles); err != nil {
			return err
		}
		dataRow++
	}
	for _, values := range section.Footer {
		if err := writeTypedRow(f, sheet, dataRow, cols, values, styles.footer, styles); err != nil {
			return err
		}
		dataRow++
	}

	for col, c := range cols {
		colName, err := excelize.ColumnNumberToName(col + 1)
		if err != nil {
			return err
		}
		width := c.Width
		if width <= 0 {
			width = defaultColWidth
		}
		if err := f.SetColWidth(sheet, colName, colName, width); err != nil {
			return err
		}
	}

	if err := f.SetPanes(sheet, &excelize.Panes{
		Freeze: true, YSplit: headerRow,
		TopLeftCell: fmt.Sprintf("A%d", headerRow+1), ActivePane: "bottomLeft",
	}); err != nil {
		return fmt.Errorf("freeze panes: %w", err)
	}
	if len(cols) > 0 {
		if err := f.AutoFilter(sheet, headerRange, []excelize.AutoFilterOptions{}); err != nil {
			return fmt.Errorf("autofilter: %w", err)
		}
		if err := f.SetDefinedName(&excelize.DefinedName{
			Name: "_xlnm.Print_Titles", Scope: sheet,
			RefersTo: fmt.Sprintf("'%s'!$%d:$%d", sheet, headerRow, headerRow),
		}); err != nil {
			return fmt.Errorf("repeat header row: %w", err)
		}
	}

	if doc.Signature != nil {
		dataRow += 2
		if err := writeSignature(f, sheet, doc.Signature, dataRow, lastCol, styles); err != nil {
			return err
		}
	}

	orientation := "portrait"
	if lastCol > 8 {
		orientation = "landscape"
	}
	if err := f.SetPageLayout(sheet, &excelize.PageLayoutOptions{
		Size: intPtr(a4PaperSize), Orientation: strPtr(orientation),
		FitToWidth: intPtr(1), FitToHeight: intPtr(0),
	}); err != nil {
		return fmt.Errorf("page layout: %w", err)
	}
	return nil
}

// writeMergedLine writes one full-width line of text starting at column A,
// merging through lastColName when there is more than one column, with an
// optional style (0 means the sheet's default style).
func writeMergedLine(f *excelize.File, sheet string, row int, lastColName, text string, style int) error {
	cell := fmt.Sprintf("A%d", row)
	if lastColName != "A" {
		if err := f.MergeCell(sheet, cell, fmt.Sprintf("%s%d", lastColName, row)); err != nil {
			return fmt.Errorf("merge line: %w", err)
		}
	}
	if err := f.SetCellValue(sheet, cell, text); err != nil {
		return err
	}
	if style != 0 {
		if err := f.SetCellStyle(sheet, cell, cell, style); err != nil {
			return err
		}
	}
	return nil
}

// writeTypedRow writes one row of values starting at column A, keeping
// numbers numeric and dates as dates rather than stringifying everything.
// overrideStyle, when non-zero, replaces each column's normal data style
// (used for the footer/totals row); 0 means "use each column's own kind
// style".
func writeTypedRow(f *excelize.File, sheet string, row int, cols []Column, values []any, overrideStyle int, styles xlsxStyles) error {
	for col, c := range cols {
		var v any
		if col < len(values) {
			v = values[col]
		}
		cell, err := excelize.CoordinatesToCellName(col+1, row)
		if err != nil {
			return err
		}
		if err := setTypedCell(f, sheet, cell, c.Kind, v); err != nil {
			return err
		}
		style := overrideStyle
		if style == 0 {
			style = styles.data.forKind(c.Kind)
		}
		if err := f.SetCellStyle(sheet, cell, cell, style); err != nil {
			return err
		}
	}
	return nil
}

func setTypedCell(f *excelize.File, sheet, cell string, kind ColumnKind, v any) error {
	if v == nil {
		return nil
	}
	if kind == ColumnDate {
		if t, ok := v.(time.Time); ok {
			return f.SetCellValue(sheet, cell, t)
		}
	}
	return f.SetCellValue(sheet, cell, v)
}

// writeLetterhead places the logo (scaled to fit a fixed-height block) in
// column A and the school name/address lines beside it (or, with no logo,
// starting in column A), and returns the last row the block occupies.
func writeLetterhead(f *excelize.File, sheet string, lh *Letterhead, lastCol int, lastColName string, styles xlsxStyles) (int, error) {
	textCol := "A"
	blockRows := len(lh.Lines)
	if blockRows == 0 {
		blockRows = 1
	}
	if len(lh.Logo) > 0 {
		blockRows = maxInt(blockRows, xlsxLetterheadLogoRows)
		if lastCol > 1 {
			if err := f.MergeCell(sheet, "A1", fmt.Sprintf("A%d", blockRows)); err != nil {
				return 0, fmt.Errorf("merge logo cell: %w", err)
			}
			textCol = "B"
		}
		for r := 1; r <= blockRows; r++ {
			if err := f.SetRowHeight(sheet, r, 18); err != nil {
				return 0, fmt.Errorf("logo row height: %w", err)
			}
		}
		ext, err := imageExtension(lh.Logo)
		if err != nil {
			return 0, err
		}
		scale := logoScale(lh.Logo)
		if err := f.AddPictureFromBytes(sheet, "A1", &excelize.Picture{
			Extension: ext, File: lh.Logo,
			Format: &excelize.GraphicOptions{ScaleX: scale, ScaleY: scale, LockAspectRatio: true},
		}); err != nil {
			return 0, fmt.Errorf("embed logo: %w", err)
		}
	}

	emphasis := lh.Emphasis
	if emphasis < 0 || emphasis >= len(lh.Lines) {
		emphasis = 0
	}
	lastLine := len(lh.Lines) - 1
	for i, line := range lh.Lines {
		r := i + 1
		startCell := fmt.Sprintf("%s%d", textCol, r)
		if textCol != lastColName {
			if err := f.MergeCell(sheet, startCell, fmt.Sprintf("%s%d", lastColName, r)); err != nil {
				return 0, fmt.Errorf("merge letterhead line: %w", err)
			}
		}
		if err := f.SetCellValue(sheet, startCell, line); err != nil {
			return 0, err
		}
		style := styles.letterheadPlain
		switch {
		case i == emphasis && i == lastLine:
			style = styles.schoolNameRule
		case i == emphasis:
			style = styles.schoolName
		case i == lastLine:
			style = styles.letterheadPlainRule
		}
		if err := f.SetCellStyle(sheet, startCell, startCell, style); err != nil {
			return 0, err
		}
	}
	return blockRows, nil
}

// wrapLineCount approximates how many lines text wraps to at
// charsPerLine, greedily packing whole words the way a spreadsheet's own
// WrapText does -- not pixel-accurate, but exactly the same estimate
// used to size the header row's explicit height.
func wrapLineCount(text string, charsPerLine float64) int {
	if charsPerLine < 1 {
		charsPerLine = 1
	}
	words := strings.Fields(text)
	if len(words) == 0 {
		return 1
	}
	lines := 1
	lineLen := 0.0
	for _, w := range words {
		wl := float64(len(w))
		switch {
		case lineLen == 0:
			lineLen = wl
		case lineLen+1+wl > charsPerLine:
			lines++
			lineLen = wl
		default:
			lineLen += 1 + wl
		}
	}
	return lines
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// logoScale picks a uniform ScaleX/ScaleY so a logo of any resolution
// renders at a consistent, modest size in the letterhead block rather
// than at native pixel size (a phone-camera logo photo can be thousands
// of pixels wide).
func logoScale(logo []byte) float64 {
	const targetPx = 90.0
	cfg, _, err := image.DecodeConfig(bytes.NewReader(logo))
	if err != nil || cfg.Width == 0 || cfg.Height == 0 {
		return 1
	}
	largest := float64(cfg.Width)
	if cfg.Height > cfg.Width {
		largest = float64(cfg.Height)
	}
	scale := targetPx / largest
	if scale <= 0 || scale > 4 {
		return 1
	}
	return scale
}

func imageExtension(data []byte) (string, error) {
	switch http.DetectContentType(data) {
	case "image/png":
		return ".png", nil
	case "image/jpeg":
		return ".jpg", nil
	case "image/gif":
		return ".gif", nil
	default:
		return "", fmt.Errorf("letterhead logo must be PNG, JPEG or GIF")
	}
}

// writeSignature prints the place/date line, then one role/name/id column
// per signer, side by side, starting at row.
// writeSignature prints the place/date line right-aligned across the full
// width, then one block per signer -- centered within its own column
// range, side by side (two signers split the width in half, e.g. Wali
// Kelas left / Kepala Sekolah right, the standard Indonesian layout) --
// each with a bold, underlined name line and an optional identifier line.
func writeSignature(f *excelize.File, sheet string, sig *Signature, row, lastCol int, styles xlsxStyles) error {
	lastColName, err := excelize.ColumnNumberToName(lastCol)
	if err != nil {
		return err
	}
	if sig.Place != "" || sig.Date != "" {
		line := strings.TrimSpace(strings.Join(nonEmpty(sig.Place, sig.Date), ", "))
		if err := writeMergedLine(f, sheet, row, lastColName, line, styles.signaturePlaceDate); err != nil {
			return err
		}
		row += 2
	}
	if len(sig.Signers) == 0 {
		return nil
	}

	n := len(sig.Signers)
	blockCols := maxInt(1, lastCol/n)
	roleRow, nameRow, idRow := row, row+3, row+4
	for i, signer := range sig.Signers {
		startCol := i*blockCols + 1
		endCol := startCol + blockCols - 1
		if i == n-1 {
			endCol = lastCol // last block absorbs any remainder column
		}
		startColName, err := excelize.ColumnNumberToName(startCol)
		if err != nil {
			return err
		}
		endColName, err := excelize.ColumnNumberToName(endCol)
		if err != nil {
			return err
		}
		writeCell := func(r int, value string, style int) error {
			cell := fmt.Sprintf("%s%d", startColName, r)
			if endCol > startCol {
				if err := f.MergeCell(sheet, cell, fmt.Sprintf("%s%d", endColName, r)); err != nil {
					return err
				}
			}
			if err := f.SetCellValue(sheet, cell, value); err != nil {
				return err
			}
			return f.SetCellStyle(sheet, cell, cell, style)
		}
		if err := writeCell(roleRow, signer.RoleLabel+",", styles.signatureCenter); err != nil {
			return err
		}
		if err := writeCell(nameRow, signer.Name, styles.signatureName); err != nil {
			return err
		}
		if signer.IDLabel != "" {
			if err := writeCell(idRow, fmt.Sprintf("%s. %s", signer.IDLabel, signer.IDNumber), styles.signatureCenter); err != nil {
				return err
			}
		}
	}
	return nil
}

func nonEmpty(values ...string) []string {
	out := make([]string, 0, len(values))
	for _, v := range values {
		if v != "" {
			out = append(out, v)
		}
	}
	return out
}

var invalidSheetChars = regexp.MustCompile(`[:\\/?*\[\]]`)

// uniqueSheetName turns a Section.Name (falling back to the document
// title, then to a generic label) into a name Excel accepts: no
// [:\/?*[]] characters, at most 31 characters, not already used on this
// workbook.
func uniqueSheetName(name, fallback string, index int, used map[string]bool) string {
	if name == "" {
		name = fallback
	}
	if name == "" {
		name = fmt.Sprintf("Sheet%d", index+1)
	}
	name = invalidSheetChars.ReplaceAllString(name, " ")
	name = strings.TrimSpace(name)
	if len(name) > 31 {
		name = name[:31]
	}
	base := name
	suffix := 2
	for used[strings.ToLower(name)] {
		tail := fmt.Sprintf(" (%d)", suffix)
		max := 31 - len(tail)
		if max < 0 {
			max = 0
		}
		trimmed := base
		if len(trimmed) > max {
			trimmed = trimmed[:max]
		}
		name = trimmed + tail
		suffix++
	}
	used[strings.ToLower(name)] = true
	return name
}
