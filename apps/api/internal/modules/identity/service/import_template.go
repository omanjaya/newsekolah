package service

import (
	"bytes"
	"sort"

	"github.com/xuri/excelize/v2"
)

const (
	importTemplateDataSheet = "Import"
	importTemplateRefSheet  = "Referensi"
)

// importTemplateColumns are the ImportRow fields in the order the
// template presents them. The commit/preview endpoints take JSON, not
// this file directly -- the frontend parses it into rows -- so column
// order only has to be a sensible, documented convention, not something
// the backend parses back.
var importTemplateColumns = []string{
	"username", "email", "password", "profile_kind", "role_slug",
	"nik", "name", "gender", "birth_place", "birth_date", "religion",
	"address", "district", "city", "phone", "blood_type",
	"nis", "nisn", "entry_year", "father_name", "mother_name",
	"guardian_name", "guardian_phone", "parent_occupation", "previous_school",
	"nip", "nuptk", "last_education", "employment_status", "joined_year", "specialization",
	"employee_number", "position",
}

// exampleImportRow shows one filled-in student row so an admin sees the
// expected shape (dates, gender code, role alias) instead of a blank grid.
var exampleImportRow = map[string]string{
	"username": "", "email": "", "password": "",
	"profile_kind": "student", "role_slug": "siswa",
	"nik": "3201xxxxxxxxxxxx", "name": "Siti Aminah", "gender": "P",
	"birth_place": "Bandung", "birth_date": "2010-05-17", "religion": "Islam",
	"address": "", "district": "", "city": "Bandung", "phone": "", "blood_type": "O",
	"nis": "2026001", "nisn": "", "entry_year": "2026",
	"father_name": "", "mother_name": "", "guardian_name": "", "guardian_phone": "", "parent_occupation": "", "previous_school": "",
}

// ImportTemplate builds the XLSX an admin downloads, fills in, and has
// the client parse into the JSON rows PreviewImport/CommitImport take: one
// data sheet with every ImportRow column and an example row, plus a
// reference sheet listing every accepted value for the columns that are
// not free text (docs/analysis/backend-inventory.md section 1.5 --
// restores the old app's "template XLSX dengan sheet referensi").
func (s *Service) ImportTemplate() ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // best-effort close of an in-memory workbook

	if err := f.SetSheetName("Sheet1", importTemplateDataSheet); err != nil {
		return nil, err
	}
	for i, col := range importTemplateColumns {
		cell, err := excelize.CoordinatesToCellName(i+1, 1)
		if err != nil {
			return nil, err
		}
		if err := f.SetCellValue(importTemplateDataSheet, cell, col); err != nil {
			return nil, err
		}
		exampleCell, err := excelize.CoordinatesToCellName(i+1, 2)
		if err != nil {
			return nil, err
		}
		if err := f.SetCellValue(importTemplateDataSheet, exampleCell, exampleImportRow[col]); err != nil {
			return nil, err
		}
	}

	if _, err := f.NewSheet(importTemplateRefSheet); err != nil {
		return nil, err
	}
	if err := writeImportReferenceSheet(f); err != nil {
		return nil, err
	}
	f.SetActiveSheet(0)

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// writeImportReferenceSheet lists every closed set of values a column in
// importTemplateColumns accepts, each under its own two-column (code,
// meaning) block so an admin filling the template by hand does not have
// to guess a role alias or a blood type spelling.
func writeImportReferenceSheet(f *excelize.File) error {
	row := 1
	writeBlock := func(title string, pairs [][2]string) error {
		if err := f.SetCellValue(importTemplateRefSheet, cellAt(1, row), title); err != nil {
			return err
		}
		row++
		for _, p := range pairs {
			if err := f.SetCellValue(importTemplateRefSheet, cellAt(1, row), p[0]); err != nil {
				return err
			}
			if err := f.SetCellValue(importTemplateRefSheet, cellAt(2, row), p[1]); err != nil {
				return err
			}
			row++
		}
		row++ // blank row between blocks
		return nil
	}

	if err := writeBlock("profile_kind", [][2]string{
		{"student", "Siswa"}, {"teacher", "Guru"}, {"staff", "Pegawai"},
	}); err != nil {
		return err
	}
	if err := writeBlock("gender", [][2]string{{"L", "Laki-laki"}, {"P", "Perempuan"}}); err != nil {
		return err
	}
	if err := writeBlock("blood_type", [][2]string{
		{"A", ""}, {"B", ""}, {"AB", ""}, {"O", ""},
		{"A+", ""}, {"A-", ""}, {"B+", ""}, {"B-", ""}, {"AB+", ""}, {"AB-", ""}, {"O+", ""}, {"O-", ""},
	}); err != nil {
		return err
	}
	if err := writeBlock("birth_date / entry_year / joined_year", [][2]string{
		{"birth_date", "Format YYYY-MM-DD, contoh 2010-05-17"},
		{"entry_year / joined_year", "Angka tahun, contoh 2026"},
	}); err != nil {
		return err
	}
	return writeBlock("role_slug (alias yang diterima)", roleAliasReferencePairs())
}

func roleAliasReferencePairs() [][2]string {
	type pair struct{ alias, slug string }
	pairs := []pair{
		{"siswa", "student"}, {"murid", "student"},
		{"guru", "teacher"}, {"pengajar", "teacher"},
		{"pegawai", "staff"}, {"karyawan", "staff"}, {"staf", "staff"},
		{"pustakawan", "librarian"},
		{"admin", "admin"}, {"super_admin", "super_admin"},
	}
	sort.Slice(pairs, func(i, j int) bool { return pairs[i].alias < pairs[j].alias })
	out := make([][2]string, len(pairs))
	for i, p := range pairs {
		out[i] = [2]string{p.alias, p.slug}
	}
	return out
}

func cellAt(col, row int) string {
	cell, _ := excelize.CoordinatesToCellName(col, row)
	return cell
}
