package reportdoc

import (
	"fmt"
	"os"
	"testing"
)

func TestManualPaginateDump(t *testing.T) {
	if os.Getenv("REPORTDOC_DUMP") == "" {
		t.Skip("set REPORTDOC_DUMP=1")
	}
	doc := sampleDocument()
	rows := make([][]any, 40)
	for i := range rows {
		rows[i] = []any{i + 1, fmt.Sprintf("Siswa Nomor %d", i+1), nil}
	}
	doc.Sections = []Section{{Name: "X-1", Rows: rows}}
	doc.PageLabelFormat = "Halaman {page} dari {pages}"
	out, err := RenderPDF(doc)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile("/tmp/reportdoc_paginate.pdf", out, 0o644); err != nil {
		t.Fatal(err)
	}
}
