// Package mapping holds the pure transformation rules the ETL applies while
// moving rows from a SION MySQL database into a newsekolah tenant: role and
// duty mapping, identifier and name cleanup, date and timezone
// normalisation, and the natural-key rules idempotency depends on. Nothing
// here touches a database or the network, so it is covered by unit tests
// instead of integration tests.
package mapping

// Old SION role IDs, from reference/sion/backend/internal/rbac/rbac.go.
const (
	SionRoleSuperAdmin = "super_admin"
	SionRoleAdmin      = "admin"
	SionRoleGuru       = "guru"
	SionRolePegawai    = "pegawai"
	SionRoleSiswa      = "siswa"
)

// New tenant role slugs, from apps/api/internal/platform/authz/role_defaults.go.
const (
	RoleSuperAdmin = "super_admin"
	RoleAdmin      = "admin"
	RoleTeacher    = "teacher"
	RoleStaff      = "staff"
	RoleStudent    = "student"
)

var roleBySionID = map[string]string{
	SionRoleSuperAdmin: RoleSuperAdmin,
	SionRoleAdmin:      RoleAdmin,
	SionRoleGuru:       RoleTeacher,
	SionRolePegawai:    RoleStaff,
	SionRoleSiswa:      RoleStudent,
}

// MapRole translates a SION role id to the equivalent role slug in the new
// role model. It reports false for a role the old system never had (there is
// no "parent" role in SION; parent accounts do not exist there), which the
// caller records as a gap rather than inventing a role assignment.
func MapRole(sionRoleID string) (slug string, ok bool) {
	slug, ok = roleBySionID[sionRoleID]
	return slug, ok
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
