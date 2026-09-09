package http

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func (h *Handler) Login(ctx context.Context, request api.LoginRequestObject) (api.LoginResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	body := request.Body

	deviceID, deviceName := "", ""
	if body.DeviceId != nil {
		deviceID = *body.DeviceId
	}
	if body.DeviceName != nil {
		deviceName = *body.DeviceName
	}
	ip, userAgent := deviceInfoFromContext(ctx)

	result, err := h.service.Login(ctx, service.LoginInput{
		TenantID:   tenantID,
		Username:   body.Username,
		Password:   body.Password,
		Client:     toClientKind(body.Client),
		DeviceID:   deviceID,
		DeviceName: deviceName,
		IP:         ip,
		UserAgent:  userAgent,
	})
	if err != nil {
		return nil, mapAuthError(err)
	}

	tokens := h.toAuthTokens(ctx, tenantID, result, body.Client)

	resp := api.Login200JSONResponse{Body: tokens}
	if body.Client == api.Web {
		cookie := httpx.RefreshCookie(result.RefreshToken, result.RefreshExpiresAt, h.isProduction)
		resp.Headers.SetCookie = &cookie
	}
	return resp, nil
}

func (h *Handler) RefreshToken(ctx context.Context, request api.RefreshTokenRequestObject) (api.RefreshTokenResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)

	// The contract takes no explicit client field here: a web client sends
	// the httpOnly cookie, a mobile client sends refresh_token in the body.
	// Which one arrived is what decides whether the response echoes the new
	// token in the body or only refreshes the cookie -- the rotated
	// session's own client kind (web/ios/android) comes from the session
	// row itself, not from this request.
	refreshToken, viaCookie := httpx.RefreshCookieFromContext(ctx)
	if !viaCookie {
		if request.Body == nil || request.Body.RefreshToken == nil || *request.Body.RefreshToken == "" {
			return nil, httpx.ErrTokenInvalid
		}
		refreshToken = *request.Body.RefreshToken
	}

	ip, userAgent := deviceInfoFromContext(ctx)
	result, err := h.service.Refresh(ctx, tenantID, refreshToken, ip, userAgent)
	if err != nil {
		return nil, mapAuthError(err)
	}

	tokens := h.toAuthTokensForRefresh(ctx, tenantID, result, viaCookie)

	resp := api.RefreshToken200JSONResponse{Body: tokens}
	if viaCookie {
		cookie := httpx.RefreshCookie(result.RefreshToken, result.RefreshExpiresAt, h.isProduction)
		resp.Headers.SetCookie = &cookie
	}
	return resp, nil
}

func (h *Handler) Logout(ctx context.Context, _ api.LogoutRequestObject) (api.LogoutResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	sessionID, ok := httpx.SessionIDFromContext(ctx)
	if !ok {
		return nil, httpx.ErrTokenInvalid
	}

	if err := h.service.Logout(ctx, tenantID, sessionID); err != nil {
		return nil, mapAuthError(err)
	}
	_ = h.sessionCache.Invalidate(ctx, sessionID)

	cookie := httpx.ExpiredRefreshCookie(h.isProduction)
	return api.Logout204Response{Headers: api.Logout204ResponseHeaders{SetCookie: &cookie}}, nil
}

func (h *Handler) ListSessions(ctx context.Context, _ api.ListSessionsRequestObject) (api.ListSessionsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)
	currentSessionID, _ := httpx.SessionIDFromContext(ctx)

	sessions, err := h.service.ListSessions(ctx, tenantID, userID)
	if err != nil {
		return nil, mapAuthError(err)
	}

	data := make([]api.Session, len(sessions))
	for i, s := range sessions {
		data[i] = api.Session{
			Id:         s.ID,
			Client:     api.ClientKind(s.Client),
			CreatedAt:  s.CreatedAt,
			LastSeenAt: s.LastSeenAt,
			IsCurrent:  s.ID == currentSessionID,
		}
		if s.DeviceName != "" {
			dn := s.DeviceName
			data[i].DeviceName = &dn
		}
		if s.IP != "" {
			ip := s.IP
			data[i].Ip = &ip
		}
		if s.UserAgent != "" {
			ua := s.UserAgent
			data[i].UserAgent = &ua
		}
	}

	return api.ListSessions200JSONResponse{Data: data}, nil
}

func (h *Handler) RevokeSession(ctx context.Context, request api.RevokeSessionRequestObject) (api.RevokeSessionResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	if err := h.service.RevokeSession(ctx, tenantID, userID, request.SessionId); err != nil {
		if errors.Is(err, domain.ErrSessionNotFound) {
			return nil, httpx.ErrNotFound
		}
		return nil, mapAuthError(err)
	}
	_ = h.sessionCache.Invalidate(ctx, request.SessionId)

	return api.RevokeSession204Response{}, nil
}

func (h *Handler) ChangePassword(ctx context.Context, request api.ChangePasswordRequestObject) (api.ChangePasswordResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)
	sessionID, _ := httpx.SessionIDFromContext(ctx)

	err := h.service.ChangePassword(ctx, tenantID, userID, sessionID, request.Body.CurrentPassword, request.Body.NewPassword)
	if err != nil {
		return nil, mapAuthError(err)
	}
	return api.ChangePassword204Response{}, nil
}

func (h *Handler) GetMe(ctx context.Context, _ api.GetMeRequestObject) (api.GetMeResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	var actorID uuid.NullUUID
	if id, ok := httpx.ActorIDFromContext(ctx); ok {
		actorID = uuid.NullUUID{UUID: id, Valid: true}
	}

	me, err := h.service.Me(ctx, tenantID, userID, actorID)
	if err != nil {
		return nil, mapAuthError(err)
	}
	return api.GetMe200JSONResponse(h.toAPIMe(ctx, tenantID, me)), nil
}

func (h *Handler) toAuthTokens(ctx context.Context, tenantID uuid.UUID, result service.AuthResult, client api.ClientKind) api.AuthTokens {
	return h.toAuthTokensForRefresh(ctx, tenantID, result, client == api.Web)
}

// toAuthTokensForRefresh builds the AuthTokens body, including the
// plaintext refresh token only when the client is not using the cookie
// (i.e. it is a mobile client), per the contract's login/refresh
// description.
func (h *Handler) toAuthTokensForRefresh(ctx context.Context, tenantID uuid.UUID, result service.AuthResult, webCookie bool) api.AuthTokens {
	tokens := api.AuthTokens{
		TokenType:       api.Bearer,
		AccessToken:     result.AccessToken,
		AccessExpiresAt: result.AccessExpiresAt,
		User:            h.toAPIMe(ctx, tenantID, result.Me),
	}
	if !webCookie {
		refreshToken := result.RefreshToken
		refreshExpiresAt := result.RefreshExpiresAt
		tokens.RefreshToken = &refreshToken
		tokens.RefreshExpiresAt = &refreshExpiresAt
	}
	return tokens
}
