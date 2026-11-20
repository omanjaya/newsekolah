package http

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func (h *Handler) ListUsers(ctx context.Context, request api.ListUsersRequestObject) (api.ListUsersResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	p := request.Params

	filter := service.ListUsersFilter{
		Search: strOf(p.Q), RoleSlug: strOf(p.Role), Limit: intOf(p.Limit),
		IncludeArchived: p.IncludeArchived != nil && *p.IncludeArchived,
	}
	if p.Status != nil {
		filter.Status = string(*p.Status)
	}
	if p.ProfileKind != nil {
		filter.ProfileKind = string(*p.ProfileKind)
	}
	if p.Cursor != nil {
		filter.Cursor = *p.Cursor
	}

	result, err := h.service.ListUsers(ctx, tenantID, filter)
	if err != nil {
		return nil, mapAdminError(err)
	}
	data := make([]api.AdminUser, len(result.Items))
	for i, u := range result.Items {
		data[i] = toAPIAdminUser(u)
	}
	resp := api.ListUsers200JSONResponse{Data: data}
	if result.NextCursor != uuid.Nil {
		next := result.NextCursor
		resp.NextCursor = &next
	}
	return resp, nil
}

func (h *Handler) CreateUser(ctx context.Context, request api.CreateUserRequestObject) (api.CreateUserResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	actorID, _ := httpx.UserIDFromContext(ctx)
	b := request.Body

	write := fromAPIUserWrite(api.UserWriteFields{
		Name: b.Name, Email: b.Email, Phone: b.Phone, Profile: b.Profile, ProfileKind: b.ProfileKind, Roles: b.Roles,
	})
	if b.Locale != nil {
		write.Locale = string(*b.Locale)
	}
	created, err := h.service.CreateUser(ctx, tenantID, actorID, service.CreateUserInput{
		UserWriteInput: write, Username: strOf(b.Username), Password: strOf(b.Password),
	})
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.CreateUser201JSONResponse(toAPIAdminUser(created)), nil
}

func (h *Handler) GetUser(ctx context.Context, request api.GetUserRequestObject) (api.GetUserResponseObject, error) {
	user, err := h.service.GetUser(ctx, tenantIDFromContext(ctx), request.UserId)
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.GetUser200JSONResponse(toAPIAdminUser(user)), nil
}

func (h *Handler) UpdateUser(ctx context.Context, request api.UpdateUserRequestObject) (api.UpdateUserResponseObject, error) {
	actorID, _ := httpx.UserIDFromContext(ctx)
	updated, err := h.service.UpdateUser(ctx, tenantIDFromContext(ctx), actorID, request.UserId, fromAPIUserWrite(*request.Body))
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.UpdateUser200JSONResponse(toAPIAdminUser(updated)), nil
}

func (h *Handler) ArchiveUser(ctx context.Context, request api.ArchiveUserRequestObject) (api.ArchiveUserResponseObject, error) {
	actorID, _ := httpx.UserIDFromContext(ctx)
	if err := h.service.ArchiveUser(ctx, tenantIDFromContext(ctx), actorID, request.UserId); err != nil {
		return nil, mapAdminError(err)
	}
	return api.ArchiveUser204Response{}, nil
}

func (h *Handler) RestoreUser(ctx context.Context, request api.RestoreUserRequestObject) (api.RestoreUserResponseObject, error) {
	if err := h.service.RestoreUser(ctx, tenantIDFromContext(ctx), request.UserId); err != nil {
		return nil, mapAdminError(err)
	}
	return api.RestoreUser204Response{}, nil
}

func (h *Handler) AdminResetPassword(ctx context.Context, request api.AdminResetPasswordRequestObject) (api.AdminResetPasswordResponseObject, error) {
	token, err := h.service.ResetPasswordByAdmin(ctx, tenantIDFromContext(ctx), request.UserId)
	if err != nil {
		return nil, mapAdminError(err)
	}
	ttl := int(service.PasswordResetTTL.Seconds())
	return api.AdminResetPassword200JSONResponse{SetPasswordToken: token, ExpiresInSeconds: &ttl}, nil
}

func (h *Handler) ImpersonateUser(ctx context.Context, request api.ImpersonateUserRequestObject) (api.ImpersonateUserResponseObject, error) {
	// A caller whose own request context already carries an actor is
	// currently impersonating someone; nested impersonation would let an
	// admin's audit trail read as "the impersonated user started this",
	// losing who the real actor is (docs/analysis/backend-inventory.md
	// section 1.2).
	if _, alreadyImpersonating := httpx.ActorIDFromContext(ctx); alreadyImpersonating {
		return nil, httpx.ErrImpersonationNested
	}

	tenantID := tenantIDFromContext(ctx)
	actorID, _ := httpx.UserIDFromContext(ctx)
	client := api.Web
	if request.Body != nil && request.Body.Client != nil {
		client = *request.Body.Client
	}
	ip, userAgent := deviceInfoFromContext(ctx)

	if client == api.Web {
		if resp, ok, err := h.impersonateWithReturn(ctx, tenantID, actorID, request.UserId, ip, userAgent); ok || err != nil {
			return resp, err
		}
	}

	result, err := h.service.StartImpersonation(ctx, tenantID, actorID, request.UserId, toClientKind(client), ip, userAgent)
	if err != nil {
		return nil, mapAdminError(err)
	}
	tokens := h.toAuthTokens(ctx, tenantID, result, client)
	resp := api.ImpersonateUser200JSONResponse{Body: tokens}
	if client == api.Web {
		cookie := httpx.RefreshCookie(result.RefreshToken, result.RefreshExpiresAt, h.isProduction)
		resp.Headers.SetCookie = &cookie
	}
	return resp, nil
}

// impersonateWithReturn starts a web impersonation that parks the admin's
// own login in the continuation cookie (service.StartImpersonationWithReturn),
// so a reload keeps the impersonation and stopping it restores the admin.
// ok is false, with no error, when there is no continuation to build (no
// refresh cookie, an origin outside the app, no sealer configured, or a
// refresh cookie that is not this session's): the caller then starts the
// plain impersonation as before.
func (h *Handler) impersonateWithReturn(ctx context.Context, tenantID, actorID, targetID uuid.UUID, ip, userAgent string) (api.ImpersonateUserResponseObject, bool, error) {
	refresh, hasRefresh := httpx.RefreshCookieFromContext(ctx)
	sessionID, hasSession := httpx.SessionIDFromContext(ctx)
	if !hasRefresh || !hasSession || !httpx.OriginAllowed(httpx.RequestMetaFromContext(ctx).Origin, h.appOrigins) {
		return nil, false, nil
	}
	started, err := h.service.StartImpersonationWithReturn(ctx, tenantID, actorID, sessionID, targetID, refresh, ip, userAgent)
	if errors.Is(err, service.ErrRoleTestingUnavailable) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, mapAdminError(err)
	}
	httpx.QueueRoleTestingCookie(ctx, httpx.RoleTestingCookie(started.Proof, started.Deadline, h.isProduction))
	cookie := httpx.RefreshCookie(started.Auth.RefreshToken, started.Auth.RefreshExpiresAt, h.isProduction)
	resp := api.ImpersonateUser200JSONResponse{Body: h.toAuthTokens(ctx, tenantID, started.Auth, api.Web)}
	resp.Headers.SetCookie = &cookie
	return resp, true, nil
}

func (h *Handler) StopImpersonation(ctx context.Context, _ api.StopImpersonationRequestObject) (api.StopImpersonationResponseObject, error) {
	sessionID, ok := httpx.SessionIDFromContext(ctx)
	if !ok {
		return nil, httpx.ErrNotImpersonating
	}
	tenantID := tenantIDFromContext(ctx)
	if resp, ok := h.stopImpersonationWithReturn(ctx, tenantID, sessionID); ok {
		return resp, nil
	}
	if _, hasProof := httpx.RoleTestingCookieFromContext(ctx); hasProof {
		// A continuation that can no longer restore anything goes too.
		httpx.QueueRoleTestingCookie(ctx, httpx.ExpiredRoleTestingCookie(h.isProduction))
	}
	if err := h.service.StopImpersonation(ctx, tenantID, sessionID); err != nil {
		return nil, mapAdminError(err)
	}
	_ = h.sessionCache.Invalidate(ctx, tenantID, sessionID)
	return api.StopImpersonation204Response{}, nil
}

// stopImpersonationWithReturn ends a web impersonation whose continuation
// names this session and hands the admin their own session back
// (service.RestoreRoleTesting). ok is false when there is no such
// continuation; the caller then only revokes the impersonation.
func (h *Handler) stopImpersonationWithReturn(ctx context.Context, tenantID, sessionID uuid.UUID) (api.StopImpersonationResponseObject, bool) {
	rawProof, hasProof := httpx.RoleTestingCookieFromContext(ctx)
	refresh, hasRefresh := httpx.RefreshCookieFromContext(ctx)
	if !hasProof || !hasRefresh {
		return nil, false
	}
	proof, err := h.service.DecodeRoleTestingProof(rawProof)
	if err != nil || !proof.Impersonation || proof.ChildSessionID != sessionID {
		return nil, false
	}
	ip, userAgent := deviceInfoFromContext(ctx)
	restored, err := h.service.RestoreRoleTesting(ctx, tenantID, rawProof, refresh, ip, userAgent)
	if err != nil {
		return nil, false
	}
	_ = h.sessionCache.Invalidate(ctx, tenantID, sessionID)
	httpx.QueueRoleTestingCookie(ctx, httpx.ExpiredRoleTestingCookie(h.isProduction))
	cookie := httpx.RefreshCookie(restored.RefreshToken, restored.RefreshExpiresAt, h.isProduction)
	return api.StopImpersonation200JSONResponse{
		Body:    h.toAuthTokensForRefresh(ctx, tenantID, restored, true),
		Headers: api.StopImpersonation200ResponseHeaders{SetCookie: &cookie},
	}, true
}

func (h *Handler) RequestPasswordReset(ctx context.Context, request api.RequestPasswordResetRequestObject) (api.RequestPasswordResetResponseObject, error) {
	ip, _ := deviceInfoFromContext(ctx)
	if err := h.service.RequestPasswordReset(ctx, tenantIDFromContext(ctx), request.Body.UsernameOrEmail, ip); err != nil {
		if mapped := mapAdminError(err); mapped == httpx.ErrRateLimited {
			return nil, mapped
		}
		// Any other failure is deliberately hidden: the response must not reveal
		// whether the account exists.
	}
	return api.RequestPasswordReset202Response{}, nil
}

func (h *Handler) ConfirmPasswordReset(ctx context.Context, request api.ConfirmPasswordResetRequestObject) (api.ConfirmPasswordResetResponseObject, error) {
	if err := h.service.ConfirmPasswordReset(ctx, tenantIDFromContext(ctx), request.Body.Token, request.Body.NewPassword); err != nil {
		return nil, mapAdminError(err)
	}
	return api.ConfirmPasswordReset204Response{}, nil
}
