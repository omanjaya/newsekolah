package http

import (
	"errors"
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func TestMapErrorTemplateInvalid(t *testing.T) {
	// The service wraps the parser's message around the sentinel.
	err := fmt.Errorf("%w: template: document:1: unclosed action", domain.ErrTemplateInvalid)

	var appErr *httpx.Error
	require.True(t, errors.As(mapError(err), &appErr))
	require.Equal(t, http.StatusUnprocessableEntity, appErr.Status)
	require.Equal(t, "TEMPLATE_INVALID", appErr.Code)
}

func TestMapErrorStageVerificationMismatch(t *testing.T) {
	var appErr *httpx.Error
	require.True(t, errors.As(mapError(domain.ErrStageVerificationMismatch), &appErr))
	require.Equal(t, http.StatusConflict, appErr.Status)
	require.Equal(t, "WORKFLOW_STAGE_MISMATCH", appErr.Code)
}

// An approver who already approved a stage the current one must be
// distinct from gets a code of its own, not the QR scan's "not eligible".
func TestMapErrorApproverNotDistinct(t *testing.T) {
	var appErr *httpx.Error
	require.True(t, errors.As(mapError(domain.ErrApproverNotDistinct), &appErr))
	require.Equal(t, http.StatusForbidden, appErr.Status)
	require.Equal(t, "WORKFLOW_APPROVER_NOT_DISTINCT", appErr.Code)
}
