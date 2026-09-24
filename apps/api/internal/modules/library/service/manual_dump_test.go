package service

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// TestManualDumpLoansReport is not a real test; it renders a realistic
// loans report to disk for visual inspection. Skipped unless
// REPORTDOC_DUMP is set.
func TestManualDumpLoansReport(t *testing.T) {
	if os.Getenv("REPORTDOC_DUMP") == "" {
		t.Skip("set REPORTDOC_DUMP=1 to render a sample file to disk")
	}
	from := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 9, 30, 0, 0, 0, 0, time.UTC)
	returned := time.Date(2026, 9, 10, 0, 0, 0, 0, time.UTC)
	doc := reportdoc.Document{
		Title: "Laporan Peminjaman",
		Scope: []reportdoc.ScopeLine{periodScope(reportdoc.LocaleID, &from, &to)},
		Letterhead: &reportdoc.Letterhead{
			Lines: []string{"SMA Negeri 1 Denpasar", "Jl. Kamboja No. 4, Denpasar"},
		},
		Columns: loansReportColumns(),
		Sections: []reportdoc.Section{{
			Name: "Peminjaman",
			Rows: [][]any{
				{"Laskar Pelangi", "Budi Santoso", time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 9, 8, 0, 0, 0, 0, time.UTC), returned, loanStatusLabel(domain.LoanReturned), 0},
				{"Bumi Manusia", "Citra Dewi", time.Date(2026, 9, 3, 0, 0, 0, 0, time.UTC), time.Date(2026, 9, 10, 0, 0, 0, 0, time.UTC), nil, loanStatusLabel(domain.LoanActive), 5000},
			},
		}},
	}
	svc := &Service{}
	pdf, err := svc.renderLibraryReport(context.Background(), uuid.New(), reportdoc.LocaleID, doc, reportdoc.Options{Format: reportdoc.FormatPDF, ShowLetterhead: true})
	if err != nil {
		t.Fatal(err)
	}
	out := os.Getenv("REPORTDOC_DUMP_DIR")
	if out == "" {
		out = "/tmp"
	}
	if err := os.WriteFile(out+"/library_loans_report_sample.pdf", pdf, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Log("wrote " + out + "/library_loans_report_sample.pdf")
}
