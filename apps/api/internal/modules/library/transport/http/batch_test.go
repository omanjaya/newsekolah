package http

import (
	"errors"
	"testing"

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
	out := toAPIBatchResult(service.BatchBorrowResult{
		Rejected: []service.RejectedBarcode{{Barcode: "BC-1", Err: domain.ErrCopyOnLoan}},
	})
	require.Len(t, out.Rejected, 1)
	require.Equal(t, "BC-1", out.Rejected[0].Barcode)
	require.Equal(t, "LIBRARY_COPY_ON_LOAN", out.Rejected[0].Code)
	require.Equal(t, domain.ErrCopyOnLoan.Error(), out.Rejected[0].Reason)
}
