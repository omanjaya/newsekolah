package authz

const (
	PermViewVisitors           = "view_visitors"
	PermManageVisitors         = "manage_visitors"
	PermViewVisitorIncidents   = "view_visitor_incidents"
	PermManageVisitorIncidents = "manage_visitor_incidents"
	PermViewVisitorReports     = "view_visitor_reports"
)

func init() {
	Catalog = append(Catalog,
		Permission{PermViewVisitors, "visitors", "See the expected-guest list, the gate board and visit history"},
		Permission{PermManageVisitors, "visitors", "Sign a guest in or out and manage the expected-guest list"},
		Permission{PermViewVisitorIncidents, "visitors", "Read a campus incident record, including any names it holds"},
		Permission{PermManageVisitorIncidents, "visitors", "Record, update or close a campus incident"},
		Permission{PermViewVisitorReports, "visitors", "See and export the daily and monthly visitor recap"},
	)
}
