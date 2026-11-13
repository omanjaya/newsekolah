package platform

import (
	"context"
	"errors"
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

// TestOperatorFlagMethodsWorkInSingleTenantMode covers the operator-tooling
// path cmd/modules uses: it works where the console path is refused
// (TENANCY_MODE=single, which keeps the console guarded), rejects a list
// containing an unknown module without writing any of it, skips modules
// already in the requested state, and audits only actual changes.
func TestOperatorFlagMethodsWorkInSingleTenantMode(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	tenant, err := db.New(pg.AdminPool).CreateTenant(ctx, db.CreateTenantParams{
		Slug: "operator-flags", Name: "Operator Flags", EducationLevel: "sma", Timezone: "Asia/Makassar", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	svc := Register(Dependencies{Pool: pg.AppPool, Clock: clock.Real{}, Mode: config.TenancySingle}).Service

	_, err = svc.ListFlags(ctx, tenant.ID)
	require.ErrorIs(t, err, domain.ErrTenancyDisabled, "the console path stays guarded")
	_, err = svc.SetFlag(ctx, tenant.ID, "library", false)
	require.ErrorIs(t, err, domain.ErrTenancyDisabled, "the console path stays guarded")

	var notified []uuid.UUID
	svc.OnFlagChanged(func(id uuid.UUID) { notified = append(notified, id) })

	_, err = svc.SetFlagsForOperator(ctx, tenant.ID, []string{"library", "nope", "Grading"}, false)
	require.ErrorIs(t, err, domain.ErrUnknownModule)
	var unknown *service.OperatorUnknownModulesError
	require.True(t, errors.As(err, &unknown))
	require.Equal(t, []string{"nope", "Grading"}, unknown.Names)
	stored, err := svc.StoredFlags(ctx, tenant.ID)
	require.NoError(t, err)
	require.Empty(t, stored, "a rejected list writes none of its valid names either")
	require.Empty(t, notified)
	require.Equal(t, 0, countOperatorFlagAudits(t, pg, tenant.ID))

	changes, err := svc.SetFlagsForOperator(ctx, tenant.ID, []string{"library", "grading", "library"}, false)
	require.NoError(t, err)
	require.Equal(t, []service.OperatorFlagChange{
		{Module: "library", Before: true, After: false, Changed: true},
		{Module: "grading", Before: true, After: false, Changed: true},
	}, changes)
	require.Equal(t, []uuid.UUID{tenant.ID}, notified)
	require.Equal(t, 2, countOperatorFlagAudits(t, pg, tenant.ID))

	flags, err := svc.ListFlagsForOperator(ctx, tenant.ID)
	require.NoError(t, err)
	require.Len(t, flags, len(domain.AllModules))
	for i, f := range flags {
		require.Equal(t, string(domain.AllModules[i]), f.Module)
		require.Equal(t, f.Module != "library" && f.Module != "grading", f.Enabled, f.Module)
	}

	changes, err = svc.SetFlagsForOperator(ctx, tenant.ID, []string{"library"}, false)
	require.NoError(t, err)
	require.Equal(t, []service.OperatorFlagChange{{Module: "library", Before: false, After: false, Changed: false}}, changes)
	require.Len(t, notified, 1, "a no-op must not notify the flag cache")
	require.Equal(t, 2, countOperatorFlagAudits(t, pg, tenant.ID), "a no-op writes no audit row")

	_, err = svc.ListFlagsForOperator(ctx, uuid.New())
	require.ErrorIs(t, err, domain.ErrTenantNotFound)
	_, err = svc.SetFlagsForOperator(ctx, uuid.New(), []string{"library"}, false)
	require.ErrorIs(t, err, domain.ErrTenantNotFound)
}

func countOperatorFlagAudits(t *testing.T, pg dbtest.Postgres, tenantID uuid.UUID) int {
	t.Helper()
	var n int
	require.NoError(t, pg.AdminPool.QueryRow(context.Background(),
		`select count(*) from audit_logs where tenant_id = $1 and entity_type = 'feature_flag'`, tenantID).Scan(&n))
	return n
}
