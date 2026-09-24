package service

import (
	"os"
	"testing"
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// TestManualDumpSupervisionReport is not a real test; it renders a
// realistic teacher supervision report to disk for visual inspection.
// Skipped unless REPORTDOC_DUMP is set.
func TestManualDumpSupervisionReport(t *testing.T) {
	if os.Getenv("REPORTDOC_DUMP") == "" {
		t.Skip("set REPORTDOC_DUMP=1 to render a sample file to disk")
	}
	report := sampleTeacherCycleReport()
	now := time.Date(2026, 9, 24, 0, 0, 0, 0, time.UTC)
	doc := buildTeacherReportDocument(report, "Pak Budi Hartono, S.Pd.", now, reportdoc.LocaleID)
	doc.Letterhead = &reportdoc.Letterhead{Lines: []string{"SMA Negeri 1 Denpasar", "Jl. Kamboja No. 4, Denpasar"}}

	pdf, err := renderReport(doc, reportdoc.Options{Format: reportdoc.FormatPDF, ShowLetterhead: true})
	if err != nil {
		t.Fatal(err)
	}
	out := os.Getenv("REPORTDOC_DUMP_DIR")
	if out == "" {
		out = "/tmp"
	}
	if err := os.WriteFile(out+"/supervision_report_sample.pdf", pdf, 0o644); err != nil {
		t.Fatal(err)
	}
	xlsx, err := renderReport(doc, reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(out+"/supervision_report_sample.xlsx", xlsx, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Log("wrote " + out + "/supervision_report_sample.pdf and .xlsx")
}
