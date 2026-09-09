package http

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func (h *AcademicHandler) ListPeriodTemplates(ctx context.Context, _ api.ListPeriodTemplatesRequestObject) (api.ListPeriodTemplatesResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	templates, err := h.service.ListPeriodTemplates(ctx, tenantID)
	if err != nil {
		return nil, mapDomainError(err)
	}
	data := make([]api.PeriodTemplate, len(templates))
	for i, t := range templates {
		data[i] = api.PeriodTemplate{Id: t.ID, Name: t.Name, IsDefault: t.IsDefault}
	}
	return api.ListPeriodTemplates200JSONResponse{Data: data}, nil
}

func (h *AcademicHandler) CreatePeriodTemplate(ctx context.Context, request api.CreatePeriodTemplateRequestObject) (api.CreatePeriodTemplateResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	isDefault := request.Body.IsDefault != nil && *request.Body.IsDefault
	template, err := h.service.CreatePeriodTemplate(ctx, tenantID, request.Body.Name, isDefault)
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.CreatePeriodTemplate201JSONResponse{Id: template.ID, Name: template.Name, IsDefault: template.IsDefault}, nil
}

func (h *AcademicHandler) UpdatePeriodTemplate(ctx context.Context, request api.UpdatePeriodTemplateRequestObject) (api.UpdatePeriodTemplateResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	isDefault := request.Body.IsDefault != nil && *request.Body.IsDefault
	template, err := h.service.UpdatePeriodTemplate(ctx, tenantID, request.TemplateId, request.Body.Name, isDefault)
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.UpdatePeriodTemplate200JSONResponse{Id: template.ID, Name: template.Name, IsDefault: template.IsDefault}, nil
}

func (h *AcademicHandler) DeletePeriodTemplate(ctx context.Context, request api.DeletePeriodTemplateRequestObject) (api.DeletePeriodTemplateResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	if err := h.service.DeletePeriodTemplate(ctx, tenantID, request.TemplateId); err != nil {
		return nil, mapDomainError(err)
	}
	return api.DeletePeriodTemplate204Response{}, nil
}

func (h *AcademicHandler) ListPeriods(ctx context.Context, request api.ListPeriodsRequestObject) (api.ListPeriodsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	periods, err := h.service.ListPeriods(ctx, tenantID, request.TemplateId)
	if err != nil {
		return nil, mapDomainError(err)
	}
	data := make([]api.Period, len(periods))
	for i, p := range periods {
		data[i] = toAPIPeriod(p)
	}
	return api.ListPeriods200JSONResponse{Data: data}, nil
}

func (h *AcademicHandler) CreatePeriod(ctx context.Context, request api.CreatePeriodRequestObject) (api.CreatePeriodResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	period, err := fromAPIPeriodInput(tenantID, request.TemplateId, *request.Body)
	if err != nil {
		return nil, err
	}
	created, err := h.service.CreatePeriod(ctx, period)
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.CreatePeriod201JSONResponse(toAPIPeriod(created)), nil
}

func (h *AcademicHandler) UpdatePeriod(ctx context.Context, request api.UpdatePeriodRequestObject) (api.UpdatePeriodResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	existing, err := h.service.GetPeriod(ctx, tenantID, request.PeriodId)
	if err != nil {
		return nil, mapDomainError(err)
	}
	period, err := fromAPIPeriodInput(tenantID, existing.TemplateID, *request.Body)
	if err != nil {
		return nil, err
	}
	period.ID = request.PeriodId
	updated, err := h.service.UpdatePeriod(ctx, period)
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.UpdatePeriod200JSONResponse(toAPIPeriod(updated)), nil
}

func (h *AcademicHandler) DeletePeriod(ctx context.Context, request api.DeletePeriodRequestObject) (api.DeletePeriodResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	if err := h.service.DeletePeriod(ctx, tenantID, request.PeriodId); err != nil {
		return nil, mapDomainError(err)
	}
	return api.DeletePeriod204Response{}, nil
}

func (h *AcademicHandler) ListWeekdayAssignments(ctx context.Context, request api.ListWeekdayAssignmentsRequestObject) (api.ListWeekdayAssignmentsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	assignments, err := h.service.ListWeekdayAssignments(ctx, tenantID, request.YearId)
	if err != nil {
		return nil, mapDomainError(err)
	}
	data := make([]api.WeekdayAssignment, len(assignments))
	for i, a := range assignments {
		data[i] = api.WeekdayAssignment{DayOfWeek: int(a.DayOfWeek), TemplateId: a.TemplateID}
	}
	return api.ListWeekdayAssignments200JSONResponse{Data: data}, nil
}

func (h *AcademicHandler) SetWeekdayAssignment(ctx context.Context, request api.SetWeekdayAssignmentRequestObject) (api.SetWeekdayAssignmentResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	if err := h.service.SetWeekdayAssignment(ctx, tenantID, request.YearId, request.Body.TemplateId, int16(request.DayOfWeek)); err != nil { //nolint:gosec // bounded by the DayOfWeekParam schema
		return nil, mapDomainError(err)
	}
	return api.SetWeekdayAssignment204Response{}, nil
}

func (h *AcademicHandler) GetPeriodToday(ctx context.Context, request api.GetPeriodTodayRequestObject) (api.GetPeriodTodayResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	now := h.tenantNow(ctx)
	period, found, err := h.service.PeriodsToday(ctx, tenantID, request.Params.AcademicYearId, isoWeekday(now), domain.ClockTime{Hour: now.Hour(), Minute: now.Minute()})
	if err != nil {
		return nil, mapDomainError(err)
	}
	if !found {
		return nil, httpx.ErrNotFound
	}
	return api.GetPeriodToday200JSONResponse(toAPIPeriod(period)), nil
}

func fromAPIPeriodInput(tenantID, templateID uuid.UUID, in api.PeriodInput) (domain.Period, error) {
	startsAt, err := toClockTime(in.StartsAt)
	if err != nil {
		return domain.Period{}, err
	}
	endsAt, err := toClockTime(in.EndsAt)
	if err != nil {
		return domain.Period{}, err
	}
	isBreak := in.IsBreak != nil && *in.IsBreak
	return domain.Period{
		TenantID: tenantID, TemplateID: templateID, Name: in.Name, Sequence: int16(in.Sequence), //nolint:gosec // bounded by schema minimum
		StartsAt: startsAt, EndsAt: endsAt, IsBreak: isBreak,
	}, nil
}

func toAPIPeriod(p domain.Period) api.Period {
	return api.Period{
		Id: p.ID, TemplateId: p.TemplateID, Name: p.Name, Sequence: int(p.Sequence),
		StartsAt: fromClockTime(p.StartsAt), EndsAt: fromClockTime(p.EndsAt), IsBreak: p.IsBreak,
	}
}
