package authz

const (
	PermViewSupervision   = "view_supervision"
	PermManageSupervision = "manage_supervision"
	PermRespondSupervised = "respond_to_supervision"
	// PermViewOwnSupervision is the observed teacher's read: the cycles,
	// and their own report, planned visits and observations only. The
	// supervision service scopes it to the caller (domain.Reader), so it
	// never exposes another teacher's results the way view_supervision
	// does.
	PermViewOwnSupervision = "view_own_supervision"
)

func init() {
	Catalog = append(Catalog,
		Permission{PermViewSupervision, "supervision", "See supervision cycles, scheduled and completed observations, and reports"},
		Permission{PermViewOwnSupervision, "supervision", "See the supervision cycles and your own report and observations as the observed teacher"},
		Permission{PermManageSupervision, "supervision", "Define an instrument, schedule observations and complete them as an observer"},
		Permission{PermRespondSupervised, "supervision", "Add a teacher's response and agreed follow-up to an observation of their own lesson"},
	)
}
