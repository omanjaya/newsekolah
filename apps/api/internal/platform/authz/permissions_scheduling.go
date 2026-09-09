package authz

// PermViewJournalsAll lets a supervisor (e.g. an academic coordinator) read
// every class journal for an academic year, not just their own teaching
// journals -- docs' scheduling module brief, item 3.
const PermViewJournalsAll = "view_journals_all"

// init-append: the scheduling module's own permission, added to the
// shared Catalog without editing internal/platform/authz/permissions.go
// (which the identity module's tests and other modules also touch),
// keeping this a purely additive file per the parallel-worktree merge plan.
func init() {
	Catalog = append(Catalog, Permission{
		Code: PermViewJournalsAll, Group: "scheduling", Description: "View every class journal for an academic year",
	})
}
