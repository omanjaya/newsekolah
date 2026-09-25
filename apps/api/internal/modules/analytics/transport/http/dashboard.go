package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// isAdminCaller restricts the admin dashboard to the admin/super_admin/
// principal system roles, matching the old app's explicit role check
// (reference/sion-rebuild-go admin_dashboard.go) on top of the
// view_dashboard permission every role with dashboard access holds. The
// principal role is included so "Kepala Sekolah" lands on a useful
// dashboard by reusing this overview (active users, pending queues,
// sign-in activity) rather than a new screen being built for it
// (docs/analysis/audit-pra-deploy-2026-09-23.md's role matrix).
func isAdminCaller(ctx context.Context) bool {
	for _, slug := range authz.IdentityFromContext(ctx).Roles {
		if slug == authz.RoleSlugAdmin || slug == authz.RoleSlugSuperAdmin || slug == authz.RoleSlugPrincipal {
			return true
		}
	}
	return false
}

func (h *AnalyticsHandler) GetAdminDashboard(ctx context.Context, _ api.GetAdminDashboardRequestObject) (api.GetAdminDashboardResponseObject, error) {
	if !isAdminCaller(ctx) {
		return nil, httpx.ErrForbidden
	}

	dashboard, err := h.service.AdminDashboard(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}

	histogram := make([]int, 24)
	copy(histogram, dashboard.LoginHistogramByHour[:])

	return api.GetAdminDashboard200JSONResponse{
		ActiveUsers: dashboard.ActiveUsersByProfileKind,
		Pending: struct {
			ExitPermit   int `json:"exit_permit"`
			LateArrival  int `json:"late_arrival"`
			LeaveRequest int `json:"leave_request"`
		}{
			LeaveRequest: dashboard.PendingByKind["leave_request"],
			ExitPermit:   dashboard.PendingByKind["exit_permit"],
			LateArrival:  dashboard.PendingByKind["late_arrival"],
		},
		OnlineByRole:   dashboard.OnlineByRole,
		LoginHistogram: histogram,
		AttendanceToday: &api.AttendanceTodayProgress{
			Submitted: dashboard.AttendanceSubmittedToday,
			Total:     dashboard.AttendanceTotalToday,
		},
	}, nil
}
