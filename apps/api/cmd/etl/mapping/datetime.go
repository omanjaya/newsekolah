package mapping

import (
	"fmt"
	"regexp"
	"strconv"
	"time"
)

// LocalToUTC reinterprets a naive timestamp read from MySQL (which stores no
// timezone) as wall-clock time in the tenant's IANA zone, then converts it to
// UTC for the new schema's timestamptz columns. The source driver must be
// configured to parse times as UTC-labelled (parseTime=true&loc=UTC) so
// naive avoids double-shifting; see cmd/etl's source connection string.
func LocalToUTC(naive time.Time, tenantLocation *time.Location) time.Time {
	wallClock := time.Date(
		naive.Year(), naive.Month(), naive.Day(),
		naive.Hour(), naive.Minute(), naive.Second(), naive.Nanosecond(),
		tenantLocation,
	)
	return wallClock.UTC()
}

// LocalDate reinterprets a naive DATE column as a calendar day, independent
// of timezone (a date has no time-of-day component to shift).
func LocalDate(naive time.Time) time.Time {
	return time.Date(naive.Year(), naive.Month(), naive.Day(), 0, 0, 0, 0, time.UTC)
}

var yearLabelPattern = regexp.MustCompile(`^(\d{4})/(\d{4})$`)

// AcademicYearDates derives an Indonesian school year's start and end dates
// from its "YYYY/YYYY" label (e.g. "2024/2025" -> 1 July 2024 to 30 June
// 2025), the convention docs/12-roadmap.md and cmd/seed both use. It is only
// a fallback for when the target tenant has no matching academic_years row
// yet to reuse; a tenant onboarded normally already has the authoritative
// dates.
func AcademicYearDates(label string) (startsOn, endsOn time.Time, err error) {
	m := yearLabelPattern.FindStringSubmatch(label)
	if m == nil {
		return time.Time{}, time.Time{}, fmt.Errorf("academic year label %q is not in YYYY/YYYY form", label)
	}
	first, _ := strconv.Atoi(m[1])
	second, _ := strconv.Atoi(m[2])
	if second != first+1 {
		return time.Time{}, time.Time{}, fmt.Errorf("academic year label %q does not span consecutive years", label)
	}
	startsOn = time.Date(first, time.July, 1, 0, 0, 0, 0, time.UTC)
	endsOn = time.Date(second, time.June, 30, 0, 0, 0, 0, time.UTC)
	return startsOn, endsOn, nil
}
