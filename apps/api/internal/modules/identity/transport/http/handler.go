// Package http implements identity's slice of the generated
// api.StrictServerInterface: request/response mapping only, no business
// rules and no SQL (both live in service/ and repository/).
package http

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// BrandingReader is the narrow interface identity's transport needs from
// the school module to fill Me.tenant; identity's service intentionally
// does not know about branding (see service/me.go).
type BrandingReader interface {
	Branding(ctx context.Context, tenantID uuid.UUID) (api.TenantBranding, error)
}

// SessionCache invalidates the authn middleware's 60s session cache
// immediately on logout/revoke, instead of waiting out the TTL. It is
// satisfied structurally by *platform/auth.SessionCache.
type SessionCache interface {
	Invalidate(ctx context.Context, sessionID uuid.UUID) error
}

type Handler struct {
	service      *service.Service
	branding     BrandingReader
	sessionCache SessionCache
	isProduction bool
	// appOrigins is the allowlist a cookie-based refresh's Origin header
	// is checked against (docs/08-security.md section 7). Empty disables
	// the check, same as an unconfigured APP_ORIGINS in dev.
	appOrigins []string
}

func New(svc *service.Service, branding BrandingReader, sessionCache SessionCache, isProduction bool, appOrigins []string) *Handler {
	return &Handler{service: svc, branding: branding, sessionCache: sessionCache, isProduction: isProduction, appOrigins: appOrigins}
}

// deviceInfoFromContext reads the client IP and User-Agent captured by
// httpx.RequestMetaMiddleware. Strict handlers only receive ctx, never the
// raw *http.Request, so this is the one place that bridges the two.
func deviceInfoFromContext(ctx context.Context) (ip, userAgent string) {
	meta := httpx.RequestMetaFromContext(ctx)
	return meta.IP, trimUserAgent(meta.UserAgent)
}

func mapAuthError(err error) error {
	switch {
	case errors.Is(err, domain.ErrMfaRequired):
		return httpx.ErrMfaRequired
	case errors.Is(err, domain.ErrMfaInvalidCode):
		return httpx.ErrMfaInvalidCode
	case errors.Is(err, domain.ErrRateLimited):
		return httpx.ErrRateLimited
	case errors.Is(err, domain.ErrInvalidCredentials), errors.Is(err, domain.ErrAccountNotActive):
		return httpx.ErrInvalidCreds
	case errors.Is(err, domain.ErrSessionNotFound), errors.Is(err, domain.ErrSessionExpired),
		errors.Is(err, domain.ErrRefreshReuseDetected), errors.Is(err, domain.ErrUserNotFound):
		return httpx.ErrTokenExpired
	case errors.Is(err, domain.ErrPasswordTooShort), errors.Is(err, domain.ErrPasswordTooLong):
		return httpx.ErrValidation.WithDetails(httpx.ErrorDetail{Field: "new_password", Code: "INVALID_LENGTH"})
	default:
		if mapped := mapSSOOrPasskeyError(err); mapped != nil {
			return mapped
		}
		var appErr *httpx.Error
		if errors.As(err, &appErr) {
			return appErr
		}
		return httpx.Internal(err)
	}
}

// mapSSOOrPasskeyError is mapAuthError's continuation for the Google SSO
// and passkey sign-in paths, split out so mapAuthError itself stays under
// the project's cyclomatic-complexity limit (docs/04-clean-code.md).
func mapSSOOrPasskeyError(err error) error {
	switch {
	case errors.Is(err, domain.ErrSSONotConfigured):
		return httpx.ErrSSONotConfigured
	case errors.Is(err, domain.ErrSSOAccountNotFound):
		return httpx.ErrSSOAccountNotFound
	case errors.Is(err, domain.ErrSSOInvalidToken):
		return httpx.ErrSSOInvalidToken
	case errors.Is(err, domain.ErrSSOClientSecretRequired):
		return httpx.ErrSSOClientSecretRequired
	case errors.Is(err, domain.ErrPasskeyNotConfigured):
		return httpx.ErrPasskeyNotConfigured
	case errors.Is(err, domain.ErrPasskeyNotFound):
		return httpx.ErrPasskeyNotFound
	case errors.Is(err, domain.ErrPasskeyChallenge):
		return httpx.ErrPasskeyChallenge
	case errors.Is(err, domain.ErrPasskeyInvalidResponse):
		return httpx.ErrPasskeyInvalidResponse
	default:
		return nil
	}
}

func toAPIRole(r domain.Role) api.Role {
	return api.Role{Id: r.ID, Slug: r.Slug, Name: r.Name, IsPrimary: r.IsPrimary}
}

func (h *Handler) toAPIMe(ctx context.Context, tenantID uuid.UUID, me service.MeResult) api.Me {
	roles := make([]api.Role, len(me.Roles))
	for i, r := range me.Roles {
		roles[i] = toAPIRole(r)
	}

	result := api.Me{
		Id:                 me.UserID,
		Username:           me.Username,
		Name:               me.Name,
		Roles:              roles,
		Permissions:        me.Permissions,
		MustChangePassword: me.MustChangePassword,
	}
	if me.Email != "" {
		email := me.Email
		result.Email = &email
	}
	if me.AvatarURL != "" {
		avatar := me.AvatarURL
		result.AvatarUrl = &avatar
	}
	if me.ProfileKind != "" {
		kind := api.MeProfileKind(me.ProfileKind)
		result.ProfileKind = &kind
		result.Detail = toAPIProfile(me.Detail)
	}

	if branded, err := h.branding.Branding(ctx, tenantID); err == nil {
		result.Tenant = branded
	}

	if me.ImpersonatedBy != nil {
		userID := me.ImpersonatedBy.UserID
		name := me.ImpersonatedBy.Name
		result.ImpersonatedBy = &struct {
			Name   *string    `json:"name,omitempty"`
			UserId *uuid.UUID `json:"user_id,omitempty"`
		}{Name: &name, UserId: &userID}
	}

	if me.ActiveAcademicYear != nil {
		result.ActiveAcademicYear = &struct {
			Id    uuid.UUID `json:"id"`
			Label string    `json:"label"`
		}{Id: me.ActiveAcademicYear.ID, Label: me.ActiveAcademicYear.Label}
	}

	if len(me.Duties) > 0 {
		duties := make([]struct {
			ScopeId    *uuid.UUID            `json:"scope_id,omitempty"`
			ScopeKind  api.MeDutiesScopeKind `json:"scope_kind"`
			ScopeLabel *string               `json:"scope_label,omitempty"`
			Slug       string                `json:"slug"`
		}, len(me.Duties))
		for i, d := range me.Duties {
			duties[i].Slug = d.Slug
			duties[i].ScopeKind = api.MeDutiesScopeKind(d.ScopeKind)
			if d.ScopeID.Valid {
				id := d.ScopeID.UUID
				duties[i].ScopeId = &id
			}
		}
		result.Duties = &duties
	}

	return result
}

func toClientKind(c api.ClientKind) domain.ClientKind {
	return domain.ClientKind(c)
}

func tenantIDFromContext(ctx context.Context) uuid.UUID {
	if t, ok := tenant.FromContext(ctx); ok {
		return t.ID
	}
	return uuid.UUID{}
}

func trimUserAgent(ua string) string {
	const maxLen = 255
	ua = strings.TrimSpace(ua)
	if len(ua) > maxLen {
		return ua[:maxLen]
	}
	return ua
}
