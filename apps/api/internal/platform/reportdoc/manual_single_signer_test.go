package reportdoc

import (
	"os"
	"testing"
)

func TestManualSingleSignerDump(t *testing.T) {
	if os.Getenv("REPORTDOC_DUMP") == "" {
		t.Skip("set REPORTDOC_DUMP=1")
	}
	doc := sampleDocument()
	doc.Letterhead.Emphasis = 0
	doc.Signature = &Signature{
		Place: "Denpasar", Date: "1 September 2026",
		Signers: []Signer{{RoleLabel: "Kepala Sekolah", Name: "I Wayan Arta, M.Pd.", IDLabel: "NIP", IDNumber: "197001011999031002"}},
	}
	out, err := RenderPDF(doc)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile("/tmp/reportdoc_single_signer.pdf", out, 0o644); err != nil {
		t.Fatal(err)
	}
}
