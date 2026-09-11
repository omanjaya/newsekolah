package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func (h *AttendanceHandler) GetMyAttendanceCalendar(ctx context.Context, request api.GetMyAttendanceCalendarRequestObject) (api.GetMyAttendanceCalendarResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	days, err := h.service.GetStudentCalendarMonth(ctx, tenantID, userID, request.Params.Month)
	if err != nil {
		return nil, mapAttendanceError(err)
	}
	return api.GetMyAttendanceCalendar200JSONResponse{Data: toAPICalendarDays(days)}, nil
}

func (h *AttendanceHandler) GetHomeroomAttendance(ctx context.Context, request api.GetHomeroomAttendanceRequestObject) (api.GetHomeroomAttendanceResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	actor, err := h.actorFor(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}

	params := request.Params
	f := service.HomeroomFilter{}
	if params.Search != nil {
		f.Search = *params.Search
	}
	if params.StatusCode != nil {
		f.StatusCode = *params.StatusCode
	}
	if params.Limit != nil {
		f.Limit = *params.Limit
	}
	if params.Offset != nil {
		f.Offset = *params.Offset
	}

	roster, err := h.service.GetHomeroomAttendance(ctx, tenantID, actor, params.Date.Time, f)
	if err != nil {
		return nil, mapAttendanceError(err)
	}
	return api.GetHomeroomAttendance200JSONResponse{
		Data: toAPIHomeroomEntries(roster.Students), Total: roster.Total, StatusCounts: roster.StatusCounts,
	}, nil
}

func (h *AttendanceHandler) GetMonthlyAttendanceSummary(ctx context.Context, request api.GetMonthlyAttendanceSummaryRequestObject) (api.GetMonthlyAttendanceSummaryResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)

	days, totals, err := h.service.GetMonthlySummary(ctx, tenantID, request.Params.StudentId, request.Params.Month)
	if err != nil {
		return nil, mapAttendanceError(err)
	}
	return api.GetMonthlyAttendanceSummary200JSONResponse{Data: toAPICalendarDays(days), Totals: totals}, nil
}
