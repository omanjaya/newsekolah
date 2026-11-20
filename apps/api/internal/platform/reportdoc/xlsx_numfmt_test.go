package reportdoc

import (
	"bytes"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"
)

// TestRenderXLSXWholeNumbersHaveNoDanglingSeparator pins the number
// format: "#,##0.##" shows 4 as "4." in Excel, so whole numbers take
// "#,##0" while fractions keep their decimals.
func TestRenderXLSXWholeNumbersHaveNoDanglingSeparator(t *testing.T) {
	doc := Document{
		Title:   "Angka",
		Columns: []Column{{Key: "label", Label: "Keterangan", Kind: ColumnText}, {Key: "value", Label: "Jumlah", Kind: ColumnNumber}},
		Sections: []Section{{Name: "Ringkasan", Rows: [][]any{
			{"Bulat", 4},
			{"Desimal", 1.25},
			{"Float bulat", 3.0},
		}}},
	}
	out, err := RenderXLSX(doc)
	require.NoError(t, err)
	f, err := excelize.OpenReader(bytes.NewReader(out))
	require.NoError(t, err)
	defer func() {
		_ = f.Close()
	}()
	sheet := f.GetSheetList()[0]
	rows, err := f.GetRows(sheet)
	require.NoError(t, err)

	numFmt := func(label string) string {
		t.Helper()
		for i, r := range rows {
			if len(r) > 0 && r[0] == label {
				id, err := f.GetCellStyle(sheet, "B"+strconv.Itoa(i+1))
				require.NoError(t, err)
				style, err := f.GetStyle(id)
				require.NoError(t, err)
				require.NotNil(t, style.CustomNumFmt)
				return *style.CustomNumFmt
			}
		}
		t.Fatalf("row %q not found", label)
		return ""
	}
	assert.Equal(t, "#,##0", numFmt("Bulat"))
	assert.Equal(t, "#,##0", numFmt("Float bulat"))
	assert.Equal(t, "#,##0.##", numFmt("Desimal"))
}
