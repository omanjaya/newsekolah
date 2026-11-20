package http

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// TestPreviewDayIsTenantLocalDay: the report header preview signed at
// 23:30 UTC on 19 November shows 20 November for an Asia/Makassar school
// (07:30 local), and follows the simulated business clock the same way.
func TestPreviewDayIsTenantLocalDay(t *testing.T) {
	frozen := clock.Frozen{At: time.Date(2026, 11, 19, 23, 30, 0, 0, time.UTC)}
	ctx := tenant.WithTenant(context.Background(), tenant.Tenant{ID: uuid.New(), Timezone: "Asia/Makassar"})

	require.Equal(t, time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC), previewDay(ctx, frozen))

	sim := clock.WithTime(ctx, time.Date(2027, 1, 31, 16, 0, 0, 0, time.UTC))
	require.Equal(t, time.Date(2027, 2, 1, 0, 0, 0, 0, time.UTC), previewDay(sim, frozen))

	// Without a tenant on the context the UTC day is used.
	require.Equal(t, time.Date(2026, 11, 19, 0, 0, 0, 0, time.UTC), previewDay(context.Background(), frozen))
}
