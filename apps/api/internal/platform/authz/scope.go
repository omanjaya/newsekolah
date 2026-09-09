package authz

import "github.com/google/uuid"

// ScopeKind mirrors duty_types.scope_kind: how far a duty-derived permission reaches.
type ScopeKind string

const (
	ScopeSchool  ScopeKind = "school"
	ScopeClass   ScopeKind = "class"
	ScopeStudent ScopeKind = "student"
)

// Duty is one active duty assignment held by a user, carrying the permissions
// it grants and the object it grants them over.
type Duty struct {
	Slug           string
	Name           string
	ScopeKind      ScopeKind
	ScopeClassID   uuid.NullUUID
	ScopeStudentID uuid.NullUUID
	Permissions    []string
}

// Principal is the authenticated user's role and duty permissions, from which
// an effective permission set is derived. Object-level scope checks (does
// this duty cover this specific class or student) are the service's job.
type Principal struct {
	UserID    uuid.UUID
	RolePerms []string
	Duties    []Duty
}

// Effective returns the union of role permissions and permissions granted by
// currently active duties, per docs/06-database-schema.md section 3.
func (p Principal) Effective() Set {
	s := NewSet(p.RolePerms...)
	for _, d := range p.Duties {
		s.Add(d.Permissions...)
	}
	return s
}

// HasScope reports whether one of the principal's duties grants permission
// code over the given class or student. School-scoped duties grant the
// permission everywhere, so they match any class/student.
func (p Principal) HasScope(code string, classID, studentID uuid.NullUUID) bool {
	for _, d := range p.Duties {
		if !containsCode(d.Permissions, code) {
			continue
		}
		switch d.ScopeKind {
		case ScopeSchool:
			return true
		case ScopeClass:
			if classID.Valid && d.ScopeClassID.Valid && classID.UUID == d.ScopeClassID.UUID {
				return true
			}
		case ScopeStudent:
			if studentID.Valid && d.ScopeStudentID.Valid && studentID.UUID == d.ScopeStudentID.UUID {
				return true
			}
		}
	}
	return false
}

func containsCode(codes []string, code string) bool {
	for _, c := range codes {
		if c == code {
			return true
		}
	}
	return false
}
