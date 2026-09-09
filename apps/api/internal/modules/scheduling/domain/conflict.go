package domain

import "github.com/google/uuid"

// DetectConflict is the domain-level half of the anti-clash rule: the
// schedules table's two GiST exclusion constraints (docs/06-database-schema.md
// section 5) are the authority that can never be raced past, but checking
// here first lets the service return a precise, request-scoped error
// (which existing schedule it clashes with) instead of parsing a Postgres
// constraint-violation message.
//
// existing must already be filtered to the same tenant and academic year;
// DetectConflict itself only compares day of week and period range, and
// excludes selfID (candidate's own current row, when updating) from the
// comparison.
func DetectConflict(existing []Schedule, candidate Schedule, selfID uuid.UUID) error {
	for _, other := range existing {
		if other.ID == selfID {
			continue
		}
		if other.DayOfWeek != candidate.DayOfWeek {
			continue
		}
		if !candidate.overlapsPeriods(other) {
			continue
		}
		if other.ClassID == candidate.ClassID {
			return ErrConflictClass
		}
		if other.TeacherUserID == candidate.TeacherUserID {
			return ErrConflictTeacher
		}
	}
	return nil
}
