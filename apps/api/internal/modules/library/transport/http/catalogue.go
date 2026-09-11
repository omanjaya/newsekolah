package http

import (
	"bytes"
	"context"

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
		SaturdayClosed: boolOr(b.SaturdayClosed), SundayClosed: boolOr(b.SundayClosed),
		BookingEnabled: boolOr(b.BookingEnabled), BookingMax: intOr(b.BookingMax, 2),
		FineCurrencyEnabled: boolOr(b.FineCurrencyEnabled), BlockLoansWithUnpaidFines: boolOr(b.BlockLoansWithUnpaidFines),
		DueReminderDays: intOr(b.DueReminderDays, 2), AutoRegisterMembers: boolOr(b.AutoRegisterMembers),
	}
	policy, err := h.service.UpdatePolicy(ctx, tenantID(ctx), userID(ctx), next)
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateLibraryPolicy200JSONResponse(toAPIPolicy(policy)), nil
}

func (h *LibraryHandler) ListLibraryTitles(ctx context.Context, request api.ListLibraryTitlesRequestObject) (api.ListLibraryTitlesResponseObject, error) {
	titles, err := h.service.ListTitles(ctx, tenantID(ctx), strOr(request.Params.Search), intOr(request.Params.Limit, 50), intOr(request.Params.Offset, 0))
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
	t, err := h.service.CreateTitle(ctx, domain.Title{
		TenantID: tenantID(ctx), Title: b.Title, Subtitle: strOr(b.Subtitle), Author: strOr(b.Author), Publisher: strOr(b.Publisher),
		PublishYear: intOr(b.PublishYear, 0), ISBN: strOr(b.Isbn), Classification: strOr(b.Classification), Language: strOr(b.Language),
	})
	if err != nil {
		return nil, mapError(err)
	}
	availability, err := h.service.GetTitle(ctx, tenantID(ctx), t.ID)
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateLibraryTitle201JSONResponse(toAPITitle(availability)), nil
}

func (h *LibraryHandler) GetLibraryTitle(ctx context.Context, request api.GetLibraryTitleRequestObject) (api.GetLibraryTitleResponseObject, error) {
	t, err := h.service.GetTitle(ctx, tenantID(ctx), request.TitleId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryTitle200JSONResponse(toAPITitle(t)), nil
}

func (h *LibraryHandler) UpdateLibraryTitle(ctx context.Context, request api.UpdateLibraryTitleRequestObject) (api.UpdateLibraryTitleResponseObject, error) {
	b := request.Body
	_, err := h.service.UpdateTitle(ctx, domain.Title{
		TenantID: tenantID(ctx), ID: request.TitleId, Title: b.Title, Subtitle: strOr(b.Subtitle), Author: strOr(b.Author),
		Publisher: strOr(b.Publisher), PublishYear: intOr(b.PublishYear, 0), ISBN: strOr(b.Isbn),
		Classification: strOr(b.Classification), Language: strOr(b.Language),
	})
	if err != nil {
		return nil, mapError(err)
	}
	availability, err := h.service.GetTitle(ctx, tenantID(ctx), request.TitleId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateLibraryTitle200JSONResponse(toAPITitle(availability)), nil
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
	b := request.Body
	copyIn := domain.Copy{TitleID: request.TitleId, Barcode: b.Barcode, Notes: strOr(b.Notes)}
	if b.Condition != nil {
		copyIn.Condition = domain.CopyCondition(*b.Condition)
	}
	if b.AcquiredOn != nil {
		copyIn.AcquiredOn = &b.AcquiredOn.Time
	}
	c, err := h.service.AddCopy(ctx, tenantID(ctx), copyIn)
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateLibraryCopy201JSONResponse(toAPICopy(c)), nil
}

func (h *LibraryHandler) PrintLibraryCopyLabel(ctx context.Context, request api.PrintLibraryCopyLabelRequestObject) (api.PrintLibraryCopyLabelResponseObject, error) {
	pdf, err := h.service.PrintCopyLabel(ctx, tenantID(ctx), request.CopyId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.PrintLibraryCopyLabel200ApplicationpdfResponse{Body: bytes.NewReader(pdf), ContentLength: int64(len(pdf))}, nil
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
		Limit: intOr(request.Params.Limit, 20), Offset: intOr(request.Params.Offset, 0),
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
