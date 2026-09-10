package authz

// The staff attendance module's own permissions (docs/12-roadmap.md Fase 6,
// "absensi pegawai"), added to the shared Catalog without editing
// internal/platform/authz/permissions.go, keeping this a purely additive
// file per the parallel-worktree merge plan (mirrors
// permissions_attendance.go's init-append pattern).
const (
	PermViewStaffAttendance            = "view_staff_attendance"
	PermManageStaffAttendance          = "manage_staff_attendance"
	PermCorrectStaffAttendance         = "correct_staff_attendance"
	PermManageStaffAttendanceSchedules = "manage_staff_attendance_schedules"
)

func init() {
	Catalog = append(Catalog,
		Permission{Code: PermViewStaffAttendance, Group: "staff_attendance", Description: "View staff attendance records"},
		Permission{Code: PermManageStaffAttendance, Group: "staff_attendance", Description: "Record staff attendance (scan, manual entry, device import)"},
		Permission{Code: PermCorrectStaffAttendance, Group: "staff_attendance", Description: "Correct a submitted staff attendance record"},
		Permission{Code: PermManageStaffAttendanceSchedules, Group: "staff_attendance", Description: "Edit an employee's work schedule"},
	)
}
