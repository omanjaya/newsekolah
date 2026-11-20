package authz

import "testing"

func TestDutyTypeDefaultsAreWellFormed(t *testing.T) {
	seen := map[string]bool{}
	validScope := map[string]bool{"school": true, "class": true, "student": true}

	for _, d := range DutyTypeDefaults() {
		if d.Slug == "" {
			t.Fatal("duty type default has an empty slug")
		}
		if seen[d.Slug] {
			t.Fatalf("duty type default slug %q is duplicated", d.Slug)
		}
		seen[d.Slug] = true

		if d.Name == "" {
			t.Fatalf("duty type %q has an empty name", d.Slug)
		}
		if !validScope[d.ScopeKind] {
			t.Fatalf("duty type %q has an invalid scope kind %q", d.Slug, d.ScopeKind)
		}
		if len(d.Permissions) == 0 {
			t.Fatalf("duty type %q grants no permissions", d.Slug)
		}
	}

	if !seen["homeroom"] {
		t.Fatal("homeroom is a required default duty type (attendance and permits hard-code its slug)")
	}
}

// TestCounselorAndLeadershipReadMentorGroups: both may read a guru wali's
// meeting notes (mentoring's MeetingNote.VisibleTo), so both duties open
// every mentor group read-only. Neither manages the groups.
func TestCounselorAndLeadershipReadMentorGroups(t *testing.T) {
	found := 0
	for _, d := range DutyTypeDefaults() {
		if d.Slug != "counselor" && d.Slug != "leadership" {
			continue
		}
		found++
		set := NewSet(d.Permissions...)
		if !set.Has(PermViewMentoring) {
			t.Fatalf("duty %q must carry view_mentoring", d.Slug)
		}
		if set.Has(PermManageMentorGroups) {
			t.Fatalf("duty %q must not manage mentor groups", d.Slug)
		}
	}
	if found != 2 {
		t.Fatalf("want the counselor and leadership duty defaults, found %d", found)
	}
}
