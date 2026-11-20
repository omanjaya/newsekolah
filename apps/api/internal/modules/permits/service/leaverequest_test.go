package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

// TestSubmitLeaveRequestRequiresReasonOnlyForOther checks the refusal
// happens before anything is written: the Service has no pool, so
// reaching the transaction would panic.
func TestSubmitLeaveRequestRequiresReasonOnlyForOther(t *testing.T) {
	day := time.Date(2026, time.November, 23, 0, 0, 0, 0, time.UTC)
	svc := &Service{}

	for _, reason := range []string{"", "   "} {
		_, err := svc.SubmitLeaveRequest(context.Background(), SubmitLeaveRequestInput{
			TenantID: uuid.New(), Category: domain.CategoryOther, Reason: reason, StartsOn: day, EndsOn: day,
		})
		require.ErrorIs(t, err, domain.ErrLeaveReasonRequired, "reason %q", reason)
	}
}
