package http

import (
	"context"
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
)

func (h *LibraryHandler) GetLibraryLoansReport(ctx context.Context, request api.GetLibraryLoansReportRequestObject) (api.GetLibraryLoansReportResponseObject, error) {
	var from, to *time.Time
	if request.Params.From != nil {
		from = &request.Params.From.Time
	}
	if request.Params.To != nil {
		to = &request.Params.To.Time
	}
	rows, err := h.service.LoansInPeriod(ctx, tenantID(ctx), from, to)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryLoanReportRow, len(rows))
	for i, r := range rows {
		data[i] = api.LibraryLoanReportRow{Loan: toAPILoan(r.Loan), Title: r.Title, MemberName: r.MemberName}
	}
	return api.GetLibraryLoansReport200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) GetLibraryOverdueMembersReport(ctx context.Context, _ api.GetLibraryOverdueMembersReportRequestObject) (api.GetLibraryOverdueMembersReportResponseObject, error) {
	members, err := h.service.OverdueMembers(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryOverdueMember, len(members))
	for i, m := range members {
		data[i] = api.LibraryOverdueMember{MemberUserId: m.MemberUserID, LoanCount: m.LoanCount, TotalFine: m.TotalFine}
	}
	return api.GetLibraryOverdueMembersReport200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) GetLibraryMostBorrowedReport(ctx context.Context, request api.GetLibraryMostBorrowedReportRequestObject) (api.GetLibraryMostBorrowedReportResponseObject, error) {
	var from, to *time.Time
	if request.Params.From != nil {
		from = &request.Params.From.Time
	}
	if request.Params.To != nil {
		to = &request.Params.To.Time
	}
	titles, err := h.service.MostBorrowedTitles(ctx, tenantID(ctx), from, to, intOr(request.Params.Limit, 20))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryMostBorrowedTitle, len(titles))
	for i, t := range titles {
		data[i] = api.LibraryMostBorrowedTitle{Title: toAPITitle(t.Title), LoanCount: t.LoanCount}
	}
	return api.GetLibraryMostBorrowedReport200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) GetLibraryCatalogueSummaryReport(ctx context.Context, request api.GetLibraryCatalogueSummaryReportRequestObject) (api.GetLibraryCatalogueSummaryReportResponseObject, error) {
	var from, to *time.Time
	if request.Params.From != nil {
		from = &request.Params.From.Time
	}
	if request.Params.To != nil {
		to = &request.Params.To.Time
	}
	summary, err := h.service.CatalogueSummary(ctx, tenantID(ctx), from, to)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryCatalogueSummaryReport200JSONResponse(toAPICatalogueSummary(summary)), nil
}

func (h *LibraryHandler) GetLibraryAccessionRegisterReport(ctx context.Context, request api.GetLibraryAccessionRegisterReportRequestObject) (api.GetLibraryAccessionRegisterReportResponseObject, error) {
	var from, to *time.Time
	if request.Params.From != nil {
		from = &request.Params.From.Time
	}
	if request.Params.To != nil {
		to = &request.Params.To.Time
	}
	copies, err := h.service.AccessionRegister(ctx, tenantID(ctx), from, to)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryCopy, len(copies))
	for i, c := range copies {
		data[i] = toAPICopy(c)
	}
	return api.GetLibraryAccessionRegisterReport200JSONResponse{Data: data}, nil
}

func toAPICatalogueSummary(s service.CatalogueSummary) api.LibraryCatalogueSummary {
	byDDC := make([]api.LibraryDDCClassCount, len(s.TitlesByDDC))
	for i, c := range s.TitlesByDDC {
		byDDC[i] = api.LibraryDDCClassCount{Code: c.Code, Name: c.Name, TitleCount: c.TitleCount}
	}
	byCategory := make([]api.LibraryMasterEntryCount, len(s.ItemsByCategory))
	for i, c := range s.ItemsByCategory {
		byCategory[i] = api.LibraryMasterEntryCount{Id: c.ID, Code: c.Code, Name: c.Name, Count: c.Count}
	}
	byMaterialType := make([]api.LibraryMasterEntryCount, len(s.ItemsByMaterialType))
	for i, c := range s.ItemsByMaterialType {
		byMaterialType[i] = api.LibraryMasterEntryCount{Id: c.ID, Code: c.Code, Name: c.Name, Count: c.Count}
	}
	out := api.LibraryCatalogueSummary{
		TitlesByDdc: byDDC, ItemsByCategory: byCategory, ItemsByMaterialType: byMaterialType,
		FictionCount: s.FictionCount, FictionTotal: s.FictionTotal, AdditionsInPeriod: s.AdditionsInPeriod,
		LoansInPeriod: s.LoansInPeriod, ActiveBorrowers: s.ActiveBorrowers, OverdueNow: s.OverdueNow,
	}
	if s.LastStocktake != nil {
		last := toAPIStocktake(*s.LastStocktake)
		out.LastStocktake = &last
	}
	return out
}
