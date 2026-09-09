package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
)

func (h *LibraryHandler) GetLibraryLoansReport(ctx context.Context, request api.GetLibraryLoansReportRequestObject) (api.GetLibraryLoansReportResponseObject, error) {
	loans, err := h.service.LoansInPeriod(ctx, tenantID(ctx), request.Params.From.Time, request.Params.To.Time)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryLoan, len(loans))
	for i, l := range loans {
		data[i] = toAPILoan(l)
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
	titles, err := h.service.MostBorrowedTitles(ctx, tenantID(ctx), request.Params.From.Time, request.Params.To.Time, intOr(request.Params.Limit, 20))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryMostBorrowedTitle, len(titles))
	for i, t := range titles {
		data[i] = api.LibraryMostBorrowedTitle{Title: toAPITitle(t.Title), LoanCount: t.LoanCount}
	}
	return api.GetLibraryMostBorrowedReport200JSONResponse{Data: data}, nil
}
