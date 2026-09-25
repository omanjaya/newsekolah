// Package http implements school's slice of the generated
// api.StrictServerInterface: tenant branding and tenant lookup, both
// public endpoints.
package http

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

type TenantHandler struct {
	service *service.Service
	// clock backs the report header preview's "today" scope date; it is
	// never injected from outside (the preview is cosmetic, not part of
	// any deterministic business rule), but forbidigo still requires it
	// to go through clock.Clock instead of a direct time.Now() call.
	clock clock.Clock
}

func New(svc *service.Service) *TenantHandler {
	return &TenantHandler{service: svc, clock: clock.Real{}}
}

// Branding implements identity/transport/http.BrandingReader, letting the
// identity module fill Me.tenant without importing this package's HTTP
// types directly (it goes through the api.TenantBranding shape either way).
func (h *TenantHandler) Branding(ctx context.Context, tenantID uuid.UUID) (api.TenantBranding, error) {
	b, err := h.service.Branding(ctx, tenantID)
	if err != nil {
		return api.TenantBranding{}, err
	}
	return toAPIBranding(b), nil
}

func (h *TenantHandler) GetTenantBranding(ctx context.Context, _ api.GetTenantBrandingRequestObject) (api.GetTenantBrandingResponseObject, error) {
	t, ok := tenant.FromContext(ctx)
	if !ok {
		return nil, httpx.ErrTenantNotFound
	}
	b, err := h.service.Branding(ctx, t.ID)
	if err != nil {
		return nil, httpx.ErrTenantNotFound
	}
	return api.GetTenantBranding200JSONResponse(toAPIBranding(b)), nil
}

func (h *TenantHandler) LookupTenants(ctx context.Context, request api.LookupTenantsRequestObject) (api.LookupTenantsResponseObject, error) {
	summaries, err := h.service.LookupTenants(ctx, request.Params.Q)
	if err != nil {
		return nil, httpx.ErrInternal
	}

	data := make([]api.TenantSummary, len(summaries))
	for i, s := range summaries {
		data[i] = api.TenantSummary{Id: s.ID, Slug: s.Slug, Name: s.Name}
		if s.City != "" {
			city := s.City
			data[i].City = &city
		}
	}
	return api.LookupTenants200JSONResponse{Data: data}, nil
}

func toAPIBranding(b domain.Branding) api.TenantBranding {
	branding := api.TenantBranding{
		TenantId:    b.TenantID,
		Slug:        b.Slug,
		Name:        b.Name,
		AccentColor: b.AccentColor,
		Locale:      api.TenantBrandingLocale(b.Locale),
		Timezone:    b.Timezone,
	}
	if b.ProductName != "" {
		branding.ProductName = &b.ProductName
	}
	if b.ShortName != "" {
		branding.ShortName = &b.ShortName
	}
	if b.Tagline != "" {
		branding.Tagline = &b.Tagline
	}
	if b.LogoURL != "" {
		branding.LogoUrl = &b.LogoURL
	}
	if b.FaviconURL != "" {
		branding.FaviconUrl = &b.FaviconURL
	}
	if b.EducationLevel != "" {
		level := api.TenantBrandingEducationLevel(b.EducationLevel)
		branding.EducationLevel = &level
	}
	return branding
}
