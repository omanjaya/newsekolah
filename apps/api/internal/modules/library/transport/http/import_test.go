package http

import (
	"errors"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// A commit that fails on one row keeps the row's own error code and names
// the row, so the import page can say which row to fix.
func TestImportCommitErrorNamesTheRow(t *testing.T) {
	err := importCommitError(&domain.ImportRowError{Row: 5, Err: domain.ErrCopyBarcodeExists})
	var appErr *httpx.Error
	require.True(t, errors.As(err, &appErr))
	require.Equal(t, "LIBRARY_COPY_BARCODE_EXISTS", appErr.Code)
	require.Equal(t, http.StatusConflict, appErr.Status)
	require.Equal(t, []httpx.ErrorDetail{{Field: "row_number", Code: "5"}}, appErr.Details)
	require.Empty(t, httpx.ErrLibraryCopyBarcodeExists.Details, "the shared sentinel stays untouched")

	// A failure that is not tied to a row maps as before.
	err = importCommitError(domain.ErrModuleDisabled)
	require.True(t, errors.As(err, &appErr))
	require.Empty(t, appErr.Details)

	// An unexpected error stays a generic 500 without row details.
	err = importCommitError(&domain.ImportRowError{Row: 2, Err: errors.New("boom")})
	require.True(t, errors.As(err, &appErr))
	require.Equal(t, "INTERNAL_ERROR", appErr.Code)
	require.Empty(t, appErr.Details)
}
