package http

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
)

func (h *AcademicHandler) ListAcademicYears(ctx context.Context, request api.ListAcademicYearsRequestObject) (api.ListAcademicYearsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	includeArchived := request.Params.IncludeArchived != nil && *request.Params.IncludeArchived

	years, total, err := h.service.ListAcademicYears(ctx, tenantID, searchValue(request.Params.Search), includeArchived, toPage(request.Params.Page, request.Params.PageSize))
	if err != nil {
		return nil, mapDomainError(err)
	}

	data := make([]api.AcademicYear, len(years))
	for i, y := range years {
		data[i] = toAPIAcademicYear(y)
	}
	return api.ListAcademicYears200JSONResponse{Data: data, Page: toPageMeta(total, request.Params.Page, request.Params.PageSize)}, nil
}

func (h *AcademicHandler) CreateAcademicYear(ctx context.Context, request api.CreateAcademicYearRequestObject) (api.CreateAcademicYearResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	year, err := h.service.CreateAcademicYear(ctx, tenantID, request.Body.Label, toDate(request.Body.StartsOn), toDate(request.Body.EndsOn))
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.CreateAcademicYear201JSONResponse(toAPIAcademicYear(year)), nil
}

func (h *AcademicHandler) GetAcademicYear(ctx context.Context, request api.GetAcademicYearRequestObject) (api.GetAcademicYearResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	year, err := h.service.GetAcademicYear(ctx, tenantID, request.YearId)
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.GetAcademicYear200JSONResponse(toAPIAcademicYear(year)), nil
}

func (h *AcademicHandler) UpdateAcademicYear(ctx context.Context, request api.UpdateAcademicYearRequestObject) (api.UpdateAcademicYearResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	year, err := h.service.UpdateAcademicYear(ctx, tenantID, request.YearId, request.Body.Label, toDate(request.Body.StartsOn), toDate(request.Body.EndsOn))
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.UpdateAcademicYear200JSONResponse(toAPIAcademicYear(year)), nil
}

func (h *AcademicHandler) ActivateAcademicYear(ctx context.Context, request api.ActivateAcademicYearRequestObject) (api.ActivateAcademicYearResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	if err := h.service.ActivateAcademicYear(ctx, tenantID, request.YearId); err != nil {
		return nil, mapDomainError(err)
	}
	return api.ActivateAcademicYear204Response{}, nil
}

func (h *AcademicHandler) ArchiveAcademicYear(ctx context.Context, request api.ArchiveAcademicYearRequestObject) (api.ArchiveAcademicYearResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	if err := h.service.ArchiveAcademicYear(ctx, tenantID, request.YearId); err != nil {
		return nil, mapDomainError(err)
	}
	return api.ArchiveAcademicYear204Response{}, nil
}

func (h *AcademicHandler) ListTerms(ctx context.Context, request api.ListTermsRequestObject) (api.ListTermsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	terms, err := h.service.ListTerms(ctx, tenantID, request.YearId)
	if err != nil {
		return nil, mapDomainError(err)
	}
	data := make([]api.Term, len(terms))
	for i, t := range terms {
		data[i] = toAPITerm(t)
	}
	return api.ListTerms200JSONResponse{Data: data}, nil
}

func (h *AcademicHandler) CreateTerm(ctx context.Context, request api.CreateTermRequestObject) (api.CreateTermResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	term, err := h.service.CreateTerm(ctx, tenantID, request.YearId, request.Body.Name, int16(request.Body.Sequence), toDate(request.Body.StartsOn), toDate(request.Body.EndsOn)) //nolint:gosec // bounded by schema minimum
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.CreateTerm201JSONResponse(toAPITerm(term)), nil
}

func (h *AcademicHandler) UpdateTerm(ctx context.Context, request api.UpdateTermRequestObject) (api.UpdateTermResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	term, err := h.service.UpdateTerm(ctx, tenantID, request.TermId, request.Body.Name, toDate(request.Body.StartsOn), toDate(request.Body.EndsOn))
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.UpdateTerm200JSONResponse(toAPITerm(term)), nil
}

func (h *AcademicHandler) DeleteTerm(ctx context.Context, request api.DeleteTermRequestObject) (api.DeleteTermResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	if err := h.service.DeleteTerm(ctx, tenantID, request.TermId); err != nil {
		return nil, mapDomainError(err)
	}
	return api.DeleteTerm204Response{}, nil
}

func (h *AcademicHandler) ActivateTerm(ctx context.Context, request api.ActivateTermRequestObject) (api.ActivateTermResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	if err := h.service.ActivateTerm(ctx, tenantID, request.TermId); err != nil {
		return nil, mapDomainError(err)
	}
	return api.ActivateTerm204Response{}, nil
}

func (h *AcademicHandler) ListCalendarEvents(ctx context.Context, request api.ListCalendarEventsRequestObject) (api.ListCalendarEventsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	kind := ""
	if request.Params.Kind != nil {
		kind = string(*request.Params.Kind)
	}
	events, total, err := h.service.ListCalendarEvents(ctx, tenantID, request.YearId, kind, toPage(request.Params.Page, request.Params.PageSize))
	if err != nil {
		return nil, mapDomainError(err)
	}
	data := make([]api.CalendarEvent, len(events))
	for i, e := range events {
		data[i] = toAPICalendarEvent(e)
	}
	return api.ListCalendarEvents200JSONResponse{Data: data, Page: toPageMeta(total, request.Params.Page, request.Params.PageSize)}, nil
}

func (h *AcademicHandler) CreateCalendarEvent(ctx context.Context, request api.CreateCalendarEventRequestObject) (api.CreateCalendarEventResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	event, err := h.service.CreateCalendarEvent(ctx, tenantID, request.YearId,
		toDate(request.Body.Date), toDate(request.Body.EndDate), string(request.Body.Kind), request.Body.Name,
		fromAPIGradeLevelIDs(request.Body.GradeLevelIds))
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.CreateCalendarEvent201JSONResponse(toAPICalendarEvent(event)), nil
}

func (h *AcademicHandler) UpdateCalendarEvent(ctx context.Context, request api.UpdateCalendarEventRequestObject) (api.UpdateCalendarEventResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	event, err := h.service.UpdateCalendarEvent(ctx, tenantID, request.EventId,
		toDate(request.Body.Date), toDate(request.Body.EndDate), string(request.Body.Kind), request.Body.Name,
		fromAPIGradeLevelIDs(request.Body.GradeLevelIds))
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.UpdateCalendarEvent200JSONResponse(toAPICalendarEvent(event)), nil
}

func fromAPIGradeLevelIDs(ids *[]uuid.UUID) []uuid.UUID {
	if ids == nil {
		return nil
	}
	return *ids
}

func (h *AcademicHandler) PreviewNewYearSetup(ctx context.Context, request api.PreviewNewYearSetupRequestObject) (api.PreviewNewYearSetupResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	plan, err := h.service.PreviewNewYearSetup(ctx, tenantID, request.Body.FromYearId, request.Body.ToYearId)
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.PreviewNewYearSetup200JSONResponse(toAPINewYearSetupPlan(plan)), nil
}

func (h *AcademicHandler) CommitNewYearSetup(ctx context.Context, request api.CommitNewYearSetupRequestObject) (api.CommitNewYearSetupResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	result, err := h.service.CommitNewYearSetup(ctx, tenantID, request.Body.FromYearId, request.Body.ToYearId)
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.CommitNewYearSetup200JSONResponse{
		SubjectOfferingsCopied: result.SubjectOfferingsCopied, ClassesCopied: result.ClassesCopied,
	}, nil
}

func toAPINewYearSetupPlan(plan service.NewYearSetupPlan) api.NewYearSetupPlan {
	offerings := make([]api.SubjectOfferingCopyItem, len(plan.SubjectOfferings))
	for i, o := range plan.SubjectOfferings {
		offerings[i] = api.SubjectOfferingCopyItem{
			SubjectId: o.SubjectID, GradeLevelId: o.GradeLevelID, HoursPerWeek: int(o.HoursPerWeek), AlreadyExists: o.AlreadyExists,
		}
	}
	classes := make([]api.ClassCopyItem, len(plan.Classes))
	for i, c := range plan.Classes {
		item := api.ClassCopyItem{
			Name: c.Name, GradeLevelId: c.GradeLevelID, HomeroomTeacherId: c.HomeroomTeacherID,
			RoomId: c.RoomID, AlreadyExists: c.AlreadyExists,
		}
		if c.Capacity != nil {
			capacity := int(*c.Capacity)
			item.Capacity = &capacity
		}
		classes[i] = item
	}
	return api.NewYearSetupPlan{SubjectOfferings: offerings, Classes: classes}
}

func (h *AcademicHandler) DeleteCalendarEvent(ctx context.Context, request api.DeleteCalendarEventRequestObject) (api.DeleteCalendarEventResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	if err := h.service.DeleteCalendarEvent(ctx, tenantID, request.EventId); err != nil {
		return nil, mapDomainError(err)
	}
	return api.DeleteCalendarEvent204Response{}, nil
}

func (h *AcademicHandler) ListSchoolDays(ctx context.Context, request api.ListSchoolDaysRequestObject) (api.ListSchoolDaysResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	days, err := h.service.ListSchoolDays(ctx, tenantID, request.YearId)
	if err != nil {
		return nil, mapDomainError(err)
	}
	data := make([]api.SchoolDay, len(days))
	for i, d := range days {
		data[i] = api.SchoolDay{DayOfWeek: int(d.DayOfWeek), IsActive: d.IsActive}
	}
	return api.ListSchoolDays200JSONResponse{Data: data}, nil
}

func (h *AcademicHandler) SetSchoolDay(ctx context.Context, request api.SetSchoolDayRequestObject) (api.SetSchoolDayResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	if err := h.service.SetSchoolDay(ctx, tenantID, request.YearId, int16(request.DayOfWeek), request.Body.IsActive); err != nil { //nolint:gosec // bounded by the DayOfWeekParam schema
		return nil, mapDomainError(err)
	}
	return api.SetSchoolDay204Response{}, nil
}

func toAPIAcademicYear(y domain.AcademicYear) api.AcademicYear {
	out := api.AcademicYear{
		Id: y.ID, Label: y.Label, StartsOn: toAPIDate(y.StartsOn), EndsOn: toAPIDate(y.EndsOn), IsActive: y.IsActive,
	}
	out.ArchivedAt = y.ArchivedAt
	return out
}

func toAPITerm(t domain.Term) api.Term {
	return api.Term{
		Id: t.ID, AcademicYearId: t.AcademicYearID, Name: t.Name, Sequence: int(t.Sequence),
		StartsOn: toAPIDate(t.StartsOn), EndsOn: toAPIDate(t.EndsOn), IsActive: t.IsActive,
	}
}

func toAPICalendarEvent(e domain.CalendarEvent) api.CalendarEvent {
	out := api.CalendarEvent{
		Id: e.ID, AcademicYearId: e.AcademicYearID, Date: toAPIDate(e.Date), EndDate: toAPIDate(e.EndDate),
		Kind: api.CalendarEventKind(e.Kind), Name: e.Name,
	}
	if len(e.GradeLevelIDs) > 0 {
		out.GradeLevelIds = &e.GradeLevelIDs
	}
	return out
}
