package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func (h *AttendanceHandler) GetAttendanceSettings(ctx context.Context, _ api.GetAttendanceSettingsRequestObject) (api.GetAttendanceSettingsResponseObject, error) {
	settings, err := h.service.AttendanceSettings(ctx, tenantIDFromContext(ctx))
	if err != nil {
		return nil, mapAttendanceError(err)
	}
	return api.GetAttendanceSettings200JSONResponse(toAPIAttendanceSettings(settings)), nil
}

func (h *AttendanceHandler) UpdateAttendanceSettings(ctx context.Context, request api.UpdateAttendanceSettingsRequestObject) (api.UpdateAttendanceSettingsResponseObject, error) {
	if request.Body == nil {
		return nil, httpx.ErrValidation
	}
	actorID, _ := httpx.UserIDFromContext(ctx)
	settings, err := h.service.UpdateAttendanceSettings(ctx, tenantIDFromContext(ctx), actorID, service.Settings{
		CorrectionDays: request.Body.CorrectionDays,
	})
	if err != nil {
		return nil, mapAttendanceError(err)
	}
	return api.UpdateAttendanceSettings200JSONResponse(toAPIAttendanceSettings(settings)), nil
}

func toAPIAttendanceSettings(s service.Settings) api.AttendanceSettings {
	return api.AttendanceSettings{CorrectionDays: s.CorrectionDays}
}
