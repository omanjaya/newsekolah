package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func (h *StaffAttendanceHandler) ListStaffAttendanceRoster(ctx context.Context, _ api.ListStaffAttendanceRosterRequestObject) (api.ListStaffAttendanceRosterResponseObject, error) {
	roster, err := h.service.ListRoster(ctx, tenantIDFromContext(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.ListStaffAttendanceRoster200JSONResponse{Data: toAPIEmployees(roster)}, nil
}

func (h *StaffAttendanceHandler) GetStaffAttendanceSchedule(ctx context.Context, request api.GetStaffAttendanceScheduleRequestObject) (api.GetStaffAttendanceScheduleResponseObject, error) {
	days, err := h.service.GetWeeklySchedule(ctx, tenantIDFromContext(ctx), request.EmployeeId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetStaffAttendanceSchedule200JSONResponse{Data: toAPIScheduleDays(days)}, nil
}

func (h *StaffAttendanceHandler) ReplaceStaffAttendanceSchedule(ctx context.Context, request api.ReplaceStaffAttendanceScheduleRequestObject) (api.ReplaceStaffAttendanceScheduleResponseObject, error) {
	if request.Body == nil {
		return nil, httpx.ErrValidation
	}
	userID, _ := httpx.UserIDFromContext(ctx)
	days, err := h.service.ReplaceWeeklySchedule(
		ctx, tenantIDFromContext(ctx), request.EmployeeId, userID, toServiceScheduleDayInputs(request.Body.Days),
	)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ReplaceStaffAttendanceSchedule200JSONResponse{Data: toAPIScheduleDays(days)}, nil
}
