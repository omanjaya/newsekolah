package platform

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
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
	require.Len(t, changed, 1, "a failed SetFlag must not notify the flag cache")
}

type flagAuditRow struct {
	TenantID    uuid.NullUUID
	ActorUserID uuid.NullUUID
	Action      string
	EntityType  string
	EntityID    uuid.NullUUID
	Before      string
	After       string
	IP          string
}

func flagAuditRows(t *testing.T, pg dbtest.Postgres, tenantID uuid.UUID) []flagAuditRow {
	t.Helper()
	rows, err := pg.AdminPool.Query(context.Background(), `
		select tenant_id, actor_user_id, action, entity_type, entity_id, before::text, after::text, coalesce(host(ip), '')
		from audit_logs where entity_type = 'feature_flag' and entity_id = $1
		order by id`, tenantID)
	require.NoError(t, err)
	defer rows.Close()
	var out []flagAuditRow
	for rows.Next() {
		var r flagAuditRow
		require.NoError(t, rows.Scan(&r.TenantID, &r.ActorUserID, &r.Action, &r.EntityType, &r.EntityID, &r.Before, &r.After, &r.IP))
		out = append(out, r)
	}
	require.NoError(t, rows.Err())
	return out
}

// TestSetFlagWritesAuditEntryForEveryChange covers the platform console's
// flag change audit: each change writes one tenant-scoped row naming the
// console caller, the module, and its effective value before and after (a
// module with no stored row counts as enabled before), in the same shape
// the operator CLI writes; a call that leaves the value as it was writes
// none but still notifies the flag cache, and a refused call writes none.
func TestSetFlagWritesAuditEntryForEveryChange(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	q := db.New(pg.AdminPool)
	tenant, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "flags-audit", Name: "Flags Audit", EducationLevel: "sma", Timezone: "Asia/Makassar", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	svc := newTestPlatformModule(t, pg.AppPool).Service
	var notified int
	svc.OnFlagChanged(func(uuid.UUID) { notified++ })

	operatorID := uuid.New()
	console := httpx.WithRequestMeta(httpx.WithUserID(ctx, operatorID), httpx.RequestMeta{IP: "203.0.113.7"})

	_, err = svc.SetFlag(console, tenant.ID, "discipline", false)
	require.NoError(t, err)
	_, err = svc.SetFlag(console, tenant.ID, "discipline", false)
	require.NoError(t, err, "setting the value it already has succeeds")
	_, err = svc.SetFlag(console, tenant.ID, "discipline", true)
	require.NoError(t, err)
	_, err = svc.SetFlag(console, tenant.ID, "billing", true)
	require.NoError(t, err, "turning on a module that has no row (already on) is a no-op for the audit")
	_, err = svc.SetFlag(console, tenant.ID, "not_a_module", false)
	require.Error(t, err)
	require.Equal(t, 4, notified, "every successful SetFlag still notifies the flag cache")

	rows := flagAuditRows(t, pg, tenant.ID)
	require.Len(t, rows, 2, "only the two calls that changed a value are audited")
	want := []struct{ before, after string }{
		{`{"module": "discipline", "enabled": true}`, `{"module": "discipline", "enabled": false}`},
		{`{"module": "discipline", "enabled": false}`, `{"module": "discipline", "enabled": true}`},
	}
	for i, r := range rows {
		require.Equal(t, uuid.NullUUID{UUID: tenant.ID, Valid: true}, r.TenantID, "the row belongs to the tenant whose flag changed")
		require.Equal(t, uuid.NullUUID{UUID: operatorID, Valid: true}, r.ActorUserID, "the console caller is the actor")
		require.Equal(t, "feature_flag.update", r.Action)
		require.Equal(t, "feature_flag", r.EntityType)
		require.Equal(t, uuid.NullUUID{UUID: tenant.ID, Valid: true}, r.EntityID)
		require.JSONEq(t, want[i].before, r.Before)
		require.JSONEq(t, want[i].after, r.After)
		require.Equal(t, "203.0.113.7", r.IP)
	}
}
