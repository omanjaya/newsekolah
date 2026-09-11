package domain

import (
	"strconv"
	"strings"
)

// ImportRow is one row of a collection import, whichever XLSX or JSON
// source it came from -- the internal field set every import ultimately
// normalizes to (old app: libraryImportRow).
type ImportRow struct {
	RowNumber        int
	Title            string
	Author           string
	Publisher        string
	PublishPlace     string
	PublishYear      string
	ISBN             string
	DDC              string
	Subjects         string
	MaterialTypeCode string
	CategoryCode     string
	Access           string
	LocationCode     string
	SourceCode       string
	AcquiredOn       string
	Price            string
	AccessionNumber  string
	Barcode          string
	Copies           string
	CallNumber       string
}

// ImportFieldDef is one field an import row can carry: its internal key,
// a human label, whether it is required, and the header spellings
// (INLISLite export conventions included) that identify it in a source
// sheet when the caller supplies a `mapping`.
type ImportFieldDef struct {
	Key      string
	Label    string
	Required bool
	Aliases  []string
}

// ImportFieldDefs is the 19 fields a collection import recognizes: the 18
// columns the template offers plus call_number, which only a mapped
// import can fill (a fresh template always leaves it for auto-generation)
// (old app: libraryImportFieldDefs).
func ImportFieldDefs() []ImportFieldDef {
	return []ImportFieldDef{
		{Key: "title", Label: "Judul", Required: true, Aliases: []string{"Judul", "Judul*", "Title", "Judul Buku"}},
		{Key: "main_author", Label: "Pengarang", Aliases: []string{"Pengarang", "Penulis", "Author", "Nama Pengarang", "Pengarang Utama"}},
		{Key: "publisher", Label: "Penerbit", Aliases: []string{"Penerbit", "Publisher"}},
		{Key: "publish_place", Label: "Tempat Terbit", Aliases: []string{"Tempat Terbit", "Kota Terbit", "Place"}},
		{Key: "publish_year", Label: "Tahun Terbit", Aliases: []string{"Tahun", "Tahun Terbit", "Publish Year"}},
		{Key: "isbn", Label: "ISBN", Aliases: []string{"ISBN", "ISBN/ISSN", "No. ISBN", "Nomor ISBN"}},
		{Key: "ddc_number", Label: "Nomor DDC", Aliases: []string{"DDC", "No. Klas", "NoKlas", "Nomor Klasifikasi", "Klasifikasi", "No Kelas"}},
		{Key: "subjects", Label: "Subjek", Aliases: []string{"Subjek", "Subject", "Tajuk Subjek"}},
		{Key: "material_type", Label: "Jenis Bahan (kode)", Required: true, Aliases: []string{"Jenis Bahan (kode)", "Jenis Bahan", "Jenis Koleksi", "GMD", "Jenis Materi"}},
		{Key: "category", Label: "Kategori Koleksi (kode)", Required: true, Aliases: []string{"Kategori (kode)", "Kategori Koleksi", "Kategori"}},
		{Key: "access", Label: "Akses", Aliases: []string{"Akses", "Access"}},
		{Key: "location", Label: "Lokasi (kode)", Aliases: []string{"Lokasi (kode)", "Lokasi Ruang", "Lokasi", "Rak"}},
		{Key: "source", Label: "Sumber (kode)", Aliases: []string{"Sumber (kode)", "Sumber Pengadaan", "Sumber", "Asal"}},
		{Key: "acquired_on", Label: "Tanggal Pengadaan", Aliases: []string{"Tanggal Pengadaan", "Tanggal Perolehan", "Tanggal Terima"}},
		{Key: "price", Label: "Harga", Aliases: []string{"Harga", "Price", "Harga Satuan"}},
		{Key: "no_induk", Label: "No. Induk", Aliases: []string{"No. Induk", "NoInduk", "Nomor Induk", "No Induk"}},
		{Key: "barcode", Label: "Barcode", Aliases: []string{"Barcode", "Nomor Barcode", "NomorBarcode", "Kode Batang"}},
		{Key: "copies", Label: "Jumlah Eksemplar", Aliases: []string{"Jumlah Eksemplar", "Jumlah", "Eksemplar", "Copies"}},
		{Key: "call_number", Label: "Nomor Panggil", Aliases: []string{"Nomor Panggil", "CallNumber", "No. Panggil"}},
	}
}

// NormalizeHeader folds a column header down to bare letters and digits
// for case/punctuation-insensitive comparison ("No. Induk" and "no induk"
// both become "noinduk") (old app: libraryNormalizeHeader).
func NormalizeHeader(value string) string {
	var out strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(value)) {
		switch r {
		case ' ', '.', '-', '_', '/', '(', ')', '*':
			continue
		}
		out.WriteRune(r)
	}
	return out.String()
}

// MatchesAlias reports whether header identifies the same column as one
// of aliases, ignoring case and punctuation.
func MatchesAlias(header string, aliases []string) bool {
	normalized := NormalizeHeader(header)
	if normalized == "" {
		return false
	}
	for _, alias := range aliases {
		if NormalizeHeader(alias) == normalized {
			return true
		}
	}
	return false
}

// LookupRawValue finds column's value in a raw row, trying an exact key
// match first and falling back to a normalized (case/punctuation
// insensitive) match -- so a mapping's column name does not have to be
// byte-identical to the source sheet's header (old app:
// libraryLookupRawValue).
func LookupRawValue(raw map[string]any, column string) (string, bool) {
	if v, ok := raw[column]; ok {
		return stringifyRawValue(v)
	}
	normalizedTarget := NormalizeHeader(column)
	for k, v := range raw {
		if NormalizeHeader(k) == normalizedTarget {
			return stringifyRawValue(v)
		}
	}
	return "", false
}

func stringifyRawValue(v any) (string, bool) {
	if v == nil {
		return "", false
	}
	switch value := v.(type) {
	case string:
		return value, true
	case float64:
		return strconv.FormatFloat(value, 'f', -1, 64), true
	default:
		return "", false
	}
}

// ImportRowFromRaw turns one raw row into an ImportRow. With no mapping,
// raw's keys are read directly as the internal field names above; with a
// mapping (internal field -> source column name), each field is read
// through LookupRawValue using its mapped column instead. row_number is
// always read directly, never through the mapping (old app:
// libraryImportRowFromRaw).
func ImportRowFromRaw(raw map[string]any, mapping map[string]string) ImportRow {
	var row ImportRow
	if rn, ok := raw["row_number"]; ok {
		switch v := rn.(type) {
		case float64:
			row.RowNumber = int(v)
		case string:
			row.RowNumber, _ = strconv.Atoi(strings.TrimSpace(v))
		}
	}

	get := func(field string) string {
		if len(mapping) == 0 {
			if v, ok := LookupRawValue(raw, field); ok {
				return strings.TrimSpace(v)
			}
			return ""
		}
		column, ok := mapping[field]
		if !ok || strings.TrimSpace(column) == "" {
			return ""
		}
		if v, ok := LookupRawValue(raw, column); ok {
			return strings.TrimSpace(v)
		}
		return ""
	}

	row.Title = get("title")
	row.Author = get("main_author")
	row.Publisher = get("publisher")
	row.PublishPlace = get("publish_place")
	row.PublishYear = get("publish_year")
	row.ISBN = get("isbn")
	row.DDC = get("ddc_number")
	row.Subjects = get("subjects")
	row.MaterialTypeCode = get("material_type")
	row.CategoryCode = get("category")
	row.Access = get("access")
	row.LocationCode = get("location")
	row.SourceCode = get("source")
	row.AcquiredOn = get("acquired_on")
	row.Price = get("price")
	row.AccessionNumber = get("no_induk")
	row.Barcode = get("barcode")
	row.Copies = get("copies")
	row.CallNumber = get("call_number")
	return row
}

// ImportValidationRefs is the set of master-data codes (lower-cased) a
// row's material type/category/location/source must be found in for the
// row to validate.
type ImportValidationRefs struct {
	MaterialTypeCodes map[string]bool
	CategoryCodes     map[string]bool
	LocationCodes     map[string]bool
	SourceCodes       map[string]bool
}

// ValidateImportRow is a pure, database-free check of one row: title is
// required, material type and category codes must exist, access (if
// given) must be a real value, location/source (if given) must exist,
// year and price must be numeric, and copies defaults to 1 but must be a
// positive integer when given (old app: libraryValidateImportRow).
func ValidateImportRow(row ImportRow, refs ImportValidationRefs) (copies int, message string, ok bool) {
	if strings.TrimSpace(row.Title) == "" {
		return 0, "Judul wajib diisi.", false
	}
	materialCode := strings.ToLower(strings.TrimSpace(row.MaterialTypeCode))
	if materialCode == "" || !refs.MaterialTypeCodes[materialCode] {
		return 0, "Jenis bahan (kode) tidak dikenali.", false
	}
	categoryCode := strings.ToLower(strings.TrimSpace(row.CategoryCode))
	if categoryCode == "" || !refs.CategoryCodes[categoryCode] {
		return 0, "Kategori (kode) tidak dikenali.", false
	}
	if access := strings.TrimSpace(row.Access); access != "" && !CopyAccess(access).Valid() {
		return 0, "Akses tidak dikenali.", false
	}
	if code := strings.ToLower(strings.TrimSpace(row.LocationCode)); code != "" && !refs.LocationCodes[code] {
		return 0, "Lokasi (kode) tidak dikenali.", false
	}
	if code := strings.ToLower(strings.TrimSpace(row.SourceCode)); code != "" && !refs.SourceCodes[code] {
		return 0, "Sumber (kode) tidak dikenali.", false
	}
	if y := strings.TrimSpace(row.PublishYear); y != "" {
		if _, err := strconv.Atoi(y); err != nil {
			return 0, "Tahun terbit harus berupa angka.", false
		}
	}
	if p := strings.TrimSpace(row.Price); p != "" {
		if _, err := strconv.Atoi(p); err != nil {
			return 0, "Harga harus berupa angka.", false
		}
	}
	copies = 1
	if c := strings.TrimSpace(row.Copies); c != "" {
		n, err := strconv.Atoi(c)
		if err != nil || n < 1 {
			return 0, "Jumlah eksemplar harus berupa angka minimal 1.", false
		}
		copies = n
	}
	return copies, "", true
}
