package wiring

import (
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"

	librarydomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	permitsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

// TestTranslateLibraryTokenError covers the visit kiosk scan: a reused,
// expired, unknown or foreign QR comes back from the permits scan-token
// pipeline with permits' own errors, which the library HTTP layer does not
// know and used to answer with a 500.
func TestTranslateLibraryTokenError(t *testing.T) {
	for _, tokenErr := range []error{
		permitsdomain.ErrTokenNotFound, permitsdomain.ErrTokenExpired, permitsdomain.ErrTokenConsumed,
		permitsdomain.ErrTokenPurposeMismatch, permitsdomain.ErrTokenContextMismatch,
	} {
		got := translateLibraryTokenError(fmt.Errorf("consume: %w", tokenErr))
		require.ErrorIs(t, got, librarydomain.ErrKioskTokenInvalid, tokenErr.Error())
	}

	require.NoError(t, translateLibraryTokenError(nil))
	other := errors.New("database down")
	require.ErrorIs(t, translateLibraryTokenError(other), other, "an unrelated failure is passed through unchanged")
}
