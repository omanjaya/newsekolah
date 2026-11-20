package billing

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
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

// TestGenerationDueDateFollowsBusinessClock pins the bills generated in a
// simulated March 2027 that fell due on the real calendar (real today plus
// ten days) and so showed overdue the moment they were issued: the due
// date counts from the school's local day on the business clock. The
// simulated instant is 17:00 UTC on 1 March, already 2 March in the
// fixture's Asia/Jakarta, so a UTC reading would also be one day early.
func TestGenerationDueDateFollowsBusinessClock(t *testing.T) {
	pg := dbtest.Start(t)
	mod := newTestBillingModule(pg.AppPool)
	fx := seedBillingFixture(t, pg.AdminPool, mod)
	ctx := clock.WithTime(context.Background(), time.Date(2027, 3, 1, 17, 0, 0, 0, time.UTC))

	preview, err := mod.Service.PreviewGeneration(ctx, fx.tenantID, "2027-03")
	require.NoError(t, err)
	require.Len(t, preview.Created, 1)
	require.Equal(t, "2027-03-12", preview.Created[0].DueDate.Format(time.DateOnly), "preview due date")

	run, err := mod.Service.GenerateBills(ctx, fx.tenantID, fx.staffID, "2027-03")
	require.NoError(t, err)
	require.Len(t, run.Created, 1)
	stored, err := mod.Service.GetBill(ctx, fx.tenantID, run.Created[0].ID)
	require.NoError(t, err)
	require.Equal(t, "2027-03-12", stored.DueDate.Format(time.DateOnly), "stored due date")
}
