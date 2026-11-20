package authz

import "testing"

// TestStaffRoleDefaultHasNoBilling proves the catch-all Pegawai role (every
// non-teaching employee, security guards included) cannot read bills or
// record payments; the bursar duty carries both instead.
func TestStaffRoleDefaultHasNoBilling(t *testing.T) {
	var staff *RoleDefault
	for _, rd := range RoleDefaults() {
		if rd.Slug == RoleSlugStaff {
			staff = &rd
		}
	}
	if staff == nil {
		t.Fatal("staff is not in RoleDefaults()")
	}
	for _, forbidden := range []string{PermViewBilling, PermRecordPayments, PermVoidPayments, PermGenerateBills} {
		if containsCode(staff.Permissions, forbidden) {
			t.Errorf("staff role default must not include %q", forbidden)
		}
	}

	for _, d := range DutyTypeDefaults() {
		if d.Slug != "bursar" {
			continue
		}
		for _, required := range []string{PermViewBilling, PermRecordPayments} {
			if !containsCode(d.Permissions, required) {
				t.Errorf("bursar duty default must include %q", required)
			}
		}
		return
	}
	t.Fatal("bursar is not in DutyTypeDefaults()")
}
