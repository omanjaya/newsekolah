package mapping

// ScheduleSlot identifies one class/weekday/period slot in a school
// timetable -- the same axes the target schema's own exclusion constraint
// enforces uniqueness on (class, day, period), independent of which
// timetable revision a row happens to come from.
type ScheduleSlot struct {
	ClassID  int64
	Weekday  int16
	PeriodID int64
}

// ScheduleRevisionRow is one timetable row read from one source revision,
// generic over the row's own type (T) so ResolveScheduleUnion stays free of
// any caller-specific or database type.
type ScheduleRevisionRow[T any] struct {
	Slot      ScheduleSlot
	VersionID int64
	Row       T
}

// ResolveScheduleUnion builds one target timetable out of every revision
// that overlaps a semester: a school's schedule_versions table can hold
// more than one row for the same period (a mid-semester revision), and the
// target schema allows only one lesson per (class, weekday, period). For
// each slot, the row belonging to the revision with the highest rank wins.
//
// rank must reflect recency (e.g. index into a revisions slice already
// sorted by effective_from ascending) -- deliberately never the source's
// own status flag, which a revision already in daily use can still carry as
// something other than 'active' (see docs/13-etl-sion.md, "Union jadwal").
func ResolveScheduleUnion[T any](rows []ScheduleRevisionRow[T], rank map[int64]int) map[ScheduleSlot]ScheduleRevisionRow[T] {
	winners := make(map[ScheduleSlot]ScheduleRevisionRow[T])
	for _, row := range rows {
		current, held := winners[row.Slot]
		if !held || rank[row.VersionID] > rank[current.VersionID] {
			winners[row.Slot] = row
		}
	}
	return winners
}
