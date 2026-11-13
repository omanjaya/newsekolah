package announcements

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform"
	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/wiring"
)

// recordingNotifier remembers which tenants were notified of a publish.
type recordingNotifier struct{ tenants []uuid.UUID }

func (r *recordingNotifier) AnnouncementPublished(_ context.Context, tenantID uuid.UUID, _ []uuid.UUID, _ domain.Announcement) error {
	r.tenants = append(r.tenants, tenantID)
	return nil
}

// TestPublishDueSkipsTenantsWithAnnouncementsOff runs the scheduled-publish
// job over two tenants that each have an announcement past its start: the
// tenant with announcements turned off notifies nobody and holds its
// announcement back as a draft (it missed its slot), the other tenant's
// announcement is published and fanned out in the same run. Turning the
// module back on does not publish the missed one late.
func TestPublishDueSkipsTenantsWithAnnouncementsOff(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	q := db.New(pg.AdminPool)

	platformSvc := platform.Register(platform.Dependencies{Pool: pg.AppPool, Clock: clock.Real{}, Mode: config.TenancyMulti}).Service
	notifier := &recordingNotifier{}
	mod := Register(Dependencies{
		Pool: pg.AppPool, Notifier: notifier, Clock: clock.Real{},
		Flags: wiring.ModuleFlag{Flags: platformSvc, Module: platformdomain.ModuleAnnouncements},
	})

	seedScheduled := func(slug string) (tenantID, announcementID uuid.UUID) {
		t.Helper()
		tenant, err := q.CreateTenant(ctx, db.CreateTenantParams{
			Slug: slug, Name: slug, EducationLevel: "sma", Timezone: "UTC", Locale: "id", Status: "active", Plan: "default",
		})
		require.NoError(t, err)
		sender, err := q.CreateUser(ctx, db.CreateUserParams{
			TenantID: tenant.ID, Username: "sender-" + slug, PasswordHash: "x", Name: "Sender", Status: "active", Locale: "id",
		})
		require.NoError(t, err)
		startsAt := time.Now().UTC().Add(time.Hour)
		created, err := mod.Service.Create(ctx, tenant.ID, sender.ID, service.Input{
			Title: "Pengumuman Terjadwal", BodyHTML: "<p>Isi</p>", Audience: domain.Audience{Type: domain.AudienceAll}, StartsAt: &startsAt,
		})
		require.NoError(t, err)
		_, err = mod.Service.Schedule(ctx, tenant.ID, created.ID)
		require.NoError(t, err)
		// Its start has now passed, as the job would find it a little later.
		_, err = pg.AdminPool.Exec(ctx, `update announcements set starts_at = now() - interval '1 minute' where id = $1`, created.ID)
		require.NoError(t, err)
		return tenant.ID, created.ID
	}
	onTenant, onID := seedScheduled("announce-on-" + uuid.NewString()[:8])
	offTenant, offID := seedScheduled("announce-off-" + uuid.NewString()[:8])

	_, err := platformSvc.SetFlag(ctx, offTenant, string(platformdomain.ModuleAnnouncements), false)
	require.NoError(t, err)

	published, errs := mod.Service.PublishDue(ctx)
	require.Empty(t, errs)
	require.Equal(t, 1, published)
	require.Equal(t, []uuid.UUID{onTenant}, notifier.tenants, "only the tenant with announcements on is notified")

	status := func(id uuid.UUID) string {
		t.Helper()
		var s string
		require.NoError(t, pg.AdminPool.QueryRow(ctx, `select status from announcements where id = $1`, id).Scan(&s))
		return s
	}
	require.Equal(t, string(domain.StatusPublished), status(onID))
	require.Equal(t, string(domain.StatusDraft), status(offID), "missed while off: held back as a draft, not published")

	var startsAt time.Time
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select starts_at from announcements where id = $1`, offID).Scan(&startsAt))
	require.True(t, startsAt.Before(time.Now()), "its passed start is kept, which is what marks it as missed")

	// Switching the module back on does not publish it late.
	_, err = platformSvc.SetFlag(ctx, offTenant, string(platformdomain.ModuleAnnouncements), true)
	require.NoError(t, err)
	published, errs = mod.Service.PublishDue(ctx)
	require.Empty(t, errs)
	require.Zero(t, published)
	require.Equal(t, string(domain.StatusDraft), status(offID))
	require.Equal(t, []uuid.UUID{onTenant}, notifier.tenants, "nobody of the re-enabled tenant is notified")

	// Staff decide: rescheduling it into the future works as for any draft.
	_, err = pg.AdminPool.Exec(ctx, `update announcements set starts_at = now() + interval '1 hour' where id = $1`, offID)
	require.NoError(t, err)
	_, err = mod.Service.Schedule(ctx, offTenant, offID)
	require.NoError(t, err)
	require.Equal(t, string(domain.StatusScheduled), status(offID))
}
