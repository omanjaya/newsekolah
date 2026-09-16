// Package mapping holds the pure transformation rules the ETL applies while
// moving rows from the live SION MySQL database into a newsekolah tenant:
// role and duty mapping, identifier and name cleanup, date and timezone
// normalisation, and the natural-key rules idempotency depends on. Nothing
// here touches a database or the network, so it is covered by unit tests
// instead of integration tests.
package mapping

// Spatie role names as stored in the live schema's roles.name (Spatie
// laravel-permission convention; roles/model_has_roles tables). A user can
// hold several of these at once.
const (
	SpatieRoleSuperAdmin         = "Super Admin"
	SpatieRoleAdmin              = "Administrator"
	SpatieRoleTeacher            = "Teacher"
	SpatieRoleStudent            = "Student"
	SpatieRoleClassAdministrator = "Class Administrator"
	SpatieRoleBK                 = "BK"
	SpatieRolePicket             = "Picket"
	SpatieRolePustakawan         = "Pustakawan"
	SpatieRoleSecurity           = "Security"
	SpatieRoleSupervisor         = "Supervisor"
	SpatieRoleManajemen          = "Manajemen"
	SpatieRoleKeuangan           = "Keuangan"
	SpatieRoleKoperasi           = "Koperasi"
	SpatieRoleKiosk              = "Kiosk"
	SpatieRoleCustomer           = "Customer"
)

// New tenant role slugs, from apps/api/internal/platform/authz/role_defaults.go.
const (
	RoleSuperAdmin = "super_admin"
	RoleAdmin      = "admin"
	RoleTeacher    = "teacher"
	RoleStaff      = "staff"
	RoleStudent    = "student"
)

// identityRoleBySpatie maps a Spatie role name directly to a target identity
// role slug. Only these four have a genuine one-to-one identity meaning; the
// live data never has a user holding more than one, but identityRolePriority
// still resolves that case deterministically.
var identityRoleBySpatie = map[string]string{
	SpatieRoleSuperAdmin: RoleSuperAdmin,
	SpatieRoleAdmin:      RoleAdmin,
	SpatieRoleTeacher:    RoleTeacher,
	SpatieRoleStudent:    RoleStudent,
}

var identityRolePriority = []string{RoleSuperAdmin, RoleAdmin, RoleTeacher, RoleStudent}

// staffSignalRoles carry no identity-role meaning of their own but mark the
// holder as an employee: a user who holds one of these, and none of the
// four core roles above, defaults to the "staff" identity role. This is a
// defensible default, not a precise match -- "Class Administrator" is
// deliberately excluded (it is derived exactly from class_administrators
// instead, see migrate_duties.go) and "Customer" is deliberately excluded
// (canteen/coop module signal, not a staff signal at all).
var staffSignalRoles = map[string]bool{
	SpatieRolePicket: true, SpatieRolePustakawan: true, SpatieRoleSecurity: true, SpatieRoleBK: true,
	SpatieRoleSupervisor: true, SpatieRoleManajemen: true, SpatieRoleKeuangan: true,
	SpatieRoleKoperasi: true, SpatieRoleKiosk: true,
}

// rolesWithNoDutyEquivalent are staff-signal roles that additionally have no
// matching duty_type in the target schema. A holder still gets the "staff"
// identity role, but the role name itself is reported as a gap.
var rolesWithNoDutyEquivalent = map[string]bool{
	SpatieRoleSupervisor: true, SpatieRoleManajemen: true, SpatieRoleKeuangan: true,
	SpatieRoleKoperasi: true, SpatieRoleKiosk: true,
}

// MapIdentityRole resolves one user's identity role slug from every Spatie
// role name they hold. Resolution order:
//  1. Super Admin/Administrator/Teacher/Student, if held, always wins
//     (in that priority, though the live data never holds more than one).
//  2. Otherwise, any operational/employee-sounding role (Picket, Pustakawan,
//     Security, BK, Supervisor, Manajemen, Keuangan, Koperasi, Kiosk)
//     defaults the identity role to "staff".
//  3. Otherwise ok is false: the user gets no identity role (in the live
//     data this only happens for a "Customer"-only user, or no role at all).
//
// unmapped lists every held role name that has no identity or duty
// equivalent in the target schema (the "no defensible default" subset of
// the staff-signal roles), for the caller to record as a report gap
// regardless of what slug was resolved.
func MapIdentityRole(roleNames []string) (slug string, unmapped []string, ok bool) {
	for _, r := range roleNames {
		if rolesWithNoDutyEquivalent[r] {
			unmapped = append(unmapped, r)
		}
	}

	for _, candidate := range identityRolePriority {
		for _, r := range roleNames {
			if identityRoleBySpatie[r] == candidate {
				return candidate, unmapped, true
			}
		}
	}

	for _, r := range roleNames {
		if staffSignalRoles[r] {
			return RoleStaff, unmapped, true
		}
	}
	return "", unmapped, false
}

// ProfileKindForRole returns the user_profiles.kind that corresponds to a
// mapped role slug, mirroring cmd/seed's profileKindByRole table.
func ProfileKindForRole(roleSlug string) (kind string, ok bool) {
	switch roleSlug {
	case RoleAdmin, RoleStaff, RoleSuperAdmin:
		return "staff", true
	case RoleTeacher:
		return "teacher", true
	case RoleStudent:
		return "student", true
	default:
		return "", false
	}
}
