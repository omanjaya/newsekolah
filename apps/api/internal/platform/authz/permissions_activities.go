package authz

const (
	PermViewActivities                  = "view_activities"
	PermManageExtracurriculars          = "manage_extracurriculars"
	PermRecordExtracurricularAttendance = "record_extracurricular_attendance"
	PermManageActivityEvents            = "manage_activity_events"
	PermManageAchievements              = "manage_achievements"
)

func init() {
	Catalog = append(Catalog,
		Permission{PermViewActivities, "activities", "See extracurricular clubs, memberships, activities and achievements"},
		Permission{PermManageExtracurriculars, "activities", "Edit the club catalogue and manage memberships"},
		Permission{PermRecordExtracurricularAttendance, "activities", "Schedule club meetings and record attendance"},
		Permission{PermManageActivityEvents, "activities", "Create and edit one-off school activities"},
		Permission{PermManageAchievements, "activities", "Record student competition achievements"},
	)
}
