package http

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func (h *Handler) GetRoleTesting(ctx context.Context, request api.GetRoleTestingRequestObject) (api.GetRoleTestingResponseObject, error) {
	id := authz.IdentityFromContext(ctx)
	state := api.RoleTestingState{Roles: []struct {
		Name string `json:"name"`
		Slug string `json:"slug"`
	}{}, Users: []struct {
		Id       uuid.UUID `json:"id"`
		Name     string    `json:"name"`
		Username string    `json:"username"`
	}{}}
	if id.SessionID == uuid.Nil {
		return api.GetRoleTesting200JSONResponse(state), nil
	}
	proof, _ := httpx.RoleTestingCookieFromContext(ctx)
	childRefresh, _ := httpx.RefreshCookieFromContext(ctx)
	var cursor uuid.UUID
	if request.Params.Cursor != nil {
		cursor = *request.Params.Cursor
	}
	result, err := h.service.RoleTestingState(ctx, tenantIDFromContext(ctx), id.UserID, id.SessionID, id.ActorUserID, proof, childRefresh, strOf(request.Params.Role), strOf(request.Params.Q), cursor)
	if err != nil {
		return nil, mapAdminError(err)
	}
	state.Available, state.Active = result.Available, result.Active
	if result.Actor != nil {
		state.Actor = &struct {
			Id   uuid.UUID `json:"id"`
			Name string    `json:"name"`
		}{Id: result.Actor.UserID, Name: result.Actor.Name}
	}
	if !result.ExpiresAt.IsZero() {
		at := result.ExpiresAt
		state.ExpiresAt = &at
	}
	if result.SelectedRole != "" {
		selected := result.SelectedRole
		state.SelectedRoleSlug = &selected
	}
	for _, role := range result.Roles {
		state.Roles = append(state.Roles, struct {
			Name string `json:"name"`
			Slug string `json:"slug"`
		}{Name: role.Name, Slug: role.Slug})
	}
	for _, user := range result.Users {
		state.Users = append(state.Users, struct {
			Id       uuid.UUID `json:"id"`
			Name     string    `json:"name"`
			Username string    `json:"username"`
		}{Id: user.ID, Name: user.Name, Username: user.Username})
	}
	if result.NextCursor != uuid.Nil {
		next := result.NextCursor
		state.NextCursor = &next
	}
	return api.GetRoleTesting200JSONResponse(state), nil
}

func (h *Handler) StartRoleTesting(ctx context.Context, request api.StartRoleTestingRequestObject) (api.StartRoleTestingResponseObject, error) {
	if !httpx.OriginAllowed(httpx.RequestMetaFromContext(ctx).Origin, h.appOrigins) {
		return nil, httpx.ErrOriginNotAllowed
	}
	if request.Body == nil || request.Body.UserId == uuid.Nil || request.Body.Role == "" {
		return nil, httpx.ErrValidation
	}
	id := authz.IdentityFromContext(ctx)
	if !id.Authenticated || id.SessionID == uuid.Nil || id.TenantID == uuid.Nil {
		return nil, httpx.ErrTokenInvalid
	}
	refresh, ok := httpx.RefreshCookieFromContext(ctx)
	if !ok {
		return nil, httpx.ErrTokenInvalid
	}
	ip, userAgent := deviceInfoFromContext(ctx)
	var result service.RoleTestingStartResult
	var err error
	if id.ActorUserID.Valid {
		proof, hasProof := httpx.RoleTestingCookieFromContext(ctx)
		if !hasProof {
			return nil, httpx.ErrForbidden
		}
		result, err = h.service.SwitchRoleTesting(ctx, id.TenantID, id.SessionID, request.Body.UserId, proof, refresh, request.Body.Role, ip, userAgent)
	} else {
		if _, staleProof := httpx.RoleTestingCookieFromContext(ctx); staleProof {
			return nil, httpx.ErrForbidden
		}
		result, err = h.service.StartRoleTesting(ctx, id.TenantID, id.UserID, id.SessionID, request.Body.UserId, refresh, request.Body.Role, ip, userAgent)
	}
	if err != nil {
		return nil, mapRoleTestingError(err)
	}
	httpx.QueueRoleTestingCookie(ctx, httpx.RoleTestingCookie(result.Proof, result.Deadline, h.isProduction))
	cookie := httpx.RefreshCookie(result.Auth.RefreshToken, result.Auth.RefreshExpiresAt, h.isProduction)
	return api.StartRoleTesting200JSONResponse{Body: h.toAuthTokensForRefresh(ctx, id.TenantID, result.Auth, true), Headers: api.StartRoleTesting200ResponseHeaders{SetCookie: &cookie}}, nil
}

func (h *Handler) StopRoleTesting(ctx context.Context, _ api.StopRoleTestingRequestObject) (api.StopRoleTestingResponseObject, error) {
	if !httpx.OriginAllowed(httpx.RequestMetaFromContext(ctx).Origin, h.appOrigins) {
		return nil, httpx.ErrOriginNotAllowed
	}
	proof, hasProof := httpx.RoleTestingCookieFromContext(ctx)
	refresh, hasRefresh := httpx.RefreshCookieFromContext(ctx)
	if !hasProof || !hasRefresh {
		return nil, httpx.ErrTokenInvalid
	}
	tenantID := tenantIDFromContext(ctx)
	ip, userAgent := deviceInfoFromContext(ctx)
	result, err := h.service.RestoreRoleTesting(ctx, tenantID, proof, refresh, ip, userAgent)
	if err != nil {
		return nil, mapRoleTestingError(err)
	}
	httpx.QueueRoleTestingCookie(ctx, httpx.ExpiredRoleTestingCookie(h.isProduction))
	cookie := httpx.RefreshCookie(result.RefreshToken, result.RefreshExpiresAt, h.isProduction)
	return api.StopRoleTesting200JSONResponse{Body: h.toAuthTokensForRefresh(ctx, tenantID, result, true), Headers: api.StopRoleTesting200ResponseHeaders{SetCookie: &cookie}}, nil
}

func mapRoleTestingError(err error) error {
	if errors.Is(err, service.ErrRoleTestingUnavailable) {
		return httpx.ErrTokenInvalid
	}
	return mapAdminError(err)
}
