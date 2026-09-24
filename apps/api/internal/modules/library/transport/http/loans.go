package http

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
)

func toAPIChannel(c *string) domain.Channel {
	if c == nil {
		return domain.ChannelDesk
	}
	return domain.Channel(*c)
}

func (h *LibraryHandler) BorrowLibraryLoan(ctx context.Context, request api.BorrowLibraryLoanRequestObject) (api.BorrowLibraryLoanResponseObject, error) {
	b := request.Body
	var channel *string
	if b.Channel != nil {
		s := string(*b.Channel)
		channel = &s
	}
	loan, err := h.service.Borrow(ctx, tenantID(ctx), service.BorrowInput{
		Barcode: b.Barcode, MemberUserID: b.MemberUserId, CheckedOutBy: userID(ctx), Channel: toAPIChannel(channel),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.BorrowLibraryLoan201JSONResponse(toAPILoan(loan)), nil
}

func (h *LibraryHandler) BatchBorrowLibraryLoans(ctx context.Context, request api.BatchBorrowLibraryLoansRequestObject) (api.BatchBorrowLibraryLoansResponseObject, error) {
	b := request.Body
	var channel *string
	if b.Channel != nil {
		s := string(*b.Channel)
		channel = &s
	}
	result, err := h.service.BatchBorrow(ctx, tenantID(ctx), service.BatchBorrowInput{
		Barcodes: b.Barcodes, MemberUserID: b.MemberUserId, CheckedOutBy: userID(ctx), Channel: toAPIChannel(channel),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.BatchBorrowLibraryLoans200JSONResponse(toAPIBatchResult(result)), nil
}

func (h *LibraryHandler) ReturnLibraryLoan(ctx context.Context, request api.ReturnLibraryLoanRequestObject) (api.ReturnLibraryLoanResponseObject, error) {
	var condition *domain.CopyCondition
	if request.Body != nil && request.Body.Condition != nil {
		c := domain.CopyCondition(*request.Body.Condition)
		condition = &c
	}
	loan, err := h.service.Return(ctx, tenantID(ctx), service.ReturnInput{
		LoanID: uuid.NullUUID{UUID: request.LoanId, Valid: true}, CheckedInBy: userID(ctx), Condition: condition,
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.ReturnLibraryLoan200JSONResponse(toAPILoan(loan)), nil
}

func (h *LibraryHandler) ReturnLibraryLoanByBarcode(ctx context.Context, request api.ReturnLibraryLoanByBarcodeRequestObject) (api.ReturnLibraryLoanByBarcodeResponseObject, error) {
	b := request.Body
	var condition *domain.CopyCondition
	if b.Condition != nil {
		c := domain.CopyCondition(*b.Condition)
		condition = &c
	}
	loan, err := h.service.Return(ctx, tenantID(ctx), service.ReturnInput{Barcode: b.Barcode, CheckedInBy: userID(ctx), Condition: condition})
	if err != nil {
		return nil, mapError(err)
	}
	return api.ReturnLibraryLoanByBarcode200JSONResponse(toAPILoan(loan)), nil
}

func (h *LibraryHandler) RenewLibraryLoan(ctx context.Context, request api.RenewLibraryLoanRequestObject) (api.RenewLibraryLoanResponseObject, error) {
	loan, err := h.service.Renew(ctx, tenantID(ctx), service.RenewInput{LoanID: uuid.NullUUID{UUID: request.LoanId, Valid: true}}, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.RenewLibraryLoan200JSONResponse(toAPILoan(loan)), nil
}

func (h *LibraryHandler) RenewLibraryLoanByBarcode(ctx context.Context, request api.RenewLibraryLoanByBarcodeRequestObject) (api.RenewLibraryLoanByBarcodeResponseObject, error) {
	loan, err := h.service.Renew(ctx, tenantID(ctx), service.RenewInput{Barcode: request.Body.Barcode}, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.RenewLibraryLoanByBarcode200JSONResponse(toAPILoan(loan)), nil
}

func (h *LibraryHandler) ListLibraryLoanRenewals(ctx context.Context, request api.ListLibraryLoanRenewalsRequestObject) (api.ListLibraryLoanRenewalsResponseObject, error) {
	renewals, err := h.service.RenewalHistory(ctx, tenantID(ctx), request.LoanId)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryLoanRenewal, len(renewals))
	for i, r := range renewals {
		data[i] = api.LibraryLoanRenewal{
			Id: r.ID, LoanId: r.LoanID, RenewedAt: r.RenewedAt,
			PreviousDueOn: openapiDate(r.PreviousDueOn), NewDueOn: openapiDate(r.NewDueOn),
		}
	}
	return api.ListLibraryLoanRenewals200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) MarkLibraryLoanLost(ctx context.Context, request api.MarkLibraryLoanLostRequestObject) (api.MarkLibraryLoanLostResponseObject, error) {
	b := request.Body
	penalty := domain.PenaltyFine
	if b.Penalty != nil {
		penalty = domain.Penalty(*b.Penalty)
	}
	loan, err := h.service.MarkLost(ctx, tenantID(ctx), request.LoanId, userID(ctx), penalty, b.ReplacementCost, strOr(b.Notes))
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

func (h *LibraryHandler) ListOverdueLibraryLoansDetailed(ctx context.Context, _ api.ListOverdueLibraryLoansDetailedRequestObject) (api.ListOverdueLibraryLoansDetailedResponseObject, error) {
	details, err := h.service.OverdueLoansDetailed(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryOverdueLoanDetail, len(details))
	for i, d := range details {
		data[i] = api.LibraryOverdueLoanDetail{Loan: toAPILoan(d.Loan), ClassName: d.ClassName, GuardianPhone: d.GuardianPhone, MemberName: d.MemberName, MemberNo: d.MemberNo, Title: d.Title, Barcode: d.Barcode}
	}
	return api.ListOverdueLibraryLoansDetailed200JSONResponse{Data: data}, nil
}

// selfOrStaff reports whether actor may read subjectUserID's loan/reservation
// history: either they are the same person, or actor holds view_library
// (regression fix -- the first pass let any view_library holder, including
// students by default, read any other member's records).
func (h *LibraryHandler) selfOrStaff(ctx context.Context, subjectUserID uuid.UUID) (bool, error) {
	actor := userID(ctx)
	if actor == subjectUserID {
		return true, nil
	}
	return h.service.HasPermission(ctx, tenantID(ctx), actor, "view_library")
}

func (h *LibraryHandler) ListMemberLoanHistory(ctx context.Context, request api.ListMemberLoanHistoryRequestObject) (api.ListMemberLoanHistoryResponseObject, error) {
	allowed, err := h.selfOrStaff(ctx, request.UserId)
	if err != nil {
		return nil, mapError(err)
	}
	if !allowed {
		return nil, mapError(domain.ErrForbidden)
	}
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

func toAPIBatchResult(r service.BatchBorrowResult) api.LibraryBatchBorrowResult {
	loans := make([]api.LibraryLoan, len(r.Loans))
	for i, l := range r.Loans {
		loans[i] = toAPILoan(l)
	}
	rejected := make([]api.LibraryRejectedBarcode, len(r.Rejected))
	for i, rej := range r.Rejected {
		rejected[i] = api.LibraryRejectedBarcode{Barcode: rej.Barcode, Reason: rej.Reason}
	}
	return api.LibraryBatchBorrowResult{Loans: loans, Rejected: rejected}
}
