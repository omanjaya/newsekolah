package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func toAPIAuthSettings(s domain.AuthSettings) api.AuthSettings {
	return api.AuthSettings{SessionDays: s.SessionDays, SingleDevice: s.SingleDevice}
}

func (h *Handler) GetAuthSettings(ctx context.Context, _ api.GetAuthSettingsRequestObject) (api.GetAuthSettingsResponseObject, error) {
	settings, err := h.service.AuthSettings(ctx, tenantIDFromContext(ctx))
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.GetAuthSettings200JSONResponse(toAPIAuthSettings(settings)), nil
}

func (h *Handler) UpdateAuthSettings(ctx context.Context, request api.UpdateAuthSettingsRequestObject) (api.UpdateAuthSettingsResponseObject, error) {
	actorID, _ := httpx.UserIDFromContext(ctx)
	b := request.Body
	settings, err := h.service.UpdateAuthSettings(ctx, tenantIDFromContext(ctx), actorID, domain.AuthSettings{
		SessionDays: b.SessionDays, SingleDevice: b.SingleDevice,
	})
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.UpdateAuthSettings200JSONResponse(toAPIAuthSettings(settings)), nil
}
