package http

import (
	"context"
	"errors"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func mapScheduleError(err error) error {
	switch {
	case errors.Is(err, domain.ErrScheduleNotFound):
		return httpx.ErrNotFound
	case errors.Is(err, domain.ErrReportKindNotAllowed):
		return httpx.ErrForbidden
	case errors.Is(err, domain.ErrReportKindNotFound),
		errors.Is(err, domain.ErrInvalidCadence),
		errors.Is(err, domain.ErrInvalidFormat),
		errors.Is(err, domain.ErrInvalidHour),
		errors.Is(err, domain.ErrInvalidWeekday),
		errors.Is(err, domain.ErrInvalidDayOfMonth),
		errors.Is(err, domain.ErrNoRecipients),
		errors.Is(err, domain.ErrTooManyRecipients),
		errors.Is(err, domain.ErrDuplicateRecipient),
		errors.Is(err, domain.ErrRecipientNotTenantUser):
		return httpx.ErrValidation
	}
	var appErr *httpx.Error
	if errors.As(err, &appErr) {
		return appErr
	}
	return httpx.Internal(err)
}

func toAPISchedule(v service.ScheduleView) api.ReportSchedule {
	format := api.ReportScheduleFormat(v.Format.WithDefault())
	return api.ReportSchedule{
		Id:         v.ID,
		ReportKind: v.ReportKind,
		Params:     toAPIParams(v.Params),
		Cadence:    api.ReportScheduleCadence(v.Cadence),
		Format:     &format,
		Weekday:    v.Weekday,
		DayOfMonth: v.DayOfMonth,
		Hour:       v.Hour,
		Recipients: toAPIEmails(v.Recipients),
		Enabled:    v.Enabled,
		NextRunAt:  v.NextRunAt,
		CreatedBy:  v.CreatedBy,
		CreatedAt:  v.CreatedAt,
		UpdatedAt:  v.UpdatedAt,
	}
}

func toAPIParams(p domain.Params) *api.ReportScheduleParams {
	out := &api.ReportScheduleParams{}
	if p.ClassID.Valid {
		id := p.ClassID.UUID
		out.ClassId = &id
	}
	if p.SubjectID.Valid {
		id := p.SubjectID.UUID
		out.SubjectId = &id
	}
	if p.TermID.Valid {
		id := p.TermID.UUID
		out.TermId = &id
	}
	return out
}

func toAPIEmails(recipients []string) []openapi_types.Email {
	out := make([]openapi_types.Email, len(recipients))
	for i, r := range recipients {
		out[i] = openapi_types.Email(r)
	}
	return out
}

func fromDomainParams(p *api.ReportScheduleParams) domain.Params {
	if p == nil {
		return domain.Params{}
	}
	out := domain.Params{}
	if p.ClassId != nil {
		out.ClassID = uuid.NullUUID{UUID: *p.ClassId, Valid: true}
	}
	if p.SubjectId != nil {
		out.SubjectID = uuid.NullUUID{UUID: *p.SubjectId, Valid: true}
	}
	if p.TermId != nil {
		out.TermID = uuid.NullUUID{UUID: *p.TermId, Valid: true}
	}
	return out
}

func fromWrite(body api.ReportScheduleWrite) service.ScheduleInput {
	recipients := make([]string, len(body.Recipients))
	for i, r := range body.Recipients {
		recipients[i] = string(r)
	}
	var format domain.Format
	if body.Format != nil {
		format = domain.Format(*body.Format)
	}
	return service.ScheduleInput{
		ReportKind: body.ReportKind,
		Params:     fromDomainParams(body.Params),
		Cadence:    domain.Cadence(body.Cadence),
		Format:     format,
		Weekday:    body.Weekday,
		DayOfMonth: body.DayOfMonth,
		Hour:       body.Hour,
		Recipients: recipients,
	}
}

func (h *ReportsHandler) scheduleView(ctx context.Context, tenantID uuid.UUID, sched domain.Schedule) api.ReportSchedule {
	return toAPISchedule(service.ScheduleView{Schedule: sched, NextRunAt: h.schedules.NextRunAt(ctx, tenantID, sched)})
}

func (h *ReportsHandler) ListReportSchedules(ctx context.Context, _ api.ListReportSchedulesRequestObject) (api.ListReportSchedulesResponseObject, error) {
	views, err := h.schedules.ListSchedulesWithNextRun(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapScheduleError(err)
	}
	data := make([]api.ReportSchedule, len(views))
	for i, v := range views {
		data[i] = toAPISchedule(v)
	}
	return api.ListReportSchedules200JSONResponse{Data: data}, nil
}

func (h *ReportsHandler) CreateReportSchedule(ctx context.Context, request api.CreateReportScheduleRequestObject) (api.CreateReportScheduleResponseObject, error) {
	if request.Body == nil {
		return nil, httpx.ErrValidation
	}
	sched, err := h.schedules.CreateSchedule(ctx, tenantID(ctx), userID(ctx), fromWrite(*request.Body))
	if err != nil {
		return nil, mapScheduleError(err)
	}
	return api.CreateReportSchedule201JSONResponse(h.scheduleView(ctx, tenantID(ctx), sched)), nil
}

func (h *ReportsHandler) UpdateReportSchedule(ctx context.Context, request api.UpdateReportScheduleRequestObject) (api.UpdateReportScheduleResponseObject, error) {
	if request.Body == nil {
		return nil, httpx.ErrValidation
	}
	sched, err := h.schedules.UpdateSchedule(ctx, tenantID(ctx), userID(ctx), request.ScheduleId, fromWrite(*request.Body))
	if err != nil {
		return nil, mapScheduleError(err)
	}
	return api.UpdateReportSchedule200JSONResponse(h.scheduleView(ctx, tenantID(ctx), sched)), nil
}

func (h *ReportsHandler) DeleteReportSchedule(ctx context.Context, request api.DeleteReportScheduleRequestObject) (api.DeleteReportScheduleResponseObject, error) {
	if err := h.schedules.DeleteSchedule(ctx, tenantID(ctx), request.ScheduleId); err != nil {
		return nil, mapScheduleError(err)
	}
	return api.DeleteReportSchedule204Response{}, nil
}

func (h *ReportsHandler) SetReportScheduleEnabled(ctx context.Context, request api.SetReportScheduleEnabledRequestObject) (api.SetReportScheduleEnabledResponseObject, error) {
	if request.Body == nil {
		return nil, httpx.ErrValidation
	}
	sched, err := h.schedules.SetEnabled(ctx, tenantID(ctx), request.ScheduleId, request.Body.Enabled)
	if err != nil {
		return nil, mapScheduleError(err)
	}
	return api.SetReportScheduleEnabled200JSONResponse(h.scheduleView(ctx, tenantID(ctx), sched)), nil
}

func (h *ReportsHandler) ListReportScheduleRuns(ctx context.Context, request api.ListReportScheduleRunsRequestObject) (api.ListReportScheduleRunsResponseObject, error) {
	limit := 50
	if request.Params.Limit != nil {
		limit = *request.Params.Limit
	}
	runs, err := h.schedules.ListRuns(ctx, tenantID(ctx), request.ScheduleId, limit)
	if err != nil {
		return nil, mapScheduleError(err)
	}
	data := make([]api.ReportScheduleRun, len(runs))
	for i, r := range runs {
		data[i] = toAPIRun(r)
	}
	return api.ListReportScheduleRuns200JSONResponse{Data: data}, nil
}

func toAPIRun(r domain.Run) api.ReportScheduleRun {
	objectKey := r.ObjectKey
	return api.ReportScheduleRun{
		Id: r.ID, ScheduleId: r.ScheduleID, DueAt: r.DueAt, Status: api.ReportScheduleRunStatus(r.Status),
		ErrorMessage: r.ErrorMessage, ObjectKey: &objectKey, RanAt: r.RanAt, CreatedAt: r.CreatedAt,
	}
}
