// Package domain (this file): parsing for a Dapodik student-export CSV.
// Dapodik (Data Pokok Pendidikan) is the Ministry of Education's national
// student database; schools export their roster from it as a CSV whose
// column names are fixed by that system, not by us. Parsing is pure and
// DB-free -- matching parsed rows against existing students, and writing
// anything, is the service's job.
package domain

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"
)

// dapodikDateLayout is the "dd-mm-yyyy" format Dapodik writes tanggal_lahir
// in.
const dapodikDateLayout = "02-01-2006"

// ErrDapodikEmptyFile is returned when the upload has a header but no data
// rows, or no header at all.
var ErrDapodikEmptyFile = errors.New("dapodik file has no rows")

// ErrDapodikMissingColumns lists the required Dapodik columns that were not
// found in the uploaded file's header.
type ErrDapodikMissingColumns struct {
	Columns []string
}

func (e *ErrDapodikMissingColumns) Error() string {
	return fmt.Sprintf("dapodik file is missing required columns: %s", strings.Join(e.Columns, ", "))
}

// dapodikColumns maps the exact header names Dapodik exports (Indonesian,
// snake_case, lowercase) to the field they fill. "rombel saat ini" is
// Dapodik's name for the student's current class/group.
var dapodikColumns = []string{"nama", "nisn", "nipd", "jenis_kelamin", "tempat_lahir", "tanggal_lahir", "rombel saat ini"}

// DapodikRow is one parsed, unmatched row from the export. GenderRaw and
// BirthDateRaw are kept as Dapodik wrote them ("L"/"P", "dd-mm-yyyy") --
// translating them to the platform's own conventions is the service's job,
// since that also needs the tenant's locale/timezone.
type DapodikRow struct {
	RowNumber    int
	Name         string
	NISN         string
	NIPD         string
	GenderRaw    string
	BirthPlace   string
	BirthDateRaw string
	ClassName    string
}

// ParseDapodikCSV reads a Dapodik student-export CSV. The header row is
// matched case-insensitively and column order does not matter, since
// Dapodik has changed column order across export versions; only the column
// names above must be present. Blank rows (no columns with content) are
// skipped rather than reported as empty data.
func ParseDapodikCSV(r io.Reader) ([]DapodikRow, error) {
	reader := csv.NewReader(r)
	reader.FieldsPerRecord = -1
	reader.TrimLeadingSpace = true

	header, err := reader.Read()
	if errors.Is(err, io.EOF) {
		return nil, ErrDapodikEmptyFile
	}
	if err != nil {
		return nil, fmt.Errorf("read dapodik header: %w", err)
	}

	index, err := dapodikColumnIndex(header)
	if err != nil {
		return nil, err
	}

	var rows []DapodikRow
	rowNumber := 1
	for {
		record, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read dapodik row %d: %w", rowNumber+1, err)
		}
		rowNumber++
		if isBlankRecord(record) {
			continue
		}
		rows = append(rows, DapodikRow{
			RowNumber:    rowNumber,
			Name:         field(record, index, "nama"),
			NISN:         field(record, index, "nisn"),
			NIPD:         field(record, index, "nipd"),
			GenderRaw:    field(record, index, "jenis_kelamin"),
			BirthPlace:   field(record, index, "tempat_lahir"),
			BirthDateRaw: field(record, index, "tanggal_lahir"),
			ClassName:    field(record, index, "rombel saat ini"),
		})
	}

	if len(rows) == 0 {
		return nil, ErrDapodikEmptyFile
	}
	return rows, nil
}

func dapodikColumnIndex(header []string) (map[string]int, error) {
	index := make(map[string]int, len(header))
	for i, col := range header {
		index[strings.ToLower(strings.TrimSpace(col))] = i
	}

	var missing []string
	for _, want := range dapodikColumns {
		if _, ok := index[want]; !ok {
			missing = append(missing, want)
		}
	}
	if len(missing) > 0 {
		return nil, &ErrDapodikMissingColumns{Columns: missing}
	}
	return index, nil
}

func field(record []string, index map[string]int, name string) string {
	i, ok := index[name]
	if !ok || i >= len(record) {
		return ""
	}
	return strings.TrimSpace(record[i])
}

func isBlankRecord(record []string) bool {
	for _, cell := range record {
		if strings.TrimSpace(cell) != "" {
			return false
		}
	}
	return true
}

// Gender translates Dapodik's "L"/"P" (Laki-laki/Perempuan) to the
// platform's male/female convention. An unrecognized or blank value
// returns ok=false so the caller can report a row-level validation error
// instead of silently guessing.
func (r DapodikRow) Gender() (value string, ok bool) {
	switch strings.ToUpper(strings.TrimSpace(r.GenderRaw)) {
	case "L":
		return "male", true
	case "P":
		return "female", true
	default:
		return "", false
	}
}

// BirthDate parses tanggal_lahir as Dapodik writes it, "dd-mm-yyyy". A
// blank value is not an error here (some exports omit it); the caller
// decides whether it is required.
func (r DapodikRow) BirthDate() (time.Time, error) {
	if r.BirthDateRaw == "" {
		return time.Time{}, nil
	}
	return time.Parse(dapodikDateLayout, r.BirthDateRaw)
}

// Validate checks the fields ValidateImportRow-style validation would also
// need, without touching the database: required fields, the two-letter
// gender code, and the birth date format. NISN is the import's idempotency
// key, so it is required even though Dapodik itself allows exporting it
// blank for a newly registered student.
func (r DapodikRow) Validate() []string {
	var errs []string
	if r.Name == "" {
		errs = append(errs, "nama is required")
	}
	if r.NISN == "" {
		errs = append(errs, "nisn is required")
	}
	if _, ok := r.Gender(); !ok {
		errs = append(errs, "jenis_kelamin must be L or P")
	}
	if r.ClassName == "" {
		errs = append(errs, "rombel saat ini is required")
	}
	if r.BirthDateRaw != "" {
		if _, err := r.BirthDate(); err != nil {
			errs = append(errs, "tanggal_lahir must be dd-mm-yyyy")
		}
	}
	return errs
}
