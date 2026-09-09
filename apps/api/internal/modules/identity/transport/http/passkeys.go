package http

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// BeginPasskeyRegistration starts a registration ceremony for the caller's
// own account.
func (h *Handler) BeginPasskeyRegistration(ctx context.Context, _ api.BeginPasskeyRegistrationRequestObject) (api.BeginPasskeyRegistrationResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	me, err := h.service.Me(ctx, tenantID, userID, uuid.NullUUID{})
	if err != nil {
		return nil, mapAuthError(err)
	}

	creation, ceremonyID, err := h.service.BeginPasskeyRegistration(ctx, tenantID, userID, me.Username, me.Name)
	if err != nil {
		return nil, mapAuthError(err)
	}

	publicKey, err := toPublicKeyMap(creation)
	if err != nil {
		return nil, httpx.Internal(err)
	}
	return api.BeginPasskeyRegistration200JSONResponse{CeremonyId: ceremonyID, PublicKey: publicKey}, nil
}

// FinishPasskeyRegistration verifies the browser's response and stores the
// new passkey.
func (h *Handler) FinishPasskeyRegistration(ctx context.Context, request api.FinishPasskeyRegistrationRequestObject) (api.FinishPasskeyRegistrationResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)
	body := request.Body

	rawResponse, err := json.Marshal(body.Credential)
	if err != nil {
		return nil, httpx.ErrValidation
	}

	cred, err := h.service.FinishPasskeyRegistration(ctx, tenantID, userID, body.CeremonyId, rawResponse, body.Name)
	if err != nil {
		return nil, mapAuthError(err)
	}
	return api.FinishPasskeyRegistration201JSONResponse(toAPIPasskey(cred)), nil
}

// ListPasskeys returns the caller's own registered passkeys.
func (h *Handler) ListPasskeys(ctx context.Context, _ api.ListPasskeysRequestObject) (api.ListPasskeysResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	creds, err := h.service.ListPasskeys(ctx, tenantID, userID)
	if err != nil {
		return nil, mapAuthError(err)
	}
	data := make([]api.Passkey, len(creds))
	for i, c := range creds {
		data[i] = toAPIPasskey(c)
	}
	return api.ListPasskeys200JSONResponse{Data: data}, nil
}

// RenamePasskey renames one of the caller's own passkeys.
func (h *Handler) RenamePasskey(ctx context.Context, request api.RenamePasskeyRequestObject) (api.RenamePasskeyResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	cred, err := h.service.RenamePasskey(ctx, tenantID, userID, request.PasskeyId, request.Body.Name)
	if err != nil {
		return nil, mapAuthError(err)
	}
	return api.RenamePasskey200JSONResponse(toAPIPasskey(cred)), nil
}

// DeletePasskey removes one of the caller's own passkeys.
func (h *Handler) DeletePasskey(ctx context.Context, request api.DeletePasskeyRequestObject) (api.DeletePasskeyResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	if err := h.service.DeletePasskey(ctx, tenantID, userID, request.PasskeyId); err != nil {
		return nil, mapAuthError(err)
	}
	return api.DeletePasskey204Response{}, nil
}

// BeginPasskeyLogin starts a login ceremony for the named account. There
// is no session yet, so the tenant comes from the request context the
// same way it does for password login.
func (h *Handler) BeginPasskeyLogin(ctx context.Context, request api.BeginPasskeyLoginRequestObject) (api.BeginPasskeyLoginResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)

	assertion, ceremonyID, err := h.service.BeginPasskeyLogin(ctx, service.PasskeyLoginInput{
		TenantID: tenantID,
		Username: request.Body.Username,
	})
	if err != nil {
		return nil, mapAuthError(err)
	}

	publicKey, err := toPublicKeyMap(assertion)
	if err != nil {
		return nil, httpx.Internal(err)
	}
	return api.BeginPasskeyLogin200JSONResponse{CeremonyId: ceremonyID, PublicKey: publicKey}, nil
}

// FinishPasskeyLogin completes the login ceremony and opens a session.
func (h *Handler) FinishPasskeyLogin(ctx context.Context, request api.FinishPasskeyLoginRequestObject) (api.FinishPasskeyLoginResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	body := request.Body
	ip, userAgent := deviceInfoFromContext(ctx)

	rawResponse, err := json.Marshal(body.Credential)
	if err != nil {
		return nil, httpx.ErrValidation
	}

	result, err := h.service.FinishPasskeyLogin(ctx, service.FinishPasskeyLoginInput{
		TenantID:    tenantID,
		CeremonyID:  body.CeremonyId,
		RawResponse: rawResponse,
		Client:      toClientKind(body.Client),
		DeviceID:    strOf(body.DeviceId),
		DeviceName:  strOf(body.DeviceName),
		IP:          ip,
		UserAgent:   userAgent,
	})
	if err != nil {
		return nil, mapAuthError(err)
	}

	tokens := h.toAuthTokens(ctx, tenantID, result, body.Client)
	resp := api.FinishPasskeyLogin200JSONResponse{Body: tokens}
	if body.Client == api.Web {
		cookie := httpx.RefreshCookie(result.RefreshToken, result.RefreshExpiresAt, h.isProduction)
		resp.Headers.SetCookie = &cookie
	}
	return resp, nil
}

func toAPIPasskey(c service.WebAuthnCredential) api.Passkey {
	out := api.Passkey{Id: c.ID, Name: c.Name, CreatedAt: c.CreatedAt}
	if c.LastUsedAt != nil {
		out.LastUsedAt = c.LastUsedAt
	}
	return out
}

// toPublicKeyMap round-trips the WebAuthn library's options struct through
// JSON into the map[string]interface{} the generated PasskeyCeremony
// schema expects, so the browser gets exactly the JSON shape
// PublicKeyCredential.parseCreationOptionsFromJSON()/parseRequestOptionsFromJSON()
// is built to consume.
func toPublicKeyMap(v any) (map[string]interface{}, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	var wrapper struct {
		PublicKey map[string]interface{} `json:"publicKey"`
	}
	if err := json.Unmarshal(raw, &wrapper); err != nil {
		return nil, err
	}
	return wrapper.PublicKey, nil
}
