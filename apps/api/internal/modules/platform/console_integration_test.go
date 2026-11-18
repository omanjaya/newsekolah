package platform

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

func createConsoleTenant(t *testing.T, pg dbtest.Postgres, slug string) uuid.UUID {
	t.Helper()
	tenant, err := db.New(pg.AdminPool).CreateTenant(context.Background(), db.CreateTenantParams{
		Slug: slug, Name: slug, EducationLevel: "sma", Timezone: "Asia/Makassar", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	return tenant.ID
}

func requireAllModules(t *testing.T, flags []domain.ModuleFlag, disabled ...string) {
	t.Helper()
	off := make(map[string]bool, len(disabled))
	for _, m := range disabled {
		off[m] = true
	}
	require.Len(t, flags, len(domain.AllModules))
	for i, f := range flags {
		require.Equal(t, string(domain.AllModules[i]), f.Module)
		require.Equal(t, !off[f.Module], f.Enabled, f.Module)
	}
}

// TestSingleModeConsoleScopedToOwnTenant covers the console in
// TENANCY_MODE=single, how production runs: the superadmin sees the
// deployment's own school, lists and toggles all of its modules (each
// change still notifies the flag cache), and every other tenant row stays
// out of reach, while the multi-tenant-only actions keep refusing.
func TestSingleModeConsoleScopedToOwnTenant(t *testing.T) {
	pg := dbtest.Start(t)
	own := createConsoleTenant(t, pg, "single-own")
	other := createConsoleTenant(t, pg, "single-other")
	svc := Register(Dependencies{Pool: pg.AppPool, Clock: clock.Real{}, Mode: config.TenancySingle}).Service
	var notified []uuid.UUID
	svc.OnFlagChanged(func(id uuid.UUID) { notified = append(notified, id) })
	ctx := service.WithRequestTenant(context.Background(), own)

	tenants, err := svc.ListTenants(ctx)
	require.NoError(t, err)
	require.Len(t, tenants, 1, "only the deployment's own school is listed")
	require.Equal(t, own, tenants[0].ID)

	flags, err := svc.ListFlags(ctx, own)
	require.NoError(t, err)
	requireAllModules(t, flags)

	flag, err := svc.SetFlag(ctx, own, string(domain.ModuleVisitors), false)
	require.NoError(t, err)
	require.Equal(t, domain.ModuleFlag{Module: "visitors", Enabled: false}, flag)
	require.Equal(t, []uuid.UUID{own}, notified)

	flags, err = svc.ListFlags(ctx, own)
	require.NoError(t, err)
	requireAllModules(t, flags, "visitors")

	detail, err := svc.GetTenantDetail(ctx, own)
	require.NoError(t, err)
	require.Equal(t, own, detail.ID)
	requireAllModules(t, detail.Flags, "visitors")

	_, err = svc.GetTenantDetail(ctx, other)
	require.ErrorIs(t, err, domain.ErrTenantNotFound)
	_, err = svc.ListFlags(ctx, other)
	require.ErrorIs(t, err, domain.ErrTenantNotFound)
	_, err = svc.SetFlag(ctx, other, string(domain.ModuleVisitors), false)
	require.ErrorIs(t, err, domain.ErrTenantNotFound)
	stored, err := svc.StoredFlags(context.Background(), other)
	require.NoError(t, err)
	require.Empty(t, stored, "a refused SetFlag writes nothing for the other tenant")
	require.Len(t, notified, 1)

	_, err = svc.SuspendTenant(ctx, own)
	require.ErrorIs(t, err, domain.ErrTenancyDisabled)
	_, err = svc.UpdateTenantDomain(ctx, own, "school.example.com")
	require.ErrorIs(t, err, domain.ErrTenancyDisabled)
	_, err = svc.RequestExport(ctx, own)
	require.ErrorIs(t, err, domain.ErrTenancyDisabled)
}

// TestGetTenantDetailReturnsEffectiveFlags covers the detail panel's flags:
// one entry per toggleable module in AllModules order whatever is stored,
// the opt-out default filled in, and a stored row for a module the console
// does not know dropped.
func TestGetTenantDetailReturnsEffectiveFlags(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	tenantID := createConsoleTenant(t, pg, "detail-flags")
	svc := newTestPlatformModule(t, pg.AppPool).Service

	detail, err := svc.GetTenantDetail(ctx, tenantID)
	require.NoError(t, err)
	requireAllModules(t, detail.Flags)

	_, err = pg.AdminPool.Exec(ctx, `
		insert into feature_flags (tenant_id, module, enabled)
		values ($1, 'library', false), ($1, 'legacy_x', false)`, tenantID)
	require.NoError(t, err)

	detail, err = svc.GetTenantDetail(ctx, tenantID)
	require.NoError(t, err)
	requireAllModules(t, detail.Flags, "library")
	for _, f := range detail.Flags {
		require.NotEqual(t, "legacy_x", f.Module, "an unknown stored module never leaves the service")
	}
}
