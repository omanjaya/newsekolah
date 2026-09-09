package domain

import "github.com/google/uuid"

// SubjectOfferingCopyDecision is one source-year subject offering the
// new-academic-year setup considers copying into the destination year.
// AlreadyExists is true when the destination year already has an offering
// for the same subject and grade level, so committing the plan twice
// never creates a duplicate.
type SubjectOfferingCopyDecision struct {
	SubjectID     uuid.UUID
	GradeLevelID  *uuid.UUID
	HoursPerWeek  int16
	AlreadyExists bool
}

// PlanSubjectOfferingCopy decides, for each offering in source, whether
// destination already has an equivalent one (same subject + grade level).
// Pure so the dry-run preview and the idempotency of a repeated commit can
// both be unit tested without a database.
func PlanSubjectOfferingCopy(source, destination []SubjectOffering) []SubjectOfferingCopyDecision {
	existing := make(map[string]bool, len(destination))
	for _, o := range destination {
		existing[offeringKey(o.SubjectID, o.GradeLevelID)] = true
	}
	decisions := make([]SubjectOfferingCopyDecision, 0, len(source))
	for _, o := range source {
		decisions = append(decisions, SubjectOfferingCopyDecision{
			SubjectID: o.SubjectID, GradeLevelID: o.GradeLevelID, HoursPerWeek: o.HoursPerWeek,
			AlreadyExists: existing[offeringKey(o.SubjectID, o.GradeLevelID)],
		})
	}
	return decisions
}

func offeringKey(subjectID uuid.UUID, gradeLevelID *uuid.UUID) string {
	key := subjectID.String() + "|"
	if gradeLevelID != nil {
		key += gradeLevelID.String()
	}
	return key
}

// ClassCopyDecision is one source-year class the new-academic-year setup
// considers copying into the destination year, matched by name (class
// names are already unique within an academic year, ErrClassNameExists).
type ClassCopyDecision struct {
	Name              string
	GradeLevelID      uuid.UUID
	TrackID           *uuid.UUID
	RoomID            *uuid.UUID
	Capacity          *int32
	HomeroomTeacherID *uuid.UUID
	AlreadyExists     bool
}

// PlanClassCopy decides, for each class in source, whether destination
// already has a class of the same name.
func PlanClassCopy(source, destination []Class) []ClassCopyDecision {
	existing := make(map[string]bool, len(destination))
	for _, c := range destination {
		existing[c.Name] = true
	}
	decisions := make([]ClassCopyDecision, 0, len(source))
	for _, c := range source {
		decisions = append(decisions, ClassCopyDecision{
			Name: c.Name, GradeLevelID: c.GradeLevelID, TrackID: c.TrackID,
			RoomID: c.RoomID, Capacity: c.Capacity, HomeroomTeacherID: c.HomeroomTeacherID,
			AlreadyExists: existing[c.Name],
		})
	}
	return decisions
}
