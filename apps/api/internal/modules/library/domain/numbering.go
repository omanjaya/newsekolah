package domain

import (
	"fmt"
	"strconv"
	"strings"
)

// FormatAccessionNumber expands a pattern like the old app's
// "library.no_induk_format" setting (default "YYYY/99999"): "YYYY"
// becomes the 4-digit year, "YY" the 2-digit year, and the first run of
// "9" characters becomes seq zero-padded to that run's width (old app:
// libraryFormatNumber).
func FormatAccessionNumber(pattern string, year int, seq int64) string {
	out := strings.ReplaceAll(pattern, "YYYY", fmt.Sprintf("%04d", year))
	out = strings.ReplaceAll(out, "YY", fmt.Sprintf("%02d", year%100))

	start := strings.IndexByte(out, '9')
	if start < 0 {
		return out + strconv.FormatInt(seq, 10)
	}
	end := start
	for end < len(out) && out[end] == '9' {
		end++
	}
	width := end - start
	digits := strconv.FormatInt(seq, 10)
	if len(digits) < width {
		digits = strings.Repeat("0", width-len(digits)) + digits
	}
	return out[:start] + digits + out[end:]
}

// FormatBarcodeSequence is the old app's fallback barcode when
// barcode_source is "sequence": an 11-digit zero-padded running number
// (old app: libraryGenerateBarcode).
func FormatBarcodeSequence(seq int64) string {
	return fmt.Sprintf("%011d", seq)
}
