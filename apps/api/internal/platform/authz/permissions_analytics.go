package authz

const (
	PermViewEarlyWarning        = "view_early_warning"
	PermManageEarlyWarningRules = "manage_early_warning_rules"
)

// init-append: the analytics module's own permissions, added to the
// shared Catalog without editing internal/platform/authz/permissions.go,
// following permissions_attendance.go's parallel-worktree convention.
func init() {
	Catalog = append(Catalog,
		Permission{PermViewEarlyWarning, "analytics", "See the early-warning risk list and a student's risk detail"},
		Permission{PermManageEarlyWarningRules, "analytics", "Tune the early-warning thresholds and weights"},
	)
}
