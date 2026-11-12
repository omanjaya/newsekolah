package platform

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestSetFlagNotifiesFlagChangeObserverAndStoredFlagsReflectsIt covers the
// two service hooks the wiring-level flag cache relies on: StoredFlags
// returns the explicit rows, and a successful SetFlag tells the registered
// observer which tenant changed.
func TestSetFlagNotifiesFlagChangeObserverAndStoredFlagsReflectsIt(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	tenant, err := db.New(pg.AdminPool).CreateTenant(ctx, db.CreateTenantParams{
		Slug: "flags-tenant", Name: "Flags", EducationLevel: "sma", Timezone: "Asia/Makassar", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	svc := newTestPlatformModule(t, pg.AppPool).Service

	var changed []uuid.UUID
	svc.OnFlagChanged(func(id uuid.UUID) { changed = append(changed, id) })

	flags, err := svc.StoredFlags(ctx, tenant.ID)
	require.NoError(t, err)
	require.Empty(t, flags, "no rows means every module runs (opt-out)")

	_, err = svc.SetFlag(ctx, tenant.ID, "library", false)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{tenant.ID}, changed)

	flags, err = svc.StoredFlags(ctx, tenant.ID)
	require.NoError(t, err)
	require.Equal(t, map[string]bool{"library": false}, flags)

	_, err = svc.SetFlag(ctx, tenant.ID, "not_a_module", false)
	require.Error(t, err)
	require.Len(t, changed, 1, "a failed SetFlag must not notify the observer")
}
