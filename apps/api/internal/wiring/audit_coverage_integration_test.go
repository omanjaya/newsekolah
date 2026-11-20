package wiring

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements"
	announcementsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/domain"
	announcementsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/service"
	integrationsrepository "github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/repository"
	integrationsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	schooldomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

type grantAll struct{}

func (grantAll) EffectivePermissions(context.Context, uuid.UUID, uuid.UUID) (authz.Set, error) {
	return authz.NewSet(authz.Codes()...), nil
}

// TestAdminMutationsAreAudited covers the admin actions the audit log used
// to miss: announcements through their life cycle, branding, a webhook
// endpoint and an API key each leave an entry in audit_logs, written in the
// same transaction as the change.
func TestAdminMutationsAreAudited(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	q := db.New(pg.AdminPool)

	tenantRow, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "audit-coverage-" + uuid.NewString()[:8], Name: "Audit School", EducationLevel: "sma",
		Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	admin, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantRow.ID, Username: "admin-" + uuid.NewString()[:8], PasswordHash: "x", Name: "Admin", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	tenantID := tenantRow.ID

	ann := announcements.Register(announcements.Dependencies{Pool: pg.AppPool, Clock: clock.Real{}}).Service
	draft, err := ann.Create(ctx, tenantID, admin.ID, announcementsservice.Input{
		Title: "Libur semester", BodyHTML: "<p>Mulai Senin</p>",
		Audience: announcementsdomain.Audience{Type: announcementsdomain.AudienceAll},
	})
	require.NoError(t, err)
	_, err = ann.Publish(ctx, tenantID, draft.ID)
	require.NoError(t, err)
	_, err = ann.Archive(ctx, tenantID, draft.ID)
	require.NoError(t, err)
	require.NoError(t, ann.Delete(ctx, tenantID, draft.ID))

	schoolSvc := school.Register(pg.AppPool, tenant.ModeSingle, nil).Service
	_, err = schoolSvc.UpdateBranding(ctx, tenantID, admin.ID, schooldomain.BrandingWrite{
		Name: "Audit School", ShortName: "AS", AccentColor: "#1d6f42",
	})
	require.NoError(t, err)

	sealer, err := crypto.NewSealer("test", "audit-coverage-secret-32-characters-min")
	require.NoError(t, err)
	repo := integrationsrepository.New(pg.AppPool)
	integrationsSvc := integrationsservice.New(pg.AppPool, repo, repo, grantAll{}, sealer, discardJobs{}, clock.Real{}, publicHost{})
	_, err = integrationsSvc.RegisterEndpoint(ctx, tenantID, admin.ID, integrationsservice.RegisterEndpointInput{
		URL: "https://example.com/hook", EventTypes: []string{integrationsservice.EventCatalog[0]},
	})
	require.NoError(t, err)
	key, err := integrationsSvc.CreateKey(ctx, tenantID, admin.ID, integrationsservice.CreateKeyInput{
		Name: "Dapodik", Permissions: []string{authz.PermViewAnnouncements},
	})
	require.NoError(t, err)
	_, err = integrationsSvc.RevokeKey(ctx, tenantID, key.Key.ID)
	require.NoError(t, err)

	rows, err := pg.AdminPool.Query(ctx, `select action, coalesce(after::text, '') from audit_logs where tenant_id = $1 order by id`, tenantID)
	require.NoError(t, err)
	defer rows.Close()
	var actions []string
	for rows.Next() {
		var action, after string
		require.NoError(t, rows.Scan(&action, &after))
		actions = append(actions, action)
		require.NotContains(t, after, key.Token, "an audit entry must never hold the API key token")
	}
	require.NoError(t, rows.Err())
	require.Equal(t, []string{
		"announcement.create", "announcement.publish", "announcement.archive", "announcement.delete",
		"tenant_branding.update",
		"webhook_endpoint.create", "api_key.create", "api_key.revoke",
	}, actions)
}
