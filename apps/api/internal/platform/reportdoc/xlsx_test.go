package reportdoc

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"
)

func testPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: 30, G: 64, B: 175, A: 255})
		}
	}
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, img))
	return buf.Bytes()
}

func TestRenderXLSXBasicLayout(t *testing.T) {
	doc := sampleDocument()
	doc.Sections[0].Footer = [][]any{{nil, "Total", nil}}
	doc.Signature = &Signature{
		Place: "Denpasar", Date: "1 September 2026",
		Signers: []Signer{{RoleLabel: "Wali Kelas", Name: "Ni Made Sari", IDLabel: "NIP", IDNumber: "198001012005011001"}},
	}

	out, err := RenderXLSX(doc)
	require.NoError(t, err)
	require.NotEmpty(t, out)

	f, err := excelize.OpenReader(bytes.NewReader(out))
	require.NoError(t, err)
	defer f.Close()

	sheets := f.GetSheetList()
	require.Len(t, sheets, 1)
	assert.Equal(t, "X-1", sheets[0])

	// Header row: 2 letterhead lines (rows 1-2) + title (row 3) + section
	// name (row 4, distinct from the title) + 1 scope line (row 5) + 1
	// blank separator (row 6) -> the column header row is row 7.
	headerRow := 7
	v, err := f.GetCellValue(sheets[0], "A"+strconv.Itoa(headerRow))
	require.NoError(t, err)
	assert.Equal(t, "No", v)
	v, err = f.GetCellValue(sheets[0], "B"+strconv.Itoa(headerRow))
	require.NoError(t, err)
	assert.Equal(t, "Nama", v)

	dataRow := headerRow + 1
	name, err := f.GetCellValue(sheets[0], "B"+strconv.Itoa(dataRow))
	require.NoError(t, err)
	assert.Equal(t, "Budi Santoso", name)

	// Totals row after both data rows.
	footerRow := dataRow + 2
	footerVal, err := f.GetCellValue(sheets[0], "B"+strconv.Itoa(footerRow))
	require.NoError(t, err)
	assert.Equal(t, "Total", footerVal)

	panes, err := f.GetPanes(sheets[0])
	require.NoError(t, err)
	assert.True(t, panes.Freeze)
	assert.Equal(t, headerRow, panes.YSplit)

	merges, err := f.GetMergeCells(sheets[0])
	require.NoError(t, err)
	assert.NotEmpty(t, merges, "title/scope lines should be merged across columns")
}

func TestRenderXLSXEmbedsLogoAndMultipleSheets(t *testing.T) {
	doc := sampleDocument()
	doc.Letterhead.Logo = testPNG(t, 200, 100)
	doc.Sections = []Section{
		{Name: "X-1", Rows: [][]any{{1, "Budi", time.Now()}}},
		{Name: "X-2", Rows: [][]any{{1, "Wayan", time.Now()}}},
	}

	out, err := RenderXLSX(doc)
	require.NoError(t, err)

	f, err := excelize.OpenReader(bytes.NewReader(out))
	require.NoError(t, err)
	defer f.Close()

	sheets := f.GetSheetList()
	require.Len(t, sheets, 2)
	assert.Equal(t, []string{"X-1", "X-2"}, sheets)

	pics, err := f.GetPictures(sheets[0], "A1")
	require.NoError(t, err)
	require.Len(t, pics, 1)
}

func TestRenderXLSXUniqueSheetNames(t *testing.T) {
	doc := sampleDocument()
	longName := "Kelas Sepuluh Ilmu Pengetahuan Alam Satu" // > 31 chars
	doc.Sections = []Section{
		{Name: longName, Rows: [][]any{{1, "A", time.Now()}}},
		{Name: longName, Rows: [][]any{{2, "B", time.Now()}}},
	}

	out, err := RenderXLSX(doc)
	require.NoError(t, err)

	f, err := excelize.OpenReader(bytes.NewReader(out))
	require.NoError(t, err)
	defer f.Close()

	sheets := f.GetSheetList()
	require.Len(t, sheets, 2)
	assert.NotEqual(t, sheets[0], sheets[1])
	for _, s := range sheets {
		assert.LessOrEqual(t, len(s), 31)
	}
}

func TestRenderXLSXLetterheadEmphasisIsBoldAndCentered(t *testing.T) {
	doc := sampleDocument()
	doc.Letterhead.Lines = []string{"Yayasan Dharma Praja", "SMA Negeri 1 Denpasar", "Jl. Merdeka"}
	doc.Letterhead.Emphasis = 1 // the school name, not the foundation line

	out, err := RenderXLSX(doc)
	require.NoError(t, err)
	f, err := excelize.OpenReader(bytes.NewReader(out))
	require.NoError(t, err)
	defer f.Close()
	sheet := f.GetSheetList()[0]

	emphasisStyleID, err := f.GetCellStyle(sheet, "A2")
	require.NoError(t, err)
	plainStyleID, err := f.GetCellStyle(sheet, "A1")
	require.NoError(t, err)
	assert.NotEqual(t, plainStyleID, emphasisStyleID, "the emphasised line must use a different (bold/larger) style than a plain line")

	emphasisStyle, err := f.GetStyle(emphasisStyleID)
	require.NoError(t, err)
	require.NotNil(t, emphasisStyle.Font)
	assert.True(t, emphasisStyle.Font.Bold)

	plainStyle, err := f.GetStyle(plainStyleID)
	require.NoError(t, err)
	require.NotNil(t, plainStyle.Font)
	assert.False(t, plainStyle.Font.Bold)

	// The last line (Jl. Merdeka, row 3) must carry the closing double
	// rule -- a bottom border of style 6 -- even though it is not the
	// emphasised line.
	lastLineStyleID, err := f.GetCellStyle(sheet, "A3")
	require.NoError(t, err)
	lastLineStyle, err := f.GetStyle(lastLineStyleID)
	require.NoError(t, err)
	require.Len(t, lastLineStyle.Border, 1)
	assert.Equal(t, "bottom", lastLineStyle.Border[0].Type)
	assert.Equal(t, 6, lastLineStyle.Border[0].Style)
}

func TestRenderXLSXEmptySectionRendersEmptyLabel(t *testing.T) {
	doc := sampleDocument()
	doc.Sections = []Section{{Name: "X-1"}} // no rows
	doc.EmptyRowsLabel = "Tidak ada data"

	out, err := RenderXLSX(doc)
	require.NoError(t, err)
	f, err := excelize.OpenReader(bytes.NewReader(out))
	require.NoError(t, err)
	defer f.Close()
	sheet := f.GetSheetList()[0]

	// Header row is row 7 for this fixture (2 letterhead lines + title +
	// section name + 1 scope line + 1 blank separator), so the
	// empty-label row is row 8 -- see TestRenderXLSXBasicLayout's
	// identical layout trace.
	v, err := f.GetCellValue(sheet, "A8")
	require.NoError(t, err)
	assert.Equal(t, "Tidak ada data", v)
}

func TestRenderXLSXHeaderRowHeightGrowsForLongLabels(t *testing.T) {
	doc := sampleDocument()
	doc.Columns[1] = Column{Key: "name", Label: "A very long column label that should wrap across several lines", Kind: ColumnText, Width: 10}

	out, err := RenderXLSX(doc)
	require.NoError(t, err)
	f, err := excelize.OpenReader(bytes.NewReader(out))
	require.NoError(t, err)
	defer f.Close()
	sheet := f.GetSheetList()[0]

	height, err := f.GetRowHeight(sheet, 7) // header row for this fixture
	require.NoError(t, err)
	assert.Greater(t, height, 20.0, "a long wrapped header label needs a taller header row than the default single line")
}

func TestRenderXLSXSectionColumnsOverridesDocumentColumns(t *testing.T) {
	// Mirrors the library catalogue accreditation summary: one sheet of
	// key/value indicators (2 columns), one sheet breaking titles down by
	// Dewey class (3 columns) -- Document.Columns stays empty since no
	// section shares a single column set.
	doc := Document{
		Title: "Ringkasan Katalog",
		Sections: []Section{
			{
				Name: "Ringkasan",
				Columns: []Column{
					{Key: "indicator", Label: "Indikator", Kind: ColumnText, Width: 30},
					{Key: "value", Label: "Nilai", Kind: ColumnText, Width: 16},
				},
				Rows: [][]any{{"Total Judul Aktif", "120"}},
			},
			{
				Name: "Judul per DDC",
				Columns: []Column{
					{Key: "code", Label: "Kelas DDC", Kind: ColumnText, Width: 12},
					{Key: "name", Label: "Nama", Kind: ColumnText, Width: 30},
					{Key: "count", Label: "Jumlah Judul", Kind: ColumnNumber, Width: 14},
				},
				Rows: [][]any{{"000", "Karya Umum", 5}},
			},
		},
	}

	out, err := RenderXLSX(doc)
	require.NoError(t, err)
	f, err := excelize.OpenReader(bytes.NewReader(out))
	require.NoError(t, err)
	defer f.Close()

	sheets := f.GetSheetList()
	require.Len(t, sheets, 2)

	// Title (row 1) + section name, distinct from the title (row 2) +
	// blank separator (row 3) -> header row 4, two columns.
	v, err := f.GetCellValue(sheets[0], "A4")
	require.NoError(t, err)
	assert.Equal(t, "Indikator", v)
	v, err = f.GetCellValue(sheets[0], "B4")
	require.NoError(t, err)
	assert.Equal(t, "Nilai", v)
	v, err = f.GetCellValue(sheets[0], "A5")
	require.NoError(t, err)
	assert.Equal(t, "Total Judul Aktif", v)
	// A third column must not exist on this sheet's header row.
	v, err = f.GetCellValue(sheets[0], "C4")
	require.NoError(t, err)
	assert.Empty(t, v)

	// Sheet 2 has its own, different three-column header, independent of
	// sheet 1's.
	v, err = f.GetCellValue(sheets[1], "A4")
	require.NoError(t, err)
	assert.Equal(t, "Kelas DDC", v)
	v, err = f.GetCellValue(sheets[1], "C4")
	require.NoError(t, err)
	assert.Equal(t, "Jumlah Judul", v)
	v, err = f.GetCellValue(sheets[1], "C5")
	require.NoError(t, err)
	assert.Equal(t, "5", v)
}

func TestRenderXLSXNoSections(t *testing.T) {
	doc := Document{Title: "Kosong", Columns: []Column{{Key: "a", Label: "A", Kind: ColumnText}}}
	out, err := RenderXLSX(doc)
	require.NoError(t, err)
	f, err := excelize.OpenReader(bytes.NewReader(out))
	require.NoError(t, err)
	defer f.Close()
	assert.Len(t, f.GetSheetList(), 1)
}
