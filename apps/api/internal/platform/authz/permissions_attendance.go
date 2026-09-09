package authz

// PermViewMonitorPresence gates GET /v1/monitor/presence: unlike the
// public monitor snapshot (gated by the tenant's monitor.display_token,
// not a permission), presence reveals which staff accounts currently have
// a realtime connection open, which is internal information.
const PermViewMonitorPresence = "view_monitor_presence"

// init-append: the attendance module's own permission, added to the
// shared Catalog without editing internal/platform/authz/permissions.go,
// keeping this a purely additive file per the parallel-worktree merge plan.
func init() {
	Catalog = append(Catalog, Permission{
		Code: PermViewMonitorPresence, Group: "attendance", Description: "View who currently has a realtime monitor connection open",
	})
}
