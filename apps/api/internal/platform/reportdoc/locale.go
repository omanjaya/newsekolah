package reportdoc

import (
	"fmt"
	"strconv"
	"time"
)

// This file is the small, generic id/en formatting helper the package doc
// comment promises: date formatting and the PDF page-number footer
// template, the two pieces of text every migrated report needs and would
// otherwise hand-roll slightly differently each time. It is deliberately
// narrow -- report-specific text (column labels, status values, titles)
// stays the caller's job; reportdoc only knows "id" and "en" exist, not
// how to translate a report's own vocabulary.

// LocaleID and LocaleEN are the two locale codes FormatDate and PageLabel
// understand, matching platform/i18n's Indonesian/English codes so a
// caller can pass its already-resolved locale straight through.
const (
	LocaleID = "id"
	LocaleEN = "en"
)

var indonesianMonths = [...]string{
	"Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember",
}

// FormatDate renders t as a long date in locale: "2 September 2026" for
// "id" (the Indonesian convention: day, full month name, year, no
// leading zero on the day), "September 2, 2026" for anything else
// (English, the fallback locale). Report scope lines, signature dates and
// footers all use this so every migrated report formats a date the same
// way.
func FormatDate(locale string, t time.Time) string {
	if locale == LocaleID {
		return fmt.Sprintf("%d %s %d", t.Day(), indonesianMonths[t.Month()-1], t.Year())
	}
	return t.Format("January 2, 2006")
}

// FormatMonth renders t's month and year: "November 2026" for "id", the
// English month name otherwise.
func FormatMonth(locale string, t time.Time) string {
	if locale == LocaleID {
		return fmt.Sprintf("%s %d", indonesianMonths[t.Month()-1], t.Year())
	}
	return t.Format("January 2006")
}

// FormatInteger groups n's digits in threes: "75.000" for "id" (the
// Indonesian thousands separator is a dot), "75,000" otherwise.
func FormatInteger(locale string, n int64) string {
	sep := byte(',')
	if locale == LocaleID {
		sep = '.'
	}
	digits := strconv.FormatInt(n, 10)
	sign := ""
	if n < 0 {
		sign, digits = "-", digits[1:]
	}
	out := make([]byte, 0, len(digits)+len(digits)/3)
	for i := 0; i < len(digits); i++ {
		if i > 0 && (len(digits)-i)%3 == 0 {
			out = append(out, sep)
		}
		out = append(out, digits[i])
	}
	return sign + string(out)
}

// PageLabel returns the default Document.PageLabelFormat for locale:
// "Halaman {page} dari {pages}" for "id", "Page {page} of {pages}"
// otherwise. Callers may still supply their own PageLabelFormat directly
// (e.g. to add a report name); this is only the locale-correct default.
func PageLabel(locale string) string {
	if locale == LocaleID {
		return "Halaman {page} dari {pages}"
	}
	return "Page {page} of {pages}"
}

// EmptyRowsLabel returns the default Document.EmptyRowsLabel for locale:
// "Tidak ada data" for "id", "No data" otherwise.
func EmptyRowsLabelFor(locale string) string {
	if locale == LocaleID {
		return "Tidak ada data"
	}
	return "No data"
}
