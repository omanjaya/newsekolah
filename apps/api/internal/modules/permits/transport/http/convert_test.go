package http

import (
	"errors"
	"fmt"
	"net/http"
	"testing"
	"time"

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

func TestMapErrorExitPermitWindowClosed(t *testing.T) {
	// An existing permit refused at a stage scan, the gate QR or the gate
	// scan gets its own code, not the request form's "pick another period".
	var appErr *httpx.Error
	require.True(t, errors.As(mapError(domain.ErrExitPermitWindowClosed), &appErr))
	require.Equal(t, http.StatusUnprocessableEntity, appErr.Status)
	require.Equal(t, "EXIT_PERMIT_WINDOW_CLOSED", appErr.Code)

	require.True(t, errors.As(mapError(domain.ErrExitPermitPeriodPassed), &appErr))
	require.Equal(t, "EXIT_PERMIT_PERIOD_PASSED", appErr.Code)
}

func TestToAPITokenCountsDownTheBusinessClockTimeLeft(t *testing.T) {
	// A gate pass minted at a simulated 07:30 for a period ending 09:00:
	// ExpiresAt is on the simulated clock, months away from the real now,
	// so the countdown must come from ValidFor, not ExpiresAt minus now.
	periodEnd := time.Date(2027, 1, 18, 9, 0, 0, 0, time.UTC)
	out := toAPIToken(domain.IssueResult{
		Token:     domain.ScanToken{Purpose: domain.PurposeGateExit},
		RawValue:  "raw",
		ExpiresAt: periodEnd,
		ValidFor:  90 * time.Minute,
	})
	require.Equal(t, 5400, out.ExpiresInSeconds)
	require.True(t, out.ExpiresAt.Equal(periodEnd))
}
