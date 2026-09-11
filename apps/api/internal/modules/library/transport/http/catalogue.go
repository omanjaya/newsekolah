package http

import (
	"bytes"
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
)

func (h *LibraryHandler) GetLibraryPolicy(ctx context.Context, _ api.GetLibraryPolicyRequestObject) (api.GetLibraryPolicyResponseObject, error) {
	policy, err := h.service.Policy(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryPolicy200JSONResponse(toAPIPolicy(policy)), nil
}

func (h *LibraryHandler) UpdateLibraryPolicy(ctx context.Context, request api.UpdateLibraryPolicyRequestObject) (api.UpdateLibraryPolicyResponseObject, error) {
	b := request.Body
	next := domain.Policy{
		LoanDays: b.LoanDays, MaxActiveLoans: b.MaxActiveLoans, MaxRenewals: b.MaxRenewals,
		RenewalDays: b.RenewalDays, FinePerDay: b.FinePerDay, ReservationHoldDays: b.ReservationHoldDays,
		Name: strOr(b.Name), NPP: strOr(b.Npp), BarcodeSource: barcodeSourceOr(b.BarcodeSource, domain.BarcodeSourceAccessionNumber),
		AccessionFormat: strOr(b.AccessionFormat), MemberNoFormat: strOr(b.MemberNoFormat),
		SaturdayClosed: boolOr(b.SaturdayClosed, false), SundayClosed: boolOr(b.SundayClosed, false),
		BookingEnabled: boolOr(b.BookingEnabled, false), BookingMax: intOr(b.BookingMax, 2),
		FineCurrencyEnabled: boolOr(b.FineCurrencyEnabled, false), BlockLoansWithUnpaidFines: boolOr(b.BlockLoansWithUnpaidFines, false),
		DueReminderDays: intOr(b.DueReminderDays, 2), AutoRegisterMembers: boolOr(b.AutoRegisterMembers, false),
	}
	policy, err := h.service.UpdatePolicy(ctx, tenantID(ctx), userID(ctx), next)
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateLibraryPolicy200JSONResponse(toAPIPolicy(policy)), nil
}

func (h *LibraryHandler) ListLibraryTitles(ctx context.Context, request api.ListLibraryTitlesRequestObject) (api.ListLibraryTitlesResponseObject, error) {
	q := service.TitleSearch{
		Search: strOr(request.Params.Search), MaterialTypeID: nullUUID(request.Params.MaterialTypeId),
		Limit: intOr(request.Params.Limit, 50), Offset: intOr(request.Params.Offset, 0),
	}
	if request.Params.DdcClass != nil {
		q.DDCClass = *request.Params.DdcClass
	}
	if request.Params.Availability != nil {
		q.AvailableOnly = true
	}
	if request.Params.Sort != nil {
		q.Sort = string(*request.Params.Sort)
	}
	titles, err := h.service.ListTitles(ctx, tenantID(ctx), q)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryTitle, len(titles))
	for i, t := range titles {
		data[i] = toAPITitle(t)
	}
	return api.ListLibraryTitles200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) CreateLibraryTitle(ctx context.Context, request api.CreateLibraryTitleRequestObject) (api.CreateLibraryTitleResponseObject, error) {
	b := request.Body
	t := titleFromWrite(*b)
	t.TenantID = tenantID(ctx)
	copyCount := intOr(b.Copies, 0)
	created, _, err := h.service.CreateTitle(ctx, t, copyCount, service.CopyDefaults{})
	if err != nil {
		return nil, mapError(err)
	}
	availability, err := h.service.GetTitle(ctx, tenantID(ctx), created.ID)
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateLibraryTitle201JSONResponse(toAPITitle(availability)), nil
}

func (h *LibraryHandler) LookupLibraryTitleByIsbn(ctx context.Context, request api.LookupLibraryTitleByIsbnRequestObject) (api.LookupLibraryTitleByIsbnResponseObject, error) {
	t, found, err := h.service.LookupTitleByISBN(ctx, tenantID(ctx), request.Params.Isbn)
	if err != nil {
		return nil, mapError(err)
	}
	if !found {
		return nil, mapError(domain.ErrTitleNotFound)
	}
	return api.LookupLibraryTitleByIsbn200JSONResponse(toAPITitle(t)), nil
}

func (h *LibraryHandler) GetLibraryTitle(ctx context.Context, request api.GetLibraryTitleRequestObject) (api.GetLibraryTitleResponseObject, error) {
	t, err := h.service.GetTitle(ctx, tenantID(ctx), request.TitleId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryTitle200JSONResponse(toAPITitle(t)), nil
}

func (h *LibraryHandler) UpdateLibraryTitle(ctx context.Context, request api.UpdateLibraryTitleRequestObject) (api.UpdateLibraryTitleResponseObject, error) {
	t := titleFromWrite(*request.Body)
	t.TenantID = tenantID(ctx)
	t.ID = request.TitleId
	if _, err := h.service.UpdateTitle(ctx, t); err != nil {
		return nil, mapError(err)
	}
	availability, err := h.service.GetTitle(ctx, tenantID(ctx), request.TitleId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateLibraryTitle200JSONResponse(toAPITitle(availability)), nil
}

func (h *LibraryHandler) DeleteLibraryTitle(ctx context.Context, request api.DeleteLibraryTitleRequestObject) (api.DeleteLibraryTitleResponseObject, error) {
	if err := h.service.DeleteTitle(ctx, tenantID(ctx), request.TitleId); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteLibraryTitle204Response{}, nil
}

func (h *LibraryHandler) ListLibraryCopies(ctx context.Context, request api.ListLibraryCopiesRequestObject) (api.ListLibraryCopiesResponseObject, error) {
	copies, err := h.service.ListCopies(ctx, tenantID(ctx), request.TitleId)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryCopy, len(copies))
	for i, c := range copies {
		data[i] = toAPICopy(c)
	}
	return api.ListLibraryCopies200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) CreateLibraryCopy(ctx context.Context, request api.CreateLibraryCopyRequestObject) (api.CreateLibraryCopyResponseObject, error) {
	c, err := h.service.AddCopy(ctx, tenantID(ctx), request.TitleId, copyDefaultsFromWrite(*request.Body))
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateLibraryCopy201JSONResponse(toAPICopy(c)), nil
}

func (h *LibraryHandler) AddLibraryCopiesBatch(ctx context.Context, request api.AddLibraryCopiesBatchRequestObject) (api.AddLibraryCopiesBatchResponseObject, error) {
	b := request.Body
	defaults := service.CopyDefaults{
		CategoryID: nullUUID(b.CategoryId), LocationID: nullUUID(b.LocationId), SourceID: nullUUID(b.SourceId),
		PartnerID: nullUUID(b.PartnerId), Price: intOr(b.Price, 0), IsOPAC: boolOr(b.IsOpac, true), Notes: strOr(b.Notes),
	}
	if b.Access != nil {
		defaults.Access = domain.CopyAccess(*b.Access)
	}
	if b.Condition != nil {
		defaults.Condition = domain.CopyCondition(*b.Condition)
	}
	copies, err := h.service.AddCopies(ctx, tenantID(ctx), request.TitleId, b.Count, defaults)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryCopy, len(copies))
	for i, c := range copies {
		data[i] = toAPICopy(c)
	}
	return api.AddLibraryCopiesBatch201JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) ListLibraryCopiesFiltered(ctx context.Context, request api.ListLibraryCopiesFilteredRequestObject) (api.ListLibraryCopiesFilteredResponseObject, error) {
	q := service.CopySearch{
		TitleID: nullUUID(request.Params.TitleId), CategoryID: nullUUID(request.Params.CategoryId),
		LocationID: nullUUID(request.Params.LocationId), Search: strOr(request.Params.Search),
		Limit: intOr(request.Params.Limit, 50), Offset: intOr(request.Params.Offset, 0),
	}
	if request.Params.Status != nil {
		q.Status = domain.CopyStatus(*request.Params.Status)
	}
	copies, err := h.service.ListCopiesFiltered(ctx, tenantID(ctx), q)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryCopy, len(copies))
	for i, c := range copies {
		data[i] = toAPICopy(c)
	}
	return api.ListLibraryCopiesFiltered200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) FindLibraryCopyByCode(ctx context.Context, request api.FindLibraryCopyByCodeRequestObject) (api.FindLibraryCopyByCodeResponseObject, error) {
	c, err := h.service.FindCopyByCode(ctx, tenantID(ctx), request.Params.Code)
	if err != nil {
		return nil, mapError(err)
	}
	return api.FindLibraryCopyByCode200JSONResponse(toAPICopy(c)), nil
}

func (h *LibraryHandler) DeleteLibraryCopy(ctx context.Context, request api.DeleteLibraryCopyRequestObject) (api.DeleteLibraryCopyResponseObject, error) {
	if err := h.service.DeleteCopy(ctx, tenantID(ctx), request.CopyId); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteLibraryCopy204Response{}, nil
}

func (h *LibraryHandler) SetLibraryCopyStatus(ctx context.Context, request api.SetLibraryCopyStatusRequestObject) (api.SetLibraryCopyStatusResponseObject, error) {
	b := request.Body
	var condition *domain.CopyCondition
	if b.Condition != nil {
		c := domain.CopyCondition(*b.Condition)
		condition = &c
	}
	c, err := h.service.SetCopyStatus(ctx, tenantID(ctx), request.CopyId, userID(ctx), domain.CopyStatus(b.Status), condition, strOr(b.Note))
	if err != nil {
		return nil, mapError(err)
	}
	return api.SetLibraryCopyStatus200JSONResponse(toAPICopy(c)), nil
}

func (h *LibraryHandler) BulkSetLibraryCopyStatus(ctx context.Context, request api.BulkSetLibraryCopyStatusRequestObject) (api.BulkSetLibraryCopyStatusResponseObject, error) {
	b := request.Body
	ids := make([]uuid.UUID, len(b.CopyIds))
	for i, id := range b.CopyIds {
		ids[i] = uuid.UUID(id)
	}
	copies, err := h.service.BulkSetCopyStatus(ctx, tenantID(ctx), userID(ctx), ids, domain.CopyStatus(b.Status), strOr(b.Note))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryCopy, len(copies))
	for i, c := range copies {
		data[i] = toAPICopy(c)
	}
	return api.BulkSetLibraryCopyStatus200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) ListLibraryCopyEvents(ctx context.Context, request api.ListLibraryCopyEventsRequestObject) (api.ListLibraryCopyEventsResponseObject, error) {
	events, err := h.service.ListItemEvents(ctx, tenantID(ctx), request.CopyId)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryItemEvent, len(events))
	for i, e := range events {
		data[i] = toAPIItemEvent(e)
	}
	return api.ListLibraryCopyEvents200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) PrintLibraryCopyLabel(ctx context.Context, request api.PrintLibraryCopyLabelRequestObject) (api.PrintLibraryCopyLabelResponseObject, error) {
	pdf, err := h.service.PrintCopyLabel(ctx, tenantID(ctx), request.CopyId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.PrintLibraryCopyLabel200ApplicationpdfResponse{Body: bytes.NewReader(pdf), ContentLength: int64(len(pdf))}, nil
}

func (h *LibraryHandler) PrintLibraryCopyLabels(ctx context.Context, request api.PrintLibraryCopyLabelsRequestObject) (api.PrintLibraryCopyLabelsResponseObject, error) {
	if request.Body == nil {
		return nil, mapError(domain.ErrInvalidInput)
	}
	pdf, err := h.service.PrintCopyLabels(ctx, tenantID(ctx), request.Body.CopyIds)
	if err != nil {
		return nil, mapError(err)
	}
	return api.PrintLibraryCopyLabels200ApplicationpdfResponse{Body: bytes.NewReader(pdf), ContentLength: int64(len(pdf))}, nil
}

func (h *LibraryHandler) PrintLibraryMemberCard(ctx context.Context, request api.PrintLibraryMemberCardRequestObject) (api.PrintLibraryMemberCardResponseObject, error) {
	pdf, err := h.service.PrintMemberCard(ctx, tenantID(ctx), request.UserId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.PrintLibraryMemberCard200ApplicationpdfResponse{Body: bytes.NewReader(pdf), ContentLength: int64(len(pdf))}, nil
}

func (h *LibraryHandler) SearchOpacTitles(ctx context.Context, request api.SearchOpacTitlesRequestObject) (api.SearchOpacTitlesResponseObject, error) {
	titles, err := h.service.OpacSearch(ctx, tenantID(ctx), service.OpacSearchParams{
		Search: strOr(request.Params.Search), ClassificationPrefix: strOr(request.Params.ClassificationPrefix),
		MaterialTypeID: nullUUID(request.Params.MaterialTypeId),
		Limit:          intOr(request.Params.Limit, 20), Offset: intOr(request.Params.Offset, 0),
	})
	if err != nil {
		return nil, mapError(err)
	}
	name, err := h.service.LibraryName(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryTitle, len(titles))
	for i, t := range titles {
		data[i] = toAPITitle(t)
	}
	return api.SearchOpacTitles200JSONResponse{Data: data, LibraryName: name}, nil
}
