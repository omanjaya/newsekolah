package domain

import (
	"fmt"
	"time"
)

// IsoWeekday maps time.Weekday (Sunday=0..Saturday=6) onto the schema's
// day_of_week convention (Monday=1..Sunday=7), matching school_days and
// schedules.day_of_week -- the same convention scheduling/domain's
// unexported isoWeekday uses, duplicated here since domain packages import
// nothing from each other per docs/03-layered-architecture.md section 1.
func IsoWeekday(t time.Time) int16 {
	w := int16(t.Weekday()) //nolint:gosec // Weekday is 0..6
	if w == 0 {
		return 7
	}
	return w
}

// indonesianWeekdayNames is indexed by time.Weekday (Sunday=0..Saturday=6),
// not IsoWeekday's schema convention.
var indonesianWeekdayNames = [...]string{"Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"}

// IndonesianWeekdayName is t's day name in Indonesian, for the monitor
// board display (default language Bahasa Indonesia, CLAUDE.md) -- unlike
// IsoWeekday this is presentation text, not a schema value, so it does not
// go through the i18n error-code catalog.
func IndonesianWeekdayName(t time.Time) string {
	return indonesianWeekdayNames[t.Weekday()]
}

// monthNames is indexed by [locale][time.Month - 1]. reportdoc.FormatDate
// covers a full day/month/year date; a month-year-only scope line ("Bulan:
// September 2026", no day) is this package's own report-specific text,
// same reasoning as pseudoStatusLabels in daily_status.go.
var monthNames = map[string][12]string{
	"id": {
		"Januari", "Februari", "Maret", "April", "Mei", "Juni",
		"Juli", "Agustus", "September", "Oktober", "November", "Desember",
	},
	"en": {
		"January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December",
	},
}

// MonthYear formats a "YYYY-MM" month string (the query param every
// monthly report/export takes) as "September 2026" in locale (falling
// back to "id" for an unrecognized locale), or returns raw unchanged if
// it is not that shape -- a report export's own scope line should never
// fail to render over a malformed month it did not itself validate.
func MonthYear(locale, raw string) string {
	t, err := time.Parse("2006-01", raw)
	if err != nil {
		return raw
	}
	names, ok := monthNames[locale]
	if !ok {
		names = monthNames["id"]
	}
	return fmt.Sprintf("%s %d", names[t.Month()-1], t.Year())
}
