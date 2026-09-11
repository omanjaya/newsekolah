package domain

import "testing"

func TestNormalizeHeader(t *testing.T) {
	cases := map[string]string{
		"No. Induk":          "noinduk",
		"no induk":           "noinduk",
		"Jenis Bahan (kode)": "jenisbahankode",
		"Judul*":             "judul",
		"  Tahun Terbit  ":   "tahunterbit",
	}
	for in, want := range cases {
		if got := NormalizeHeader(in); got != want {
			t.Errorf("NormalizeHeader(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestMatchesAlias(t *testing.T) {
	aliases := []string{"No. Induk", "NoInduk", "Nomor Induk"}
	if !MatchesAlias("no induk", aliases) {
		t.Error("expected 'no induk' to match")
	}
	if !MatchesAlias("Nomor Induk", aliases) {
		t.Error("expected exact alias to match")
	}
	if MatchesAlias("Barcode", aliases) {
		t.Error("expected 'Barcode' not to match")
	}
}

func TestImportRowFromRaw_NoMapping(t *testing.T) {
	raw := map[string]any{
		"row_number": float64(3), "title": "Laskar Pelangi", "main_author": "Andrea Hirata", "material_type": "buku", "copies": "2",
	}
	row := ImportRowFromRaw(raw, nil)
	if row.RowNumber != 3 {
		t.Errorf("RowNumber = %d, want 3", row.RowNumber)
	}
	if row.Title != "Laskar Pelangi" {
		t.Errorf("Title = %q, want Laskar Pelangi", row.Title)
	}
	if row.MaterialTypeCode != "buku" {
		t.Errorf("MaterialTypeCode = %q, want buku", row.MaterialTypeCode)
	}
	if row.Copies != "2" {
		t.Errorf("Copies = %q, want 2", row.Copies)
	}
}

func TestImportRowFromRaw_WithMapping(t *testing.T) {
	raw := map[string]any{
		"row_number": "5", "Judul*": "Bumi Manusia", "Jenis Bahan (kode)": "buku",
	}
	mapping := map[string]string{"title": "Judul*", "material_type": "Jenis Bahan (kode)"}
	row := ImportRowFromRaw(raw, mapping)
	if row.RowNumber != 5 {
		t.Errorf("RowNumber = %d, want 5", row.RowNumber)
	}
	if row.Title != "Bumi Manusia" {
		t.Errorf("Title = %q, want Bumi Manusia", row.Title)
	}
	if row.MaterialTypeCode != "buku" {
		t.Errorf("MaterialTypeCode = %q, want buku", row.MaterialTypeCode)
	}
	// A field with no mapping entry stays empty even if the raw row has
	// a same-named key -- mapping is exhaustive once given.
	if row.Author != "" {
		t.Errorf("Author = %q, want empty (unmapped)", row.Author)
	}
}

func TestValidateImportRow(t *testing.T) {
	refs := ImportValidationRefs{
		MaterialTypeCodes: map[string]bool{"buku": true},
		CategoryCodes:     map[string]bool{"fiksi": true},
		LocationCodes:     map[string]bool{"rak-a": true},
		SourceCodes:       map[string]bool{"beli": true},
	}

	valid := ImportRow{Title: "Judul", MaterialTypeCode: "buku", CategoryCode: "fiksi"}
	if copies, msg, ok := ValidateImportRow(valid, refs); !ok || copies != 1 || msg != "" {
		t.Errorf("expected a valid row with copies=1, got copies=%d msg=%q ok=%v", copies, msg, ok)
	}

	noTitle := ImportRow{MaterialTypeCode: "buku", CategoryCode: "fiksi"}
	if _, _, ok := ValidateImportRow(noTitle, refs); ok {
		t.Error("expected a missing title to fail validation")
	}

	unknownMaterial := ImportRow{Title: "Judul", MaterialTypeCode: "majalah", CategoryCode: "fiksi"}
	if _, _, ok := ValidateImportRow(unknownMaterial, refs); ok {
		t.Error("expected an unknown material type code to fail validation")
	}

	unknownCategory := ImportRow{Title: "Judul", MaterialTypeCode: "buku", CategoryCode: "referensi"}
	if _, _, ok := ValidateImportRow(unknownCategory, refs); ok {
		t.Error("expected an unknown category code to fail validation")
	}

	badAccess := ImportRow{Title: "Judul", MaterialTypeCode: "buku", CategoryCode: "fiksi", Access: "dipinjamkan"}
	if _, _, ok := ValidateImportRow(badAccess, refs); ok {
		t.Error("expected an invalid access value to fail validation")
	}
	goodAccess := ImportRow{Title: "Judul", MaterialTypeCode: "buku", CategoryCode: "fiksi", Access: "loanable"}
	if _, _, ok := ValidateImportRow(goodAccess, refs); !ok {
		t.Error("expected a valid access value to pass validation")
	}

	unknownLocation := ImportRow{Title: "Judul", MaterialTypeCode: "buku", CategoryCode: "fiksi", LocationCode: "rak-z"}
	if _, _, ok := ValidateImportRow(unknownLocation, refs); ok {
		t.Error("expected an unknown location code to fail validation")
	}

	badYear := ImportRow{Title: "Judul", MaterialTypeCode: "buku", CategoryCode: "fiksi", PublishYear: "abcd"}
	if _, _, ok := ValidateImportRow(badYear, refs); ok {
		t.Error("expected a non-numeric publish year to fail validation")
	}

	badPrice := ImportRow{Title: "Judul", MaterialTypeCode: "buku", CategoryCode: "fiksi", Price: "mahal"}
	if _, _, ok := ValidateImportRow(badPrice, refs); ok {
		t.Error("expected a non-numeric price to fail validation")
	}

	zeroCopies := ImportRow{Title: "Judul", MaterialTypeCode: "buku", CategoryCode: "fiksi", Copies: "0"}
	if _, _, ok := ValidateImportRow(zeroCopies, refs); ok {
		t.Error("expected copies=0 to fail validation")
	}

	explicitCopies := ImportRow{Title: "Judul", MaterialTypeCode: "buku", CategoryCode: "fiksi", Copies: "5"}
	if copies, _, ok := ValidateImportRow(explicitCopies, refs); !ok || copies != 5 {
		t.Errorf("expected copies=5, got copies=%d ok=%v", copies, ok)
	}
}
