package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
)

func (h *LibraryHandler) BorrowLibraryLoan(ctx context.Context, request api.BorrowLibraryLoanRequestObject) (api.BorrowLibraryLoanResponseObject, error) {
	b := request.Body
	loan, err := h.service.Borrow(ctx, tenantID(ctx), service.BorrowInput{
		Barcode: b.Barcode, MemberUserID: b.MemberUserId, CheckedOutBy: userID(ctx),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.BorrowLibraryLoan201JSONResponse(toAPILoan(loan)), nil
}

func (h *LibraryHandler) ReturnLibraryLoan(ctx context.Context, request api.ReturnLibraryLoanRequestObject) (api.ReturnLibraryLoanResponseObject, error) {
	var condition *domain.CopyCondition
	if request.Body != nil && request.Body.Condition != nil {
		c := domain.CopyCondition(*request.Body.Condition)
		condition = &c
	}
	loan, err := h.service.Return(ctx, tenantID(ctx), request.LoanId, userID(ctx), condition)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ReturnLibraryLoan200JSONResponse(toAPILoan(loan)), nil
}

func (h *LibraryHandler) RenewLibraryLoan(ctx context.Context, request api.RenewLibraryLoanRequestObject) (api.RenewLibraryLoanResponseObject, error) {
	loan, err := h.service.Renew(ctx, tenantID(ctx), request.LoanId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.RenewLibraryLoan200JSONResponse(toAPILoan(loan)), nil
}

func (h *LibraryHandler) MarkLibraryLoanLost(ctx context.Context, request api.MarkLibraryLoanLostRequestObject) (api.MarkLibraryLoanLostResponseObject, error) {
	loan, err := h.service.MarkLost(ctx, tenantID(ctx), request.LoanId, userID(ctx), request.Body.ReplacementCost)
	if err != nil {
		return nil, mapError(err)
	}
	return api.MarkLibraryLoanLost200JSONResponse(toAPILoan(loan)), nil
}

func (h *LibraryHandler) ListOverdueLibraryLoans(ctx context.Context, _ api.ListOverdueLibraryLoansRequestObject) (api.ListOverdueLibraryLoansResponseObject, error) {
	loans, err := h.service.OverdueLoans(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryLoan, len(loans))
	for i, l := range loans {
		data[i] = toAPILoan(l)
	}
	return api.ListOverdueLibraryLoans200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) ListMemberLoanHistory(ctx context.Context, request api.ListMemberLoanHistoryRequestObject) (api.ListMemberLoanHistoryResponseObject, error) {
	includeReturned := request.Params.IncludeReturned == nil || *request.Params.IncludeReturned
	loans, err := h.service.MemberLoanHistory(ctx, tenantID(ctx), request.UserId, includeReturned, intOr(request.Params.Limit, 50), intOr(request.Params.Offset, 0))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryLoan, len(loans))
	for i, l := range loans {
		data[i] = toAPILoan(l)
	}
	return api.ListMemberLoanHistory200JSONResponse{Data: data}, nil
}
