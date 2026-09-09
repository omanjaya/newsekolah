package authz

import (
	"testing"

	"github.com/google/uuid"
)

func TestPrincipalEffectiveUnionsRoleAndDutyPermissions(t *testing.T) {
	classID := uuid.New()
	principal := Principal{
		RolePerms: []string{PermViewDashboard, PermViewAttendance},
		Duties: []Duty{
			{
				Slug:         "homeroom",
				ScopeKind:    ScopeClass,
				ScopeClassID: uuid.NullUUID{UUID: classID, Valid: true},
				Permissions:  []string{PermReviewLeaveRequests, PermViewAttendance},
			},
		},
	}

	effective := principal.Effective()

	for _, want := range []string{PermViewDashboard, PermViewAttendance, PermReviewLeaveRequests} {
		if !effective.Has(want) {
			t.Errorf("expected effective permissions to include %q, got %v", want, effective.Slice())
		}
	}
	if effective.Has(PermManagePermissions) {
		t.Errorf("did not expect %q in effective permissions", PermManagePermissions)
	}
	// PermViewAttendance is granted by both role and duty; it must not
	// duplicate in the resulting set.
	if len(effective) != 3 {
		t.Errorf("expected 3 distinct permissions, got %d: %v", len(effective), effective.Slice())
	}
}

func TestPrincipalHasScope(t *testing.T) {
	classA := uuid.New()
	classB := uuid.New()

	principal := Principal{
		Duties: []Duty{
			{
				Slug:         "homeroom",
				ScopeKind:    ScopeClass,
				ScopeClassID: uuid.NullUUID{UUID: classA, Valid: true},
				Permissions:  []string{PermReviewLeaveRequests},
			},
		},
	}

	if !principal.HasScope(PermReviewLeaveRequests, uuid.NullUUID{UUID: classA, Valid: true}, uuid.NullUUID{}) {
		t.Error("expected scope to match the homeroom's own class")
	}
	if principal.HasScope(PermReviewLeaveRequests, uuid.NullUUID{UUID: classB, Valid: true}, uuid.NullUUID{}) {
		t.Error("did not expect scope to match a different class")
	}
	if principal.HasScope(PermIssueLeaveLetters, uuid.NullUUID{UUID: classA, Valid: true}, uuid.NullUUID{}) {
		t.Error("did not expect scope to match a permission the duty does not grant")
	}
}

func TestSchoolScopedDutyMatchesAnyClass(t *testing.T) {
	principal := Principal{
		Duties: []Duty{
			{Slug: "leadership", ScopeKind: ScopeSchool, Permissions: []string{PermIssueLeaveLetters}},
		},
	}

	if !principal.HasScope(PermIssueLeaveLetters, uuid.NullUUID{UUID: uuid.New(), Valid: true}, uuid.NullUUID{}) {
		t.Error("expected a school-scoped duty to match any class")
	}
}
