package http

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func userIDFromContext(ctx context.Context) uuid.UUID {
	id, _ := httpx.UserIDFromContext(ctx)
	return id
}

// Two-factor is per-user, so every handler here acts on the caller.

func (h *Handler) GetMfaStatus(ctx context.Context, _ api.GetMfaStatusRequestObject) (api.GetMfaStatusResponseObject, error) {
	enrolled, confirmed, remaining, err := h.service.TOTPStatus(ctx, tenantIDFromContext(ctx), userIDFromContext(ctx))
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.GetMfaStatus200JSONResponse{Enrolled: enrolled, Confirmed: confirmed, RemainingRecoveryCodes: remaining}, nil
}

func (h *Handler) StartMfaEnrolment(ctx context.Context, _ api.StartMfaEnrolmentRequestObject) (api.StartMfaEnrolmentResponseObject, error) {
	tenantID, userID := tenantIDFromContext(ctx), userIDFromContext(ctx)
	me, err := h.service.GetUser(ctx, tenantID, userID)
	if err != nil {
		return nil, mapAdminError(err)
	}
	enrolment, err := h.service.StartTOTPEnrolment(ctx, tenantID, userID, me.Username)
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.StartMfaEnrolment201JSONResponse{Secret: enrolment.Secret, OtpauthUrl: enrolment.OTPAuthURL, RecoveryCodes: enrolment.RecoveryCodes}, nil
}

func (h *Handler) ConfirmMfaEnrolment(ctx context.Context, request api.ConfirmMfaEnrolmentRequestObject) (api.ConfirmMfaEnrolmentResponseObject, error) {
	if err := h.service.ConfirmTOTPEnrolment(ctx, tenantIDFromContext(ctx), userIDFromContext(ctx), request.Body.Code); err != nil {
		return nil, mapAdminError(err)
	}
	return api.ConfirmMfaEnrolment204Response{}, nil
}

func (h *Handler) DisableMfa(ctx context.Context, request api.DisableMfaRequestObject) (api.DisableMfaResponseObject, error) {
	if err := h.service.DisableTOTP(ctx, tenantIDFromContext(ctx), userIDFromContext(ctx), request.Body.Code); err != nil {
		return nil, mapAdminError(err)
	}
	return api.DisableMfa204Response{}, nil
}

func (h *Handler) RegenerateMfaRecoveryCodes(ctx context.Context, request api.RegenerateMfaRecoveryCodesRequestObject) (api.RegenerateMfaRecoveryCodesResponseObject, error) {
	codes, err := h.service.RegenerateRecoveryCodes(ctx, tenantIDFromContext(ctx), userIDFromContext(ctx), request.Body.Code)
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.RegenerateMfaRecoveryCodes200JSONResponse{RecoveryCodes: codes}, nil
}
