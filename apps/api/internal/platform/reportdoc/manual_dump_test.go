package reportdoc

import (
	"os"
	"testing"
	"time"
)

// TestManualDump is not a real test; it renders a realistic attendance
// document to disk so its output can be opened and eyeballed during
// development. Skipped unless REPORTDOC_DUMP is set.
func TestManualDump(t *testing.T) {
	if os.Getenv("REPORTDOC_DUMP") == "" {
		t.Skip("set REPORTDOC_DUMP=1 to render sample files to /tmp")
	}

	doc := Document{
		Letterhead: &Letterhead{
			Logo: testPNG(t, 240, 240),
			Lines: []string{
				"Yayasan Pendidikan Dharma Praja",
				"SMA Negeri 1 Denpasar",
				"Jl. Kamboja No. 4, Denpasar",
				"Telp. (0361) 123456",
			},
			Emphasis: 1, // the school name, not the foundation line
		},
		Title: "Presensi Harian",
		Scope: []ScopeLine{
			{Label: "Kelas", Value: "X-1"},
			{Label: "Tanggal", Value: FormatDate(LocaleID, time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC))},
		},
		Columns: []Column{
			{Key: "no", Label: "No", Kind: ColumnNumber, Width: 5},
			{Key: "name", Label: "Nama Siswa", Kind: ColumnText, Width: 28},
			{Key: "status", Label: "Status", Kind: ColumnText, Width: 12},
			{Key: "expected", Label: "Jumlah Sesi Diharapkan", Kind: ColumnNumber, Width: 12},
			{Key: "submitted", Label: "Jumlah Sesi Terisi", Kind: ColumnNumber, Width: 12},
			{Key: "complete", Label: "Lengkap", Kind: ColumnPercent, Width: 12},
		},
		Sections: []Section{
			{
				Name: "X-1",
				Rows: [][]any{
					{1, "Budi Santoso", "Hadir", 6, 6, 1.0},
					{2, "Siti Aminah", "Sakit", 6, 6, 1.0},
					{3, "Wayan Putra dengan nama yang cukup panjang untuk menguji pembungkusan teks", "Hadir", 6, 5, 0.83},
				},
				Footer: [][]any{{nil, "Total", nil, 18, 17, 0.94}},
			},
			{Name: "X-2"}, // no rows: exercises EmptyRowsLabel
		},
		Signature: &Signature{
			Place: "Denpasar", Date: FormatDate(LocaleID, time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)),
			Signers: []Signer{
				{RoleLabel: "Wali Kelas", Name: "Ni Made Sari, S.Pd.", IDLabel: "NIP", IDNumber: "198001012005011001"},
				{RoleLabel: "Kepala Sekolah", Name: "I Wayan Arta, M.Pd.", IDLabel: "NIP", IDNumber: "197001011999031002"},
			},
		},
		PageLabelFormat: PageLabel(LocaleID),
		EmptyRowsLabel:  EmptyRowsLabelFor(LocaleID),
	}

	xlsx, err := RenderXLSX(doc)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile("/tmp/reportdoc_sample.xlsx", xlsx, 0o644); err != nil {
		t.Fatal(err)
	}

	pdf, err := RenderPDF(doc)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile("/tmp/reportdoc_sample.pdf", pdf, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Log("wrote /tmp/reportdoc_sample.xlsx and /tmp/reportdoc_sample.pdf")
}
