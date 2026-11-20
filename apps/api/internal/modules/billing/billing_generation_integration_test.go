package billing

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestGenerationPreviewCountsAlreadyBilled pins the preview bug where a
// one-off fee already billed was offered again as a new bill, and
// "already billed" always read 0: after a run, previewing the same month
// (or another month, for the one-off fee) offers nothing new and counts
// every existing bill as already billed.
func TestGenerationPreviewCountsAlreadyBilled(t *testing.T) {
	pg := dbtest.Start(t)
	mod := newTestBillingModule(pg.AppPool)
	fx := seedBillingFixture(t, pg.AdminPool, mod) // monthly SPP, one student, billed for 2026-07
	ctx := context.Background()

	_, err := mod.Service.CreateFeeType(ctx, domain.FeeType{
		TenantID: fx.tenantID, Name: "Class meeting", AmountMinor: 75000,
		Recurrence: domain.RecurrenceOneOff, Period: "2026-classmeeting",
	}, fx.staffID)
	require.NoError(t, err)

	preview, err := mod.Service.PreviewGeneration(ctx, fx.tenantID, "2026-07")
	require.NoError(t, err)
	require.Len(t, preview.Created, 1, "only the one-off fee is new for July")
	require.Equal(t, "2026-classmeeting", preview.Created[0].Period)
	require.Equal(t, 1, preview.Skipped, "July's SPP bill counts as already billed")

	run, err := mod.Service.GenerateBills(ctx, fx.tenantID, fx.staffID, "2026-07")
	require.NoError(t, err)
	require.Len(t, run.Created, 1)
	require.Equal(t, 1, run.Skipped)

	again, err := mod.Service.PreviewGeneration(ctx, fx.tenantID, "2026-07")
	require.NoError(t, err)
	require.Empty(t, again.Created, "nothing is new after the run")
	require.Equal(t, 2, again.Skipped)

	rerun, err := mod.Service.GenerateBills(ctx, fx.tenantID, fx.staffID, "2026-07")
	require.NoError(t, err)
	require.Empty(t, rerun.Created)
	require.Equal(t, 2, rerun.Skipped)

	august, err := mod.Service.PreviewGeneration(ctx, fx.tenantID, "2026-08")
	require.NoError(t, err)
	require.Len(t, august.Created, 1, "August only bills the monthly SPP")
	require.Equal(t, "2026-08", august.Created[0].Period)
	require.Equal(t, 1, august.Skipped, "the one-off fee stays billed in later months")
}
