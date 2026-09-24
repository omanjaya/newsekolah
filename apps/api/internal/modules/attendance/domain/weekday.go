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

// indonesianMonthNames is indexed by time.Month - 1 (January=0..December=11).
var indonesianMonthNames = [...]string{
	"Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember",
}

// IndonesianDate is t formatted "2 Januari 2006" (day, Indonesian month
// name, year) -- the tenant-default-locale long date a report export's
// scope line shows (CLAUDE.md: default Bahasa Indonesia), rather than an
// ISO date meant for a machine.
func IndonesianDate(t time.Time) string {
	return fmt.Sprintf("%d %s %d", t.Day(), indonesianMonthNames[t.Month()-1], t.Year())
}

// IndonesianMonthYear formats a "YYYY-MM" month string (the query param
// every monthly report/export takes) as "Januari 2026", or returns raw
// unchanged if it is not that shape -- a report export's own scope line
// should never fail to render over a malformed month it did not itself
// validate.
func IndonesianMonthYear(raw string) string {
	t, err := time.Parse("2006-01", raw)
	if err != nil {
		return raw
	}
	return fmt.Sprintf("%s %d", indonesianMonthNames[t.Month()-1], t.Year())
}
