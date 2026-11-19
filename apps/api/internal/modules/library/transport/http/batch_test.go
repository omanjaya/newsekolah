package http

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
)

func TestErrorCodeMapsDomainErrors(t *testing.T) {
	cases := map[error]string{
		domain.ErrMemberSuspended:    "LIBRARY_MEMBER_SUSPENDED",
		domain.ErrMemberNotActive:    "LIBRARY_MEMBER_NOT_ACTIVE",
		domain.ErrMemberHasTitle:     "LIBRARY_ALREADY_HAS_TITLE",
		domain.ErrNoCopyForClassLoan: "LIBRARY_NO_COPY_AVAILABLE",
		domain.ErrMemberNoExhausted:  "LIBRARY_MEMBER_NO_EXHAUSTED",
		errors.New("boom"):           "INTERNAL_ERROR",
	}
	for err, want := range cases {
		require.Equal(t, want, errorCode(err), err.Error())
	}
}

func TestToAPIBatchResultCarriesCode(t *testing.T) {
	out := toAPIBatchResult(context.Background(), service.BatchBorrowResult{
		Rejected: []service.RejectedBarcode{{Barcode: "BC-1", Err: domain.ErrCopyOnLoan}},
	})
	require.Len(t, out.Rejected, 1)
	require.Equal(t, "BC-1", out.Rejected[0].Barcode)
	require.Equal(t, "LIBRARY_COPY_ON_LOAN", out.Rejected[0].Code)
	require.Equal(t, domain.ErrCopyOnLoan.Error(), out.Rejected[0].Reason)
}

func TestToAPIBatchResultHidesInternalCause(t *testing.T) {
	out := toAPIBatchResult(context.Background(), service.BatchBorrowResult{
		Rejected: []service.RejectedBarcode{{Barcode: "BC-2", Err: errors.New("create loan: ERROR: deadlock (SQLSTATE 40P01)")}},
	})
	require.Len(t, out.Rejected, 1)
	require.Equal(t, "INTERNAL_ERROR", out.Rejected[0].Code)
	require.NotContains(t, out.Rejected[0].Reason, "SQLSTATE")
	require.NotEmpty(t, out.Rejected[0].Reason)
}

func TestToAPIBulkRegisterFailures(t *testing.T) {
	userID := uuid.New()
	out := toAPIBulkRegisterFailures(context.Background(), []service.FailedRegistration{
		{UserID: userID, UserName: "Citra", Err: domain.ErrMemberNoExhausted},
		{UserID: uuid.New(), UserName: "Dewi", Err: errors.New("create member: ERROR: boom (SQLSTATE XX000)")},
	})
	require.Len(t, out, 2)
	require.Equal(t, userID, out[0].UserId)
	require.Equal(t, "Citra", out[0].UserName)
	require.Equal(t, "LIBRARY_MEMBER_NO_EXHAUSTED", out[0].Code)
	require.Equal(t, "Dewi", out[1].UserName)
	require.Equal(t, "INTERNAL_ERROR", out[1].Code)
	require.NotContains(t, out[1].Reason, "SQLSTATE")
}
