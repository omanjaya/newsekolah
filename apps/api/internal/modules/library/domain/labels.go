package domain

import "strings"

// Label sheet geometry: A4, a 3-column by 8-row grid of 70x25 mm labels
// (old app: library_labels.go's "a4-3x8" model). 3 columns of 70mm each
// exactly fill the 210mm page width, so there is no horizontal gap or
// margin; the vertical margin leaves room top and bottom on the 297mm
// page for 8 rows of 25mm.
const (
	LabelCols        = 3
	LabelRows        = 8
	LabelWidthMM     = 70.0
	LabelHeightMM    = 25.0
	LabelMarginXMM   = 0.0
	LabelMarginYMM   = 8.5
	LabelsPerPage    = LabelCols * LabelRows
	LabelMaxPerPrint = 500
)

// LabelPosition returns the top-left corner, in mm, of the label at
// indexInPage (0-based, already taken modulo LabelsPerPage by the
// caller) on the grid described above.
func LabelPosition(indexInPage int) (x, y float64) {
	col := indexInPage % LabelCols
	row := indexInPage / LabelCols
	x = LabelMarginXMM + float64(col)*LabelWidthMM
	y = LabelMarginYMM + float64(row)*LabelHeightMM
	return x, y
}

// LabelCallNumberLines splits a call number into at most 3 lines by
// whitespace, so a long generated call number ("583.8 SUP r") still fits
// a 70mm-wide label (old app: libraryLabelLines).
func LabelCallNumberLines(callNumber string) []string {
	fields := strings.Fields(callNumber)
	if len(fields) > 3 {
		fields = fields[:3]
	}
	return fields
}
