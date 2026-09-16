package mapping

import "testing"

func TestDutyForSpatieRole(t *testing.T) {
	cases := []struct {
		role     string
		wantSlug string
		wantOK   bool
	}{
		{SpatieRoleBK, DutyCounselor, true},
		{SpatieRolePicket, DutyPicket, true},
		{SpatieRolePustakawan, DutyLibrarian, true},
		{SpatieRoleSecurity, DutySecurity, true},
		{SpatieRoleTeacher, "", false},
		{SpatieRoleClassAdministrator, "", false},
		{SpatieRoleSupervisor, "", false},
		{"", "", false},
	}
	for _, tc := range cases {
		slug, ok := DutyForSpatieRole(tc.role)
		if slug != tc.wantSlug || ok != tc.wantOK {
			t.Errorf("DutyForSpatieRole(%q) = (%q, %v), want (%q, %v)", tc.role, slug, ok, tc.wantSlug, tc.wantOK)
		}
	}
}
