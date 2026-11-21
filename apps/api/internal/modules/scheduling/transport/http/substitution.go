package http

import (
	"context"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func (h *SchedulingHandler) ListSubstitutions(ctx context.Context, request api.ListSubstitutionsRequestObject) (api.ListSubstitutionsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	// The "all" (manage_schedules-only) scope is the admin's school-wide
	// view on the web substitutions page; like the two self scopes below,
	// each row carries the lesson it covers.
	if request.Params.Direction == api.ListSubstitutionsParamsDirectionAll {
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
		subs, err := h.service.ListSubstitutionsAll(ctx, tenantID, status)
		if err != nil {
			return nil, mapSubstitutionError(err)
		}
		data := make([]api.Substitution, len(subs))
		for i, s := range subs {
			data[i] = toAPISubstitutionWithSchedule(s.SubstitutionWithSchedule)
			if s.ReleaseFrom != nil {
				data[i].ReleaseFreesFrom = &openapi_types.Date{Time: *s.ReleaseFrom}
			}
		}
		return api.ListSubstitutions200JSONResponse{Data: data}, nil
	}

	var (
		subs []domain.SubstitutionWithSchedule
		err  error
	)
	if request.Params.Direction == api.ListSubstitutionsParamsDirectionOutgoing {
		subs, err = h.service.ListSubstitutionsOutgoingWithSchedule(ctx, tenantID, userID)
	} else {
		subs, err = h.service.ListSubstitutionsIncomingWithSchedule(ctx, tenantID, userID)
	}
	if err != nil {
		return nil, mapSubstitutionError(err)
	}

	data := make([]api.Substitution, len(subs))
	for i, s := range subs {
		data[i] = toAPISubstitutionWithSchedule(s)
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

// CancelSubstitution withdraws a request: the requester's own, or, for a
// schedule manager, anyone's (to release a lesson whose timetable change it
// holds back).
func (h *SchedulingHandler) CancelSubstitution(ctx context.Context, request api.CancelSubstitutionRequestObject) (api.CancelSubstitutionResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)
	actor, err := h.actorFor(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}

	updated, err := h.service.CancelSubstitution(ctx, tenantID, request.SubstitutionId, actor, h.publisher)
	if err != nil {
		return nil, mapSubstitutionError(err)
	}
	return api.CancelSubstitution200JSONResponse(toAPISubstitution(updated)), nil
}
