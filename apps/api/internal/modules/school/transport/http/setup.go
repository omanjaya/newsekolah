package http

import (
	"context"
	"errors"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// GetSetupChecklist drives the onboarding wizard's progress view.
func (h *TenantHandler) GetSetupChecklist(ctx context.Context, _ api.GetSetupChecklistRequestObject) (api.GetSetupChecklistResponseObject, error) {
	tenantID, _ := httpx.TenantIDFromContext(ctx)
	checklist, err := h.service.Setup(ctx, tenantID)
	if err != nil {
		return nil, mapSetupError(err)
	}
	steps := make([]api.SetupStep, len(checklist.Steps))
	for i, step := range checklist.Steps {
		steps[i] = api.SetupStep{Key: string(step.Key), Done: step.Done, Count: step.Count, Required: step.Required}
	}
	resp := api.GetSetupChecklist200JSONResponse{
		Steps: steps, RequiredDone: checklist.RequiredDone, RequiredTotal: checklist.RequiredTotal, ReadyToOperate: checklist.ReadyToOperate,
	}
	if checklist.ActiveYearLabel != "" {
		label := checklist.ActiveYearLabel
		resp.ActiveYearLabel = &label
	}
	return resp, nil
}

func (h *TenantHandler) UpdateSchoolProfile(ctx context.Context, request api.UpdateSchoolProfileRequestObject) (api.UpdateSchoolProfileResponseObject, error) {
	tenantID, _ := httpx.TenantIDFromContext(ctx)
	body := request.Body
	if err := h.service.UpdateProfile(ctx, tenantID, service.ProfileInput{
		Name: body.Name, EducationLevel: string(body.EducationLevel), Timezone: body.Timezone, Locale: string(body.Locale),
	}); err != nil {
		return nil, mapSetupError(err)
	}
	return api.UpdateSchoolProfile204Response{}, nil
}

func mapSetupError(err error) error {
	if errors.Is(err, domain.ErrInvalidProfile) {
		return httpx.ErrValidation
	}
	var appErr *httpx.Error
	if errors.As(err, &appErr) {
		return appErr
	}
	return httpx.Internal(err)
}
