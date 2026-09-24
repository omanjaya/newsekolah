package domain

import (
	"fmt"
	"time"
)

// indonesianMonthNames is indexed by time.Month - 1 (January=0..December=11).
// Duplicated from attendance/domain's identically named table: domain
// packages import nothing from each other per docs/03-layered-
// architecture.md section 1.
var indonesianMonthNames = [...]string{
	"Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember",
}

// IndonesianDate is t formatted "2 Januari 2006" (day, Indonesian month
// name, year) -- the tenant-default-locale long date a report export's
// scope line or date column shows (CLAUDE.md: default Bahasa Indonesia),
// rather than an ISO date meant for a machine.
func IndonesianDate(t time.Time) string {
	return fmt.Sprintf("%d %s %d", t.Day(), indonesianMonthNames[t.Month()-1], t.Year())
}
