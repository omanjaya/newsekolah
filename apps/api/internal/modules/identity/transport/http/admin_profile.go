package http

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func (h *Handler) UpdateMyProfile(ctx context.Context, request api.UpdateMyProfileRequestObject) (api.UpdateMyProfileResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)
	b := request.Body

	email, locale := "", ""
	if b.Email != nil {
		email = string(*b.Email)
	}
	if b.Locale != nil {
		locale = string(*b.Locale)
	}
	me, err := h.service.UpdateMyProfile(ctx, tenantID, userID, service.UpdateMyProfileInput{
		Username: strOf(b.Username), Name: strOf(b.Name), Email: email, Phone: strOf(b.Phone), Locale: locale,
		Detail: fromAPIProfile(b.Detail),
	})
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.UpdateMyProfile200JSONResponse(h.toAPIMe(ctx, tenantID, me)), nil
}

func (h *Handler) RequestAvatarUpload(ctx context.Context, _ api.RequestAvatarUploadRequestObject) (api.RequestAvatarUploadResponseObject, error) {
	target, err := h.service.RequestAvatarUpload(ctx, tenantIDFromContext(ctx))
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.RequestAvatarUpload200JSONResponse{
		UploadUrl: target.UploadURL, ObjectKey: target.ObjectKey, ExpiresAt: target.ExpiresAt,
	}, nil
}

func (h *Handler) ConfirmAvatarUpload(ctx context.Context, request api.ConfirmAvatarUploadRequestObject) (api.ConfirmAvatarUploadResponseObject, error) {
	userID, _ := httpx.UserIDFromContext(ctx)
	url, err := h.service.ConfirmAvatarUpload(ctx, tenantIDFromContext(ctx), userID, request.Body.ObjectKey)
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.ConfirmAvatarUpload200JSONResponse{AvatarUrl: url}, nil
}

func (h *Handler) ListAuditLogs(ctx context.Context, request api.ListAuditLogsRequestObject) (api.ListAuditLogsResponseObject, error) {
	p := request.Params
	filter := service.AuditLogFilter{
		ActorUserID: nullUUID(p.ActorUserId), EntityType: strOf(p.EntityType), EntityID: nullUUID(p.EntityId),
		Limit: intOf(p.Limit),
	}
	if p.From != nil {
		filter.From = *p.From
	}
	if p.To != nil {
		filter.To = *p.To
	}
	if p.Cursor != nil {
		filter.Cursor = *p.Cursor
	}
	result, err := h.service.ListAuditLogs(ctx, tenantIDFromContext(ctx), filter)
	if err != nil {
		return nil, mapAdminError(err)
	}
	data := make([]api.AuditLogEntry, len(result.Items))
	for i, r := range result.Items {
		data[i] = toAPIAuditEntry(r)
	}
	resp := api.ListAuditLogs200JSONResponse{Data: data}
	if result.NextCursor != uuid.Nil {
		next := result.NextCursor
		resp.NextCursor = &next
	}
	return resp, nil
}
