package http

import (
	"context"
	"errors"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func mapBrandingError(err error) error {
	switch {
	case errors.Is(err, domain.ErrInvalidAccentColor):
		return httpx.ErrValidation.WithDetails(httpx.ErrorDetail{Field: "accent_color", Code: "INVALID_FORMAT"})
	case errors.Is(err, domain.ErrBrandingNameTooLong):
		return httpx.ErrValidation.WithDetails(httpx.ErrorDetail{Field: "name", Code: "TOO_LONG"})
	case errors.Is(err, domain.ErrUploadNotConfigured):
		return httpx.ErrUploadNotConfigured
	case errors.Is(err, domain.ErrUploadInvalidType):
		return httpx.ErrUploadInvalidFileType
	case errors.Is(err, domain.ErrUploadTooLarge):
		return httpx.ErrUploadFileTooLarge
	case errors.Is(err, domain.ErrUploadObjectNotOwned):
		return httpx.ErrUploadInvalidFileType
	case errors.Is(err, domain.ErrTenantNotFound):
		return httpx.ErrTenantNotFound
	}
	var appErr *httpx.Error
	if errors.As(err, &appErr) {
		return appErr
	}
	return httpx.Internal(err)
}

func (h *TenantHandler) UpdateTenantBranding(ctx context.Context, request api.UpdateTenantBrandingRequestObject) (api.UpdateTenantBrandingResponseObject, error) {
	tenantID, _ := httpx.TenantIDFromContext(ctx)
	actorID, _ := httpx.UserIDFromContext(ctx)
	b := request.Body
	branding, err := h.service.UpdateBranding(ctx, tenantID, actorID, domain.BrandingWrite{
		Name: b.Name, ShortName: strOf(b.ShortName), Tagline: strOf(b.Tagline), AccentColor: strOf(b.AccentColor),
	})
	if err != nil {
		return nil, mapBrandingError(err)
	}
	return api.UpdateTenantBranding200JSONResponse(toAPIBranding(branding)), nil
}

func (h *TenantHandler) RequestLogoUpload(ctx context.Context, _ api.RequestLogoUploadRequestObject) (api.RequestLogoUploadResponseObject, error) {
	tenantID, _ := httpx.TenantIDFromContext(ctx)
	target, err := h.service.RequestLogoUpload(ctx, tenantID)
	if err != nil {
		return nil, mapBrandingError(err)
	}
	return api.RequestLogoUpload200JSONResponse(toAPIUploadTarget(target)), nil
}

func (h *TenantHandler) ConfirmLogoUpload(ctx context.Context, request api.ConfirmLogoUploadRequestObject) (api.ConfirmLogoUploadResponseObject, error) {
	tenantID, _ := httpx.TenantIDFromContext(ctx)
	actorID, _ := httpx.UserIDFromContext(ctx)
	branding, err := h.service.ConfirmLogoUpload(ctx, tenantID, actorID, request.Body.ObjectKey)
	if err != nil {
		return nil, mapBrandingError(err)
	}
	return api.ConfirmLogoUpload200JSONResponse(toAPIBranding(branding)), nil
}

func (h *TenantHandler) RequestFaviconUpload(ctx context.Context, _ api.RequestFaviconUploadRequestObject) (api.RequestFaviconUploadResponseObject, error) {
	tenantID, _ := httpx.TenantIDFromContext(ctx)
	target, err := h.service.RequestFaviconUpload(ctx, tenantID)
	if err != nil {
		return nil, mapBrandingError(err)
	}
	return api.RequestFaviconUpload200JSONResponse(toAPIUploadTarget(target)), nil
}

func (h *TenantHandler) ConfirmFaviconUpload(ctx context.Context, request api.ConfirmFaviconUploadRequestObject) (api.ConfirmFaviconUploadResponseObject, error) {
	tenantID, _ := httpx.TenantIDFromContext(ctx)
	actorID, _ := httpx.UserIDFromContext(ctx)
	branding, err := h.service.ConfirmFaviconUpload(ctx, tenantID, actorID, request.Body.ObjectKey)
	if err != nil {
		return nil, mapBrandingError(err)
	}
	return api.ConfirmFaviconUpload200JSONResponse(toAPIBranding(branding)), nil
}

func toAPIUploadTarget(t service.AssetUploadTarget) api.AssetUploadTarget {
	return api.AssetUploadTarget{UploadUrl: t.UploadURL, ObjectKey: t.ObjectKey, ExpiresAt: t.ExpiresAt}
}

func strOf(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
