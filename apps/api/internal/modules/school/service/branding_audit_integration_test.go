package service_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

type brandingAuditEntry struct {
	Before map[string]any
	After  map[string]any
}

func brandingAuditEntries(t *testing.T, pool *pgxpool.Pool, tenantID uuid.UUID, action string) []brandingAuditEntry {
	t.Helper()
	rows, err := pool.Query(context.Background(),
		`select coalesce(before::text, 'null'), coalesce(after::text, 'null') from audit_logs
		 where tenant_id = $1 and action = $2 order by id`, tenantID, action)
	require.NoError(t, err)
	defer rows.Close()
	var out []brandingAuditEntry
	for rows.Next() {
		var before, after string
		require.NoError(t, rows.Scan(&before, &after))
		var e brandingAuditEntry
		require.NoError(t, json.Unmarshal([]byte(before), &e.Before))
		require.NoError(t, json.Unmarshal([]byte(after), &e.After))
		out = append(out, e)
	}
	require.NoError(t, rows.Err())
	return out
}

// TestUpdateBrandingAuditsBeforeAndAfter is admin-settings-R1's
// regression test: the tenant_branding.update entry records what each
// changed field was before, lists only the fields that changed, and a
// save that changes nothing leaves no entry.
func TestUpdateBrandingAuditsBeforeAndAfter(t *testing.T) {
	pg := dbtest.Start(t)
	tenantID := insertReportHeaderTestTenant(t, pg.AdminPool, "branding-audit-"+uuid.NewString()[:8])
	actorID := uuid.New()
	svc := newReportHeaderService(pg)
	ctx := context.Background()

	// First save: the name was the tenant's own and the colour the default.
	_, err := svc.UpdateBranding(ctx, tenantID, actorID, domain.BrandingWrite{
		Name: "SMA Contoh", AccentColor: "#1F3A60",
	})
	require.NoError(t, err)

	// Only the colour changes; a different case of the same colour and
	// the untouched name are not changes.
	_, err = svc.UpdateBranding(ctx, tenantID, actorID, domain.BrandingWrite{
		Name: "SMA Contoh", AccentColor: "#1F3A5F",
	})
	require.NoError(t, err)
	_, err = svc.UpdateBranding(ctx, tenantID, actorID, domain.BrandingWrite{
		Name: "SMA Contoh", AccentColor: "#1f3a5f",
	})
	require.NoError(t, err)

	entries := brandingAuditEntries(t, pg.AdminPool, tenantID, "tenant_branding.update")
	require.Len(t, entries, 2, "a save that changes nothing is not audited")
	require.Equal(t, map[string]any{
		"branding.name": "Test School", "branding.accent_color": domain.DefaultAccentColor,
	}, entries[0].Before)
	require.Equal(t, map[string]any{
		"branding.name": "SMA Contoh", "branding.accent_color": "#1F3A60",
	}, entries[0].After)
	require.Equal(t, map[string]any{"branding.accent_color": "#1F3A60"}, entries[1].Before)
	require.Equal(t, map[string]any{"branding.accent_color": "#1F3A5F"}, entries[1].After)
}

// TestConfirmLogoUploadAuditsReplacedObject: a second logo upload's
// audit entry names the object it replaced; the first has none.
func TestConfirmLogoUploadAuditsReplacedObject(t *testing.T) {
	pg := dbtest.Start(t)
	tenantID := insertReportHeaderTestTenant(t, pg.AdminPool, "branding-logo-audit-"+uuid.NewString()[:8])
	actorID := uuid.New()
	st := newMemStorage("test-bucket")
	svc := newBrandingUploadService(pg, st)
	ctx := context.Background()

	upload := func() string {
		target, err := svc.RequestLogoUpload(ctx, tenantID)
		require.NoError(t, err)
		st.clientUploads(target.ObjectKey, onePixelPNG(t))
		_, err = svc.ConfirmLogoUpload(ctx, tenantID, actorID, target.ObjectKey)
		require.NoError(t, err)
		return target.ObjectKey
	}
	first := upload()
	second := upload()

	entries := brandingAuditEntries(t, pg.AdminPool, tenantID, "tenant_branding.logo_update")
	require.Len(t, entries, 2)
	require.Nil(t, entries[0].Before)
	require.Equal(t, first, entries[0].After["object_key"])
	require.Equal(t, map[string]any{"object_key": first, "mime": "image/png"}, entries[1].Before)
	require.Equal(t, second, entries[1].After["object_key"])
}
