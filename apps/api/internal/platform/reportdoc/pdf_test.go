package reportdoc

import (
	"bytes"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRenderPDFProducesValidFile(t *testing.T) {
	doc := sampleDocument()
	doc.Letterhead.Logo = testPNG(t, 200, 100)
	doc.Signature = &Signature{
		Place: "Denpasar", Date: "1 September 2026",
		Signers: []Signer{
			{RoleLabel: "Wali Kelas", Name: "Ni Made Sari", IDLabel: "NIP", IDNumber: "198001012005011001"},
			{RoleLabel: "Kepala Sekolah", Name: "I Wayan Arta", IDLabel: "NIP", IDNumber: "197001011999031002"},
		},
	}
	doc.PageLabelFormat = "Halaman {page} dari {pages}"

	out, err := RenderPDF(doc)
	require.NoError(t, err)
	require.NotEmpty(t, out)
	assert.Equal(t, "%PDF", string(out[:4]))
	assert.True(t, bytes.HasSuffix(bytes.TrimRight(out, "\n\r"), []byte("%%EOF")))
}

func TestRenderPDFNoLetterheadOrSignature(t *testing.T) {
	doc := sampleDocument()
	doc.Letterhead = nil
	doc.Signature = nil
	out, err := RenderPDF(doc)
	require.NoError(t, err)
	assert.Equal(t, "%PDF", string(out[:4]))
}

func TestRenderPDFMultipleSectionsStartNewPages(t *testing.T) {
	doc := sampleDocument()
	doc.Sections = []Section{
		{Name: "X-1", Rows: [][]any{{1, "Budi", time.Now()}}},
		{Name: "X-2", Rows: [][]any{{1, "Wayan", time.Now()}}},
		{Name: "X-3", Rows: [][]any{{1, "Kadek", time.Now()}}},
	}
	out, err := RenderPDF(doc)
	require.NoError(t, err)
	// A crude but effective page-count signal: fpdf emits one "/Type /Page"
	// object per page (distinct from "/Type /Pages", the page tree root).
	count := bytes.Count(out, []byte("/Type /Page\n"))
	assert.GreaterOrEqual(t, count, 3, "expected at least one PDF page object per section")
}

func TestRenderPDFManyRowsPaginate(t *testing.T) {
	doc := sampleDocument()
	rows := make([][]any, 80)
	for i := range rows {
		rows[i] = []any{i + 1, fmt.Sprintf("Siswa %d", i+1), time.Now()}
	}
	doc.Sections = []Section{{Name: "X-1", Rows: rows}}
	out, err := RenderPDF(doc)
	require.NoError(t, err)
	count := bytes.Count(out, []byte("/Type /Page\n"))
	assert.Greater(t, count, 1, "80 rows on one A4 page should paginate")
}

func TestRenderPDFWideTableGoesLandscape(t *testing.T) {
	doc := sampleDocument()
	// 12 wide columns should not fit a portrait page and force landscape.
	cols := make([]Column, 12)
	for i := range cols {
		cols[i] = Column{Key: fmt.Sprintf("c%d", i), Label: fmt.Sprintf("Column %d", i), Kind: ColumnText, Width: 20}
	}
	doc.Columns = cols
	row := make([]any, 12)
	for i := range row {
		row[i] = "x"
	}
	doc.Sections = []Section{{Name: "Wide", Rows: [][]any{row}}}

	out, err := RenderPDF(doc)
	require.NoError(t, err)
	// A4 landscape's MediaBox width in points (~841.89) exceeds its
	// portrait height (~595.28); look for the wide MediaBox as the
	// orientation signal since fpdf encodes orientation via page
	// dimensions, not a named keyword.
	assert.Contains(t, string(out), "841.89 595.28", "wide table should render on a landscape page")
}
