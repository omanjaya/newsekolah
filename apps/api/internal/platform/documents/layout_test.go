package documents

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func paragraphs(blocks []layoutBlock) []layoutParagraph {
	var out []layoutParagraph
	for _, b := range blocks {
		if b.Paragraph != nil {
			out = append(out, *b.Paragraph)
		}
	}
	return out
}

func tables(blocks []layoutBlock) []layoutTable {
	var out []layoutTable
	for _, b := range blocks {
		if b.Table != nil {
			out = append(out, *b.Table)
		}
	}
	return out
}

func cellTexts(r layoutRow) []string {
	out := make([]string, len(r.Cells))
	for i, c := range r.Cells {
		out[i] = c.Text
	}
	return out
}

// TestLayoutKeepsTableCellsApart pins the receipt that printed
// "SPP Bulanan2026-11100000": cells of one row stay separate columns.
func TestLayoutKeepsTableCellsApart(t *testing.T) {
	blocks := layoutHTML([]byte(`<table border="1"><tr><th>Jenis Biaya</th><th>Periode</th><th>Jumlah</th></tr>
<tr><td>SPP Bulanan</td><td>November 2026</td><td>Rp 100.000</td></tr></table>`))
	tbls := tables(blocks)
	require.Len(t, tbls, 1)
	require.True(t, tbls[0].Border)
	require.Len(t, tbls[0].Rows, 2)
	require.Equal(t, []string{"Jenis Biaya", "Periode", "Jumlah"}, cellTexts(tbls[0].Rows[0]))
	require.Equal(t, []string{"SPP Bulanan", "November 2026", "Rp 100.000"}, cellTexts(tbls[0].Rows[1]))
	require.True(t, tbls[0].Rows[0].Cells[0].Header)
	require.True(t, tbls[0].Rows[0].Cells[0].Bold, "header cells print bold")
	require.False(t, tbls[0].Rows[1].Cells[0].Bold)
}

func TestLayoutAlignmentAndWeight(t *testing.T) {
	blocks := layoutHTML([]byte(`<html><body style="font-family: sans-serif;">
<h2 style="text-align:center; margin-bottom: 4px;">KWITANSI PEMBAYARAN</h2>
<p style="text-align:center; margin-top:0;">Nomor: 5/KWT/XI/2026</p>
<p>Kode verifikasi: <strong>ABC</strong></p>
<p><strong>Catatan</strong></p>
<p style="text-align: right">Kanan</p>
</body></html>`))
	ps := paragraphs(blocks)
	require.Len(t, ps, 5)
	require.Equal(t, layoutParagraph{Text: "KWITANSI PEMBAYARAN", Align: alignCenter, Bold: true, Size: 15}, ps[0])
	require.Equal(t, layoutParagraph{Text: "Nomor: 5/KWT/XI/2026", Align: alignCenter}, ps[1])
	require.Equal(t, layoutParagraph{Text: "Kode verifikasi: ABC", Align: alignLeft}, ps[2], "a partly bold paragraph prints regular")
	require.True(t, ps[3].Bold, "a paragraph that is all <strong> prints bold")
	require.Equal(t, alignRight, ps[4].Align)
}

func TestLayoutInheritsAlignmentAndSizeFromBody(t *testing.T) {
	blocks := layoutHTML([]byte(`<body style="text-align: center;"><h2>TAMU</h2>
<p style="font-size: 20pt; font-weight: bold;">Budi</p><p>Keperluan: rapat</p></body>`))
	ps := paragraphs(blocks)
	require.Len(t, ps, 3)
	for _, p := range ps {
		require.Equal(t, alignCenter, p.Align)
	}
	require.Equal(t, 20.0, ps[1].Size)
	require.True(t, ps[1].Bold)
}

func TestLayoutLineBreaksAndWhitespace(t *testing.T) {
	blocks := layoutHTML([]byte("<p>Baris satu<br>Baris\n   dua &amp; tiga</p>"))
	ps := paragraphs(blocks)
	require.Len(t, ps, 1)
	require.Equal(t, "Baris satu\nBaris dua & tiga", ps[0].Text, "a <br> breaks the line; a source newline is a space")
}

func TestLayoutSignatureTablePadding(t *testing.T) {
	blocks := layoutHTML([]byte(`<table style="width:100%; text-align:center;">
<tr><td>Siswa</td><td>Guru BK</td></tr>
<tr><td style="padding-top:70px;">(....)</td><td style="padding-top:70px;">Bu Guru</td></tr>
</table>`))
	tbls := tables(blocks)
	require.Len(t, tbls, 1)
	require.True(t, tbls[0].FullWidth)
	require.False(t, tbls[0].Border)
	require.Equal(t, alignCenter, tbls[0].Rows[0].Cells[0].Align)
	require.InDelta(t, 18.5, tbls[0].Rows[1].PadTop, 0.1, "70px of padding leaves room to sign")
}

func TestLayoutSkipsHeadAndStyle(t *testing.T) {
	blocks := layoutHTML([]byte(`<html><head><title>X</title><style>p { color: red }</style></head><body><p>Isi</p></body></html>`))
	ps := paragraphs(blocks)
	require.Len(t, ps, 1)
	require.Equal(t, "Isi", ps[0].Text)
}
