package http

import (
	"context"
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

func toActivityInput(b api.ActivityEventWrite) service.ActivityInput {
	return service.ActivityInput{
		Name: b.Name, Description: strOr(b.Description), Location: strOr(b.Location),
		StartDate: b.StartDate.Time, EndDate: b.EndDate.Time, OrganiserID: nullUUID(b.OrganiserUserId),
	}
}

func (h *ActivitiesHandler) ListActivityEvents(ctx context.Context, request api.ListActivityEventsRequestObject) (api.ListActivityEventsResponseObject, error) {
	var from, to *time.Time
	if request.Params.From != nil {
		from = &request.Params.From.Time
	}
	if request.Params.To != nil {
		to = &request.Params.To.Time
	}
	events, err := h.service.ListActivities(ctx, tenantID(ctx), from, to)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.ActivityEvent, len(events))
	for i, a := range events {
		data[i] = toAPIActivity(a)
	}
	return api.ListActivityEvents200JSONResponse{Data: data}, nil
}

func (h *ActivitiesHandler) CreateActivityEvent(ctx context.Context, request api.CreateActivityEventRequestObject) (api.CreateActivityEventResponseObject, error) {
	activity, err := h.service.CreateActivity(ctx, tenantID(ctx), toActivityInput(*request.Body))
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateActivityEvent201JSONResponse(toAPIActivity(activity)), nil
}

func (h *ActivitiesHandler) GetActivityEvent(ctx context.Context, request api.GetActivityEventRequestObject) (api.GetActivityEventResponseObject, error) {
	activity, err := h.service.GetActivity(ctx, tenantID(ctx), request.ActivityId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetActivityEvent200JSONResponse(toAPIActivity(activity)), nil
}

func (h *ActivitiesHandler) UpdateActivityEvent(ctx context.Context, request api.UpdateActivityEventRequestObject) (api.UpdateActivityEventResponseObject, error) {
	activity, err := h.service.UpdateActivity(ctx, tenantID(ctx), request.ActivityId, toActivityInput(*request.Body))
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateActivityEvent200JSONResponse(toAPIActivity(activity)), nil
}

func (h *ActivitiesHandler) DeleteActivityEvent(ctx context.Context, request api.DeleteActivityEventRequestObject) (api.DeleteActivityEventResponseObject, error) {
	if err := h.service.DeleteActivity(ctx, tenantID(ctx), request.ActivityId); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteActivityEvent204Response{}, nil
}

func (h *ActivitiesHandler) AddActivityParticipant(ctx context.Context, request api.AddActivityParticipantRequestObject) (api.AddActivityParticipantResponseObject, error) {
	b := request.Body
	p := domain.Participant{ClassID: nullUUID(b.ClassId), GradeLevelID: nullUUID(b.GradeLevelId), StudentID: nullUUID(b.StudentUserId)}
	added, err := h.service.AddParticipant(ctx, tenantID(ctx), request.ActivityId, p)
	if err != nil {
		return nil, mapError(err)
	}
	return api.AddActivityParticipant201JSONResponse(toAPIParticipant(added)), nil
}

func (h *ActivitiesHandler) RemoveActivityParticipant(ctx context.Context, request api.RemoveActivityParticipantRequestObject) (api.RemoveActivityParticipantResponseObject, error) {
	if err := h.service.RemoveParticipant(ctx, tenantID(ctx), request.ParticipantId); err != nil {
		return nil, mapError(err)
	}
	return api.RemoveActivityParticipant204Response{}, nil
}

// ListMyActivityEvents is the signed-in student's own upcoming and ongoing
// activities, measured against today in the school's time zone.
func (h *ActivitiesHandler) ListMyActivityEvents(ctx context.Context, _ api.ListMyActivityEventsRequestObject) (api.ListMyActivityEventsResponseObject, error) {
	events, err := h.service.ListMyActivities(ctx, tenantID(ctx), userID(ctx), tenantLocation(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.ActivityEvent, len(events))
	for i, a := range events {
		data[i] = toAPIActivity(a)
	}
	return api.ListMyActivityEvents200JSONResponse{Data: data}, nil
}

// tenantLocation is the request tenant's configured time zone, UTC when it
// is unset or unknown.
func tenantLocation(ctx context.Context) *time.Location {
	t, ok := tenant.FromContext(ctx)
	if !ok || t.Timezone == "" {
		return time.UTC
	}
	loc, err := time.LoadLocation(t.Timezone)
	if err != nil {
		return time.UTC
	}
	return loc
}
