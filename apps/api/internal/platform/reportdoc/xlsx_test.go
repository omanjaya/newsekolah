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

func TestRenderXLSXNoSections(t *testing.T) {
	doc := Document{Title: "Kosong", Columns: []Column{{Key: "a", Label: "A", Kind: ColumnText}}}
	out, err := RenderXLSX(doc)
	require.NoError(t, err)
	f, err := excelize.OpenReader(bytes.NewReader(out))
	require.NoError(t, err)
	defer f.Close()
	assert.Len(t, f.GetSheetList(), 1)
}
