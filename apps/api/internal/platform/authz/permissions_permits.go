package authz

// Permits module permission codes, appended to Catalog in init() so parallel
// module work never edits permissions.go.
const (
	PermIssueScanTokens = "issue_scan_tokens"
	PermManageWorkflows = "manage_workflows"
)

func init() {
	Catalog = append(Catalog,
		Permission{PermIssueScanTokens, "permits", "Mint QR scan tokens for classroom entry, late arrivals and stage approvals"},
		Permission{PermManageWorkflows, "permits", "Configure approval workflows for exit permits, late arrivals and leave requests"},
	)
}
