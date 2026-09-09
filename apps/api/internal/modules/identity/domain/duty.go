package domain

import (
	"regexp"
	"time"

	"github.com/google/uuid"
)

var dutySlugPattern = regexp.MustCompile(`^[a-z0-9_]{2,50}$`)

// DutyScopeKind mirrors duty_types.scope_kind. It duplicates
// platform/authz.ScopeKind's three values rather than importing that
// package, keeping domain free of any platform dependency beyond clock.
type DutyScopeKind string

const (
	DutyScopeSchool  DutyScopeKind = "school"
	DutyScopeClass   DutyScopeKind = "class"
	DutyScopeStudent DutyScopeKind = "student"
)

func (k DutyScopeKind) Valid() bool {
	switch k {
	case DutyScopeSchool, DutyScopeClass, DutyScopeStudent:
		return true
	default:
		return false
	}
}

// ValidateDutyType checks the fields a duty type create/update carries,
// mirroring duty_types' check constraints so a bad value fails with a
// domain error before it reaches the database.
func ValidateDutyType(slug, name string, scope DutyScopeKind) error {
	if !dutySlugPattern.MatchString(slug) {
		return ErrInvalidRoleSlug
	}
	if name == "" || len(name) > 150 {
		return ErrInvalidScopeKind
	}
	if !scope.Valid() {
		return ErrInvalidScopeKind
	}
	return nil
}

// DutyAssignmentInput is what a create/update of one duty_assignments row
// needs validated before it reaches the repository.
type DutyAssignmentInput struct {
	ScopeKind      DutyScopeKind
	ScopeClassID   uuid.NullUUID
	ScopeStudentID uuid.NullUUID
	StartsOn       time.Time
	EndsOn         *time.Time
}

// ValidateDutyAssignment enforces that the scope object matches the duty
// type's declared scope kind (a "class" duty must carry a class, not a
// student or neither) and that starts_on/ends_on form a valid range.
func ValidateDutyAssignment(in DutyAssignmentInput) error {
	switch in.ScopeKind {
	case DutyScopeSchool:
		if in.ScopeClassID.Valid || in.ScopeStudentID.Valid {
			return ErrInvalidScopeKind
		}
	case DutyScopeClass:
		if !in.ScopeClassID.Valid || in.ScopeStudentID.Valid {
			return ErrInvalidScopeKind
		}
	case DutyScopeStudent:
		if !in.ScopeStudentID.Valid || in.ScopeClassID.Valid {
			return ErrInvalidScopeKind
		}
	default:
		return ErrInvalidScopeKind
	}

	if in.StartsOn.IsZero() {
		return ErrInvalidScopeKind
	}
	if in.EndsOn != nil && in.EndsOn.Before(in.StartsOn) {
		return ErrInvalidScopeKind
	}
	return nil
}
