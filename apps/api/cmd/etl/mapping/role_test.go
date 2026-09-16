package mapping

import (
	"reflect"
	"testing"
)

func TestMapIdentityRole(t *testing.T) {
	cases := []struct {
		name         string
		roles        []string
		wantSlug     string
		wantUnmapped []string
		wantOK       bool
	}{
		{"super admin only", []string{SpatieRoleSuperAdmin}, RoleSuperAdmin, nil, true},
		{"admin only", []string{SpatieRoleAdmin}, RoleAdmin, nil, true},
		{"teacher only", []string{SpatieRoleTeacher}, RoleTeacher, nil, true},
		{"student only", []string{SpatieRoleStudent}, RoleStudent, nil, true},
		{"teacher plus class administrator", []string{SpatieRoleTeacher, SpatieRoleClassAdministrator}, RoleTeacher, nil, true},
		{"teacher plus BK", []string{SpatieRoleTeacher, SpatieRoleBK}, RoleTeacher, nil, true},
		{"picket only defaults to staff", []string{SpatieRolePicket}, RoleStaff, nil, true},
		{"pustakawan only defaults to staff", []string{SpatieRolePustakawan}, RoleStaff, nil, true},
		{"security only defaults to staff", []string{SpatieRoleSecurity}, RoleStaff, nil, true},
		{"bk only defaults to staff", []string{SpatieRoleBK}, RoleStaff, nil, true},
		{
			"supervisor only defaults to staff and is reported unmapped",
			[]string{SpatieRoleSupervisor}, RoleStaff, []string{SpatieRoleSupervisor}, true,
		},
		{
			"koperasi and kiosk both reported unmapped",
			[]string{SpatieRoleKoperasi, SpatieRoleKiosk}, RoleStaff, []string{SpatieRoleKoperasi, SpatieRoleKiosk}, true,
		},
		{"customer only has no identity role", []string{SpatieRoleCustomer}, "", nil, false},
		{"no roles at all", nil, "", nil, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			slug, unmapped, ok := MapIdentityRole(tc.roles)
			if slug != tc.wantSlug || ok != tc.wantOK {
				t.Errorf("MapIdentityRole(%v) = (%q, _, %v), want (%q, _, %v)", tc.roles, slug, ok, tc.wantSlug, tc.wantOK)
			}
			if !reflect.DeepEqual(unmapped, tc.wantUnmapped) {
				t.Errorf("MapIdentityRole(%v) unmapped = %v, want %v", tc.roles, unmapped, tc.wantUnmapped)
			}
		})
	}
}

func TestProfileKindForRole(t *testing.T) {
	cases := []struct {
		slug     string
		wantKind string
		wantOK   bool
	}{
		{"admin", "staff", true},
		{"staff", "staff", true},
		{"super_admin", "staff", true},
		{"teacher", "teacher", true},
		{"student", "student", true},
		{"parent", "", false},
		{"unknown", "", false},
	}
	for _, tc := range cases {
		kind, ok := ProfileKindForRole(tc.slug)
		if kind != tc.wantKind || ok != tc.wantOK {
			t.Errorf("ProfileKindForRole(%q) = (%q, %v), want (%q, %v)", tc.slug, kind, ok, tc.wantKind, tc.wantOK)
		}
	}
}
