package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func (h *AttendanceHandler) ListMyAttendanceToday(ctx context.Context, _ api.ListMyAttendanceTodayRequestObject) (api.ListMyAttendanceTodayResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	sessions, err := h.service.ListToday(ctx, tenantID, userID)
	if err != nil {
		return nil, mapAttendanceError(err)
	}

	data := make([]api.AttendanceSessionSummary, len(sessions))
	for i, s := range sessions {
		data[i] = toAPISessionSummary(s)
	}
	return api.ListMyAttendanceToday200JSONResponse{Data: data}, nil
}

func (h *AttendanceHandler) OpenAttendanceSession(ctx context.Context, request api.OpenAttendanceSessionRequestObject) (api.OpenAttendanceSessionResponseObject, error) {
	if request.Body == nil {
		return nil, httpx.ErrValidation
	}
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	actor, err := h.actorFor(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}

	detail, err := h.service.OpenSession(ctx, tenantID, actor, request.Body.ScheduleId, request.Body.Date.Time)
	if err != nil {
		return nil, mapAttendanceError(err)
	}
	return api.OpenAttendanceSession200JSONResponse(toAPISessionDetail(detail)), nil
}

func (h *AttendanceHandler) GetAttendanceSession(ctx context.Context, request api.GetAttendanceSessionRequestObject) (api.GetAttendanceSessionResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	actor, err := h.actorFor(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}

	detail, err := h.service.GetSessionDetail(ctx, tenantID, actor, request.SessionId)
	if err != nil {
		return nil, mapAttendanceError(err)
	}
	return api.GetAttendanceSession200JSONResponse(toAPISessionDetail(detail)), nil
}
