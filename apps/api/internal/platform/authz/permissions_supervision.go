package authz

const (
	PermViewSupervision   = "view_supervision"
	PermManageSupervision = "manage_supervision"
	PermRespondSupervised = "respond_to_supervision"
)

func init() {
	Catalog = append(Catalog,
		Permission{PermViewSupervision, "supervision", "See supervision cycles, scheduled and completed observations, and reports"},
		Permission{PermManageSupervision, "supervision", "Define an instrument, schedule observations and complete them as an observer"},
		Permission{PermRespondSupervised, "supervision", "Add a teacher's response and agreed follow-up to an observation of their own lesson"},
	)
}
