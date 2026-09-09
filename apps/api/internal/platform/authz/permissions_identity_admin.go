package authz

// Permissions added by the identity module's administration features
// (users, roles, duties, impersonation, audit log). Everything else those
// features need -- listing/creating/editing/archiving users, viewing and
// managing roles, managing duty types and assignments -- reuses the
// existing view_users/create_users/edit_users/delete_users/view_roles/
// manage_permissions/manage_master_data codes from permissions.go, matching
// how the old application grouped these actions (docs/analysis/
// backend-inventory.md sections 1.3, 1.5, 1.6).
const (
	PermImpersonateUsers = "impersonate_users"
	PermViewAuditLogs    = "view_audit_logs"
)

// init appends to the package-level Catalog declared in permissions.go
// instead of editing that file, so the identity module's own permission
// additions stay in one file it owns.
func init() {
	Catalog = append(Catalog,
		Permission{PermImpersonateUsers, "access", "Start an impersonation session as another user"},
		Permission{PermViewAuditLogs, "access", "View the audit log"},
	)
}
