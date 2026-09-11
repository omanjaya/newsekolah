package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
)

func (h *LibraryHandler) PreviewLibraryClassLoans(ctx context.Context, request api.PreviewLibraryClassLoansRequestObject) (api.PreviewLibraryClassLoansResponseObject, error) {
	b := request.Body
	preview, err := h.service.PreviewClassLoans(ctx, tenantID(ctx), b.ClassId, b.TitleId)
	if err != nil {
		return nil, mapError(err)
	}
	pairs := make([]api.LibraryClassLoanPair, len(preview.Pairs))
	for i, p := range preview.Pairs {
		pairs[i] = api.LibraryClassLoanPair{
			StudentUserId: p.StudentUserID, StudentName: p.StudentName, TitleId: p.TitleID, CopyId: p.CopyID, Barcode: p.Barcode,
		}
	}
	rejected := make([]api.LibraryClassLoanRejected, len(preview.Rejected))
	for i, r := range preview.Rejected {
		rejected[i] = api.LibraryClassLoanRejected{StudentUserId: r.StudentUserID, StudentName: r.StudentName, Reason: r.Reason}
	}
	return api.PreviewLibraryClassLoans200JSONResponse{Pairs: pairs, Rejected: rejected}, nil
}

func (h *LibraryHandler) CommitLibraryClassLoans(ctx context.Context, request api.CommitLibraryClassLoansRequestObject) (api.CommitLibraryClassLoansResponseObject, error) {
	pairs := make([]service.ClassLoanPair, len(request.Body.Pairs))
	for i, p := range request.Body.Pairs {
		pairs[i] = service.ClassLoanPair{StudentUserID: p.StudentUserId, Barcode: p.Barcode}
	}
	result, err := h.service.CommitClassLoans(ctx, tenantID(ctx), pairs, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.CommitLibraryClassLoans200JSONResponse(toAPIBatchResult(result)), nil
}

func (h *LibraryHandler) CommitLibraryClassReturns(ctx context.Context, request api.CommitLibraryClassReturnsRequestObject) (api.CommitLibraryClassReturnsResponseObject, error) {
	b := request.Body
	result, err := h.service.ClassReturns(ctx, tenantID(ctx), b.ClassId, b.TitleId, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.CommitLibraryClassReturns200JSONResponse(toAPIBatchResult(result)), nil
}

func (h *LibraryHandler) SendLibraryDueReminders(ctx context.Context, _ api.SendLibraryDueRemindersRequestObject) (api.SendLibraryDueRemindersResponseObject, error) {
	n, err := h.service.SendDueReminders(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.SendLibraryDueReminders200JSONResponse{MembersNotified: n}, nil
}
