package domain

import (
	"fmt"

	"github.com/google/uuid"
)

// ConflictError names the schedule that stands in the way. A bare "this
// clashes" leaves the person to hunt the timetable for what it clashed
// with; the old system named the class, teacher, subject and periods, and
// so does this. DetectConflict fills only Kind and With (it has no
// repository access); the service fills the *Name fields once it has
// looked the ids up, before the error reaches transport.
type ConflictError struct {
	// Kind is either ErrConflictClass or ErrConflictTeacher.
	Kind error
	With Schedule

	ClassName       string
	SubjectName     string
	TeacherName     string
	StartPeriodName string
	EndPeriodName   string
}

func (e *ConflictError) Error() string {
	return fmt.Sprintf("%s (schedule %s)", e.Kind, e.With.ID)
}

func (e *ConflictError) Unwrap() error { return e.Kind }

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
			return &ConflictError{Kind: ErrConflictClass, With: other}
		}
		if other.TeacherUserID == candidate.TeacherUserID {
			return &ConflictError{Kind: ErrConflictTeacher, With: other}
		}
	}
	return nil
}
