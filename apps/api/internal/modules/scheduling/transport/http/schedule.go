package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// toDayOfWeek narrows the wire int to the domain's int16 only after
// bounds-checking it against the schema's own 1..7 range: the OpenAPI
// minimum/maximum in scheduling.yaml is not enforced by any request
// validation middleware (see cmd/api/wire.go), so an out-of-range or
// otherwise oversized value must be rejected here rather than silently
// truncated by the int->int16 conversion.
func toDayOfWeek(v int) (int16, error) {
	if v < 1 || v > 7 {
		return 0, httpx.ErrValidation.WithDetails(httpx.ErrorDetail{Field: "day_of_week", Code: "OUT_OF_RANGE"})
	}
	return int16(v), nil
}

func toScheduleInput(body api.ScheduleWriteRequest) (service.ScheduleInput, error) {
	dayOfWeek, err := toDayOfWeek(body.DayOfWeek)
	if err != nil {
		return service.ScheduleInput{}, err
	}

	in := service.ScheduleInput{
		AcademicYearID: body.AcademicYearId,
		TermID:         ptrNullUUID(body.TermId),
		ClassID:        body.ClassId,
		SubjectID:      body.SubjectId,
		TeacherUserID:  body.TeacherUserId,
		RoomID:         ptrNullUUID(body.RoomId),
		DayOfWeek:      dayOfWeek,
		StartPeriodID:  body.StartPeriodId,
		EndPeriodID:    body.EndPeriodId,
	}
	if body.Source != nil {
		in.Source = domain.Source(*body.Source)
	}
	if body.Notes != nil {
		in.Notes = *body.Notes
	}
	return in, nil
}

func (h *SchedulingHandler) ListSchedules(ctx context.Context, request api.ListSchedulesRequestObject) (api.ListSchedulesResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	params := request.Params

	var blocks []domain.Block
	var err error
	switch {
	case params.ClassId != nil:
		blocks, err = h.service.ListByClass(ctx, tenantID, params.AcademicYearId, *params.ClassId)
	case params.TeacherUserId != nil:
		blocks, err = h.service.ListByTeacher(ctx, tenantID, params.AcademicYearId, *params.TeacherUserId)
	case params.DayOfWeek != nil:
		day, dayErr := toDayOfWeek(*params.DayOfWeek)
		if dayErr != nil {
			return nil, dayErr
		}
		blocks, err = h.service.ListByDay(ctx, tenantID, params.AcademicYearId, day)
	default:
		return nil, httpx.ErrValidation.WithDetails(httpx.ErrorDetail{Field: "class_id", Code: "REQUIRED"})
	}
	if err != nil {
		return nil, mapScheduleError(err)
	}

	data := make([]api.ScheduleBlock, len(blocks))
	for i, b := range blocks {
		data[i] = toAPIBlock(b)
	}
	return api.ListSchedules200JSONResponse{Data: data}, nil
}

func (h *SchedulingHandler) CreateSchedule(ctx context.Context, request api.CreateScheduleRequestObject) (api.CreateScheduleResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	actor, err := h.actorFor(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}

	in, err := toScheduleInput(*request.Body)
	if err != nil {
		return nil, err
	}
	created, err := h.service.CreateSchedule(ctx, tenantID, in, actor)
	if err != nil {
		return nil, mapScheduleError(err)
	}

	policy := h.service.MutationPolicyFor(ctx, tenantID, created, actor)
	return api.CreateSchedule201JSONResponse(toAPISchedule(created, &policy)), nil
}

func (h *SchedulingHandler) BulkImportSchedules(ctx context.Context, request api.BulkImportSchedulesRequestObject) (api.BulkImportSchedulesResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)

	inputs := make([]service.ScheduleInput, len(request.Body.Schedules))
	for i, s := range request.Body.Schedules {
		in, err := toScheduleInput(s)
		if err != nil {
			return nil, err
		}
		inputs[i] = in
	}

	created, err := h.service.BulkImport(ctx, tenantID, inputs)
	if err != nil {
		return nil, mapScheduleError(err)
	}

	data := make([]api.Schedule, len(created))
	for i, s := range created {
		data[i] = toAPISchedule(s, nil)
	}
	return api.BulkImportSchedules201JSONResponse{Data: data}, nil
}

func (h *SchedulingHandler) ClearSchedules(ctx context.Context, request api.ClearSchedulesRequestObject) (api.ClearSchedulesResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	if err := h.service.ClearAcademicYear(ctx, tenantID, request.Body.AcademicYearId); err != nil {
		return nil, mapScheduleError(err)
	}
	return api.ClearSchedules204Response{}, nil
}

func (h *SchedulingHandler) GetSchedule(ctx context.Context, request api.GetScheduleRequestObject) (api.GetScheduleResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	sched, err := h.service.GetSchedule(ctx, tenantID, request.ScheduleId)
	if err != nil {
		return nil, mapScheduleError(err)
	}

	actor, err := h.actorFor(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}
	policy := h.service.MutationPolicyFor(ctx, tenantID, sched, actor)
	return api.GetSchedule200JSONResponse(toAPISchedule(sched, &policy)), nil
}

func (h *SchedulingHandler) UpdateSchedule(ctx context.Context, request api.UpdateScheduleRequestObject) (api.UpdateScheduleResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	actor, err := h.actorFor(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}

	in, err := toScheduleInput(*request.Body)
	if err != nil {
		return nil, err
	}
	updated, err := h.service.UpdateSchedule(ctx, tenantID, request.ScheduleId, in, actor)
	if err != nil {
		return nil, mapScheduleError(err)
	}

	policy := h.service.MutationPolicyFor(ctx, tenantID, updated, actor)
	return api.UpdateSchedule200JSONResponse(toAPISchedule(updated, &policy)), nil
}

func (h *SchedulingHandler) DeleteSchedule(ctx context.Context, request api.DeleteScheduleRequestObject) (api.DeleteScheduleResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	actor, err := h.actorFor(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}

	if err := h.service.DeleteSchedule(ctx, tenantID, request.ScheduleId, actor); err != nil {
		return nil, mapScheduleError(err)
	}
	return api.DeleteSchedule204Response{}, nil
}
