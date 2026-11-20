package documents

import (
	"bytes"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// textRun is one string fpdf drew, at its position in points (origin at
// the bottom left, so a larger y is higher on the page).
type textRun struct {
	x, y float64
	text string
}

var (
	textOp       = regexp.MustCompile(`BT ([\d.]+) ([\d.]+) Td \(((?:\\.|[^\\)])*)\) ?Tj ET`)
	pdfStringEsc = strings.NewReplacer(`\(`, "(", `\)`, ")", `\\`, `\`)
)

// drawnText lays body out and returns every text run in the page stream,
// uncompressed so the operators can be read back.
func drawnText(t *testing.T, body string) []textRun {
	t.Helper()
	pdf, err := layoutPDF([]byte(body), nil)
	require.NoError(t, err)
	pdf.SetCompression(false)
	var buf bytes.Buffer
	require.NoError(t, pdf.Output(&buf))
	var runs []textRun
	for _, m := range textOp.FindAllStringSubmatch(buf.String(), -1) {
		x, _ := strconv.ParseFloat(m[1], 64)
		y, _ := strconv.ParseFloat(m[2], 64)
		runs = append(runs, textRun{x: x, y: y, text: pdfStringEsc.Replace(m[3])})
	}
	return runs
}

func findRun(t *testing.T, runs []textRun, text string) textRun {
	t.Helper()
	for _, r := range runs {
		if r.text == text {
			return r
		}
	}
	require.Failf(t, "text not drawn on its own", "%q not found in %v", text, runs)
	return textRun{}
}

// TestLayoutDrawsTableCellsAsColumns is the regression test for printed
// warning letters and reports whose table cells ran together
// ("TanggalPelanggaranPoin", "Orang Tua/WaliSiswaGuru BK"): each cell is
// drawn on its own, the cells of a row side by side on one line.
func TestLayoutDrawsTableCellsAsColumns(t *testing.T) {
	runs := drawnText(t, `<h2 style="text-align:center;">SURAT PERINGATAN 1</h2>
<table>
<tr><td>Nama</td><td>: Siswa Contoh</td></tr>
</table>
<table border="1" cellpadding="4" cellspacing="0">
<tr><th>Tanggal</th><th>Pelanggaran</th><th>Poin</th></tr>
<tr><td>20-11-2026</td><td>Tidak mengerjakan tugas</td><td>10</td></tr>
</table>
<p>Kode verifikasi: <strong>ABC123</strong></p>
<table style="width:100%; margin-top:60px; text-align:center;">
<tr><td>Orang Tua/Wali</td><td>Siswa</td><td>Guru BK</td></tr>
<tr><td style="padding-top:70px;">(....................)</td><td style="padding-top:70px;">Siswa Contoh</td><td style="padding-top:70px;">Admin Contoh</td></tr>
</table>`)

	sameRow := func(texts ...string) []textRun {
		t.Helper()
		row := make([]textRun, len(texts))
		for i, text := range texts {
			row[i] = findRun(t, runs, text)
			require.InDelta(t, row[0].y, row[i].y, 0.01, "%q is not on the same line as %q", text, texts[0])
			if i > 0 {
				require.Greater(t, row[i].x, row[i-1].x+20, "%q does not sit in a column right of %q", text, texts[i-1])
			}
		}
		return row
	}

	sameRow("Nama", ": Siswa Contoh")
	header := sameRow("Tanggal", "Pelanggaran", "Poin")
	values := sameRow("20-11-2026", "Tidak mengerjakan tugas", "10")
	for i := range header {
		require.InDelta(t, header[i].x, values[i].x, 0.01, "a value is not under its column heading")
	}
	captions := sameRow("Orang Tua/Wali", "Siswa", "Guru BK")
	signers := sameRow("(....................)", "Siswa Contoh", "Admin Contoh")
	require.Less(t, signers[0].y, captions[0].y-50, "the signature line sits well below its caption")

	// The heading is centred: it starts well right of the left margin.
	heading := findRun(t, runs, "SURAT PERINGATAN 1")
	require.Greater(t, heading.x, findRun(t, runs, "Nama").x+100)
	// Bold runs inside a paragraph keep their surrounding text.
	findRun(t, runs, "Kode verifikasi: ")
	findRun(t, runs, "ABC123")
}

// TestFitColumnsKeepsShortColumnsWhole keeps a date or points column on
// one line when another column's text is too long for the page.
func TestFitColumnsKeepsShortColumnsWhole(t *testing.T) {
	widths := fitColumns([]float64{25, 300, 12}, 170)
	require.InDelta(t, 25, widths[0], 0.001)
	require.InDelta(t, 12, widths[2], 0.001)
	require.InDelta(t, 133, widths[1], 0.001)
}

func TestLayoutBreaksLongTablesOntoNewPages(t *testing.T) {
	var rows strings.Builder
	for i := range 80 {
		fmt.Fprintf(&rows, "<tr><td>%d</td><td>Pelanggaran</td></tr>", i)
	}
	pdf, err := layoutPDF([]byte(`<table border="1">`+rows.String()+`</table>`), nil)
	require.NoError(t, err)
	require.Greater(t, pdf.PageCount(), 1)
}
