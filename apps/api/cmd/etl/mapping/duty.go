package mapping

// New tenant duty type slugs, from apps/api/cmd/seed/main.go's systemDuties.
const (
	DutyHomeroom   = "homeroom"
	DutyCounselor  = "counselor"
	DutyPicket     = "picket"
	DutyLeadership = "leadership"
	DutySecurity   = "security"
	DutyLibrarian  = "librarian"
)

// dutyBySpatieRole maps a live-schema Spatie role name straight to a
// school-scoped duty type, for the roles whose meaning IS the duty
// (unlike staffSignalRoles in role.go, which only implies staff membership).
// Homeroom is deliberately absent here: it comes from the precise
// class_administrators table instead, never from a role name.
var dutyBySpatieRole = map[string]string{
	SpatieRoleBK:         DutyCounselor,
	SpatieRolePicket:     DutyPicket,
	SpatieRolePustakawan: DutyLibrarian,
	SpatieRoleSecurity:   DutySecurity,
}

// DutyForSpatieRole returns the duty type slug a live-schema Spatie role
// name directly implies, if any.
func DutyForSpatieRole(roleName string) (slug string, ok bool) {
	slug, ok = dutyBySpatieRole[roleName]
	return slug, ok
}
