package service

import (
	"fmt"

	"github.com/xuri/excelize/v2"
)

// newXLSXHeaderStyle is the header look every library XLSX export shares
// (old app: writeLibraryXlsxHeader/libraryWriteXlsxHeader -- bold white
// text on a blue fill), the same blue this module's stocktake report
// already uses (service/stocktake.go).
func newXLSXHeaderStyle(f *excelize.File) (int, error) {
	return f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Color: "FFFFFF"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"2563EB"}, Pattern: 1},
		Alignment: &excelize.Alignment{Vertical: "center", WrapText: true},
	})
}

// writeXLSXSheet fills one sheet with a styled header row and a body of
// rows, then freezes the header row -- the layout every report XLSX in
// this module shares, factored out so each report only has to describe
// its own headers and rows.
func writeXLSXSheet(f *excelize.File, sheet string, headerStyle int, headers []string, rows [][]any) error {
	for i, h := range headers {
		cell, err := excelize.CoordinatesToCellName(i+1, 1)
		if err != nil {
			return err
		}
		if err := f.SetCellValue(sheet, cell, h); err != nil {
			return err
		}
		if err := f.SetCellStyle(sheet, cell, cell, headerStyle); err != nil {
			return err
		}
	}
	for row, values := range rows {
		for col, v := range values {
			cell, err := excelize.CoordinatesToCellName(col+1, row+2)
			if err != nil {
				return err
			}
			if err := f.SetCellValue(sheet, cell, v); err != nil {
				return err
			}
		}
	}
	return f.SetPanes(sheet, &excelize.Panes{Freeze: true, YSplit: 1, TopLeftCell: "A2", ActivePane: "bottomLeft"})
}

// newSheet adds a sheet named name to f, or renames the still-default
// "Sheet1" the first time it is called -- so callers never have to track
// whether they are writing the workbook's first sheet.
func newSheet(f *excelize.File, name string, first bool) (string, error) {
	if first {
		if err := f.SetSheetName("Sheet1", name); err != nil {
			return "", fmt.Errorf("rename sheet: %w", err)
		}
		return name, nil
	}
	if _, err := f.NewSheet(name); err != nil {
		return "", fmt.Errorf("add sheet %s: %w", name, err)
	}
	return name, nil
}
