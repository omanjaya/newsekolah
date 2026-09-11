package http

import (
	"context"

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

func (h *Handler) StopImpersonation(ctx context.Context, _ api.StopImpersonationRequestObject) (api.StopImpersonationResponseObject, error) {
	sessionID, ok := httpx.SessionIDFromContext(ctx)
	if !ok {
		return nil, httpx.ErrNotImpersonating
	}
	if err := h.service.StopImpersonation(ctx, tenantIDFromContext(ctx), sessionID); err != nil {
		return nil, mapAdminError(err)
	}
	_ = h.sessionCache.Invalidate(ctx, sessionID)
	return api.StopImpersonation204Response{}, nil
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
