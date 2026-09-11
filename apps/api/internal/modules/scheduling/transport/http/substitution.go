package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func (h *SchedulingHandler) ListSubstitutions(ctx context.Context, request api.ListSubstitutionsRequestObject) (api.ListSubstitutionsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	var (
		subs []domain.Substitution
		err  error
	)
	switch request.Params.Direction {
	case api.ListSubstitutionsParamsDirectionAll:
		actor, aerr := h.actorFor(ctx, tenantID, userID)
		if aerr != nil {
			return nil, aerr
		}
		if !actor.CanManage {
			return nil, httpx.ErrForbidden
		}
		var status *domain.SubstitutionStatus
		if request.Params.Status != nil {
			s := domain.SubstitutionStatus(*request.Params.Status)
			status = &s
		}
		subs, err = h.service.ListSubstitutionsAll(ctx, tenantID, status)
	case api.ListSubstitutionsParamsDirectionOutgoing:
		subs, err = h.service.ListSubstitutionsOutgoing(ctx, tenantID, userID)
	default:
		subs, err = h.service.ListSubstitutionsIncoming(ctx, tenantID, userID)
	}
	if err != nil {
		return nil, mapSubstitutionError(err)
	}

	data := make([]api.Substitution, len(subs))
	for i, s := range subs {
		data[i] = toAPISubstitution(s)
	}
	return api.ListSubstitutions200JSONResponse{Data: data}, nil
}

func (h *SchedulingHandler) ListEligibleSubstitutes(ctx context.Context, request api.ListEligibleSubstitutesRequestObject) (api.ListEligibleSubstitutesResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)
	params := request.Params

	search := ""
	if params.Search != nil {
		search = *params.Search
	}
	limit, offset := 0, 0
	if params.Limit != nil {
		limit = *params.Limit
	}
	if params.Offset != nil {
		offset = *params.Offset
	}

	candidates, err := h.service.ListEligibleSubstitutes(ctx, tenantID, params.AcademicYearId, userID, search, limit, offset)
	if err != nil {
		return nil, mapSubstitutionError(err)
	}

	data := make([]api.SubstituteCandidate, len(candidates))
	for i, c := range candidates {
		data[i] = api.SubstituteCandidate{UserId: c.UserID, Name: c.Name}
	}
	return api.ListEligibleSubstitutes200JSONResponse{Data: data}, nil
}

func (h *SchedulingHandler) CreateSubstitution(ctx context.Context, request api.CreateSubstitutionRequestObject) (api.CreateSubstitutionResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)
	body := request.Body

	note := ""
	if body.Note != nil {
		note = *body.Note
	}

	created, err := h.service.RequestSubstitution(
		ctx, tenantID, body.ScheduleId, body.Date.Time, userID, body.SubstituteUserId, note, h.publisher,
	)
	if err != nil {
		return nil, mapSubstitutionError(err)
	}
	return api.CreateSubstitution201JSONResponse(toAPISubstitution(created)), nil
}

func (h *SchedulingHandler) RespondSubstitution(ctx context.Context, request api.RespondSubstitutionRequestObject) (api.RespondSubstitutionResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)
	body := request.Body

	note := ""
	if body.Note != nil {
		note = *body.Note
	}

	updated, err := h.service.RespondSubstitution(ctx, tenantID, request.SubstitutionId, userID, body.Accept, note, h.publisher)
	if err != nil {
		return nil, mapSubstitutionError(err)
	}
	return api.RespondSubstitution200JSONResponse(toAPISubstitution(updated)), nil
}

func (h *SchedulingHandler) CancelSubstitution(ctx context.Context, request api.CancelSubstitutionRequestObject) (api.CancelSubstitutionResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	updated, err := h.service.CancelSubstitution(ctx, tenantID, request.SubstitutionId, userID)
	if err != nil {
		return nil, mapSubstitutionError(err)
	}
	return api.CancelSubstitution200JSONResponse(toAPISubstitution(updated)), nil
}
