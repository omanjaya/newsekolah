package reportdoc

import (
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func sampleDocument() Document {
	return Document{
		Letterhead: &Letterhead{Lines: []string{"SMA Negeri 1", "Jl. Merdeka No. 1"}},
		Title:      "Presensi Harian",
		Scope:      []ScopeLine{{Label: "Kelas", Value: "X-1"}},
		Columns: []Column{
			{Key: "no", Label: "No", Kind: ColumnNumber},
			{Key: "name", Label: "Nama", Kind: ColumnText},
			{Key: "date", Label: "Tanggal", Kind: ColumnDate},
		},
		Sections: []Section{
			{
				Name: "X-1",
				Rows: [][]any{
					{1, "Budi Santoso", time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)},
					{2, "Siti Aminah", time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)},
				},
			},
		},
	}
}

func TestApplyNoColumnsKeepsEverything(t *testing.T) {
	doc := sampleDocument()
	out, err := Apply(doc, Options{ShowLetterhead: true})
	require.NoError(t, err)
	assert.Equal(t, doc.Columns, out.Columns)
	assert.Equal(t, doc.Sections, out.Sections)
	assert.NotNil(t, out.Letterhead)
}

func TestApplyHidesLetterheadByDefault(t *testing.T) {
	doc := sampleDocument()
	out, err := Apply(doc, Options{})
	require.NoError(t, err)
	assert.Nil(t, out.Letterhead)
}

func TestApplyTitleOverride(t *testing.T) {
	doc := sampleDocument()
	out, err := Apply(doc, Options{Title: "Rekap Custom"})
	require.NoError(t, err)
	assert.Equal(t, "Rekap Custom", out.Title)
}

func TestApplyReordersAndRelabelsColumns(t *testing.T) {
	doc := sampleDocument()
	out, err := Apply(doc, Options{
		Columns: []ColumnChoice{
			{Key: "name", Label: "Nama Siswa"},
			{Key: "no"},
		},
	})
	require.NoError(t, err)
	require.Len(t, out.Columns, 2)
	assert.Equal(t, "name", out.Columns[0].Key)
	assert.Equal(t, "Nama Siswa", out.Columns[0].Label)
	assert.Equal(t, "no", out.Columns[1].Key)
	assert.Equal(t, "No", out.Columns[1].Label) // no override -> keeps original

	require.Len(t, out.Sections, 1)
	require.Len(t, out.Sections[0].Rows, 2)
	assert.Equal(t, []any{"Budi Santoso", 1}, out.Sections[0].Rows[0])
	assert.Equal(t, []any{"Siti Aminah", 2}, out.Sections[0].Rows[1])
}

func TestApplyUnknownColumnFails(t *testing.T) {
	doc := sampleDocument()
	_, err := Apply(doc, Options{Columns: []ColumnChoice{{Key: "nope"}}})
	require.Error(t, err)
	var unknown *UnknownColumnError
	require.True(t, errors.As(err, &unknown))
	assert.Equal(t, "nope", unknown.Key)
}

func TestApplyReordersFooterRows(t *testing.T) {
	doc := sampleDocument()
	doc.Sections[0].Footer = [][]any{{0, "Total", nil}}
	out, err := Apply(doc, Options{Columns: []ColumnChoice{{Key: "name"}, {Key: "no"}}})
	require.NoError(t, err)
	require.Len(t, out.Sections[0].Footer, 1)
	assert.Equal(t, []any{"Total", 0}, out.Sections[0].Footer[0])
}

func TestApplyDoesNotMutateInput(t *testing.T) {
	doc := sampleDocument()
	originalColumns := len(doc.Columns)
	_, err := Apply(doc, Options{Columns: []ColumnChoice{{Key: "no"}}})
	require.NoError(t, err)
	assert.Len(t, doc.Columns, originalColumns, "Apply must not mutate the input Document")
}

func TestColumnKindValid(t *testing.T) {
	assert.True(t, ColumnText.Valid())
	assert.True(t, ColumnNumber.Valid())
	assert.True(t, ColumnDate.Valid())
	assert.True(t, ColumnPercent.Valid())
	assert.False(t, ColumnKind("bogus").Valid())
}

func TestFormatValid(t *testing.T) {
	assert.True(t, FormatXLSX.Valid())
	assert.True(t, FormatPDF.Valid())
	assert.False(t, Format("csv").Valid())
}
