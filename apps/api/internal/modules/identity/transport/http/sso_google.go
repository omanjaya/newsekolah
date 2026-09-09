package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// GetGoogleSSOAvailability answers the login screen's "should I show a
// Google button" check. It is public: an unauthenticated caller must be
// able to ask it before anyone has signed in.
func (h *Handler) GetGoogleSSOAvailability(ctx context.Context, _ api.GetGoogleSSOAvailabilityRequestObject) (api.GetGoogleSSOAvailabilityResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)

	availability, err := h.service.GetGoogleSSOAvailability(ctx, tenantID)
	if err != nil {
		return nil, mapAuthError(err)
	}

	resp := api.GetGoogleSSOAvailability200JSONResponse{Enabled: availability.Enabled}
	if availability.Enabled {
		clientID := availability.ClientID
		resp.ClientId = &clientID
	}
	return resp, nil
}

// LoginWithGoogle verifies a Google ID token and opens a session, exactly
// like Login but for the "Sign in with Google" button.
func (h *Handler) LoginWithGoogle(ctx context.Context, request api.LoginWithGoogleRequestObject) (api.LoginWithGoogleResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	body := request.Body
	ip, userAgent := deviceInfoFromContext(ctx)

	result, err := h.service.GoogleLogin(ctx, service.GoogleLoginInput{
		TenantID:   tenantID,
		IDToken:    body.IdToken,
		Client:     toClientKind(body.Client),
		DeviceID:   strOf(body.DeviceId),
		DeviceName: strOf(body.DeviceName),
		IP:         ip,
		UserAgent:  userAgent,
	})
	if err != nil {
		return nil, mapAuthError(err)
	}

	tokens := h.toAuthTokens(ctx, tenantID, result, body.Client)
	resp := api.LoginWithGoogle200JSONResponse{Body: tokens}
	if body.Client == api.Web {
		cookie := httpx.RefreshCookie(result.RefreshToken, result.RefreshExpiresAt, h.isProduction)
		resp.Headers.SetCookie = &cookie
	}
	return resp, nil
}

// GetGoogleSSOConfig reads the tenant's Google SSO configuration for the
// admin screen. The client secret is never returned.
func (h *Handler) GetGoogleSSOConfig(ctx context.Context, _ api.GetGoogleSSOConfigRequestObject) (api.GetGoogleSSOConfigResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)

	cfg, ok, err := h.service.GetGoogleSSOConfig(ctx, tenantID)
	if err != nil {
		return nil, mapAuthError(err)
	}
	return api.GetGoogleSSOConfig200JSONResponse(toAPIGoogleSSOConfig(cfg, ok)), nil
}

// SetGoogleSSOConfig creates or replaces the configuration.
func (h *Handler) SetGoogleSSOConfig(ctx context.Context, request api.SetGoogleSSOConfigRequestObject) (api.SetGoogleSSOConfigResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	body := request.Body

	cfg, err := h.service.SetGoogleSSOConfig(ctx, tenantID, service.GoogleSSOInput{
		ClientID:     body.ClientId,
		ClientSecret: strOf(body.ClientSecret),
		HostedDomain: body.HostedDomain,
		Enabled:      body.Enabled,
	})
	if err != nil {
		return nil, mapAuthError(err)
	}
	return api.SetGoogleSSOConfig200JSONResponse(toAPIGoogleSSOConfig(cfg, true)), nil
}

// DeleteGoogleSSOConfig removes it.
func (h *Handler) DeleteGoogleSSOConfig(ctx context.Context, _ api.DeleteGoogleSSOConfigRequestObject) (api.DeleteGoogleSSOConfigResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	if err := h.service.DeleteGoogleSSOConfig(ctx, tenantID); err != nil {
		return nil, mapAuthError(err)
	}
	return api.DeleteGoogleSSOConfig204Response{}, nil
}

func toAPIGoogleSSOConfig(cfg service.GoogleSSOConfig, configured bool) api.GoogleSSOConfig {
	out := api.GoogleSSOConfig{Configured: configured, Enabled: cfg.Enabled}
	if configured {
		clientID := cfg.ClientID
		hostedDomain := cfg.HostedDomain
		out.ClientId = &clientID
		out.HostedDomain = &hostedDomain
	}
	return out
}
