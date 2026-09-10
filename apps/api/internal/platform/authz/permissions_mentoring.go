package authz

const (
	PermViewMentoring      = "view_mentoring"
	PermManageMentoring    = "manage_mentoring"
	PermManageMentorGroups = "manage_mentor_groups"
)

func init() {
	Catalog = append(Catalog,
		Permission{PermViewMentoring, "mentoring", "See a mentor group, its members and per-student view"},
		Permission{PermManageMentoring, "mentoring", "Write meeting notes and term summaries as a guru wali"},
		Permission{PermManageMentorGroups, "mentoring", "Create mentor groups and assign students, and set the group-size limit"},
	)
}
