package announcements

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestPublishedAnnouncementFollowsSimulatedPublishWindow proves GET
// /v1/me/announcements (service.ListForUser) decides a published
// announcement's visibility window (starts_at/ends_at) from the request's
// business time -- clock.Now(ctx, s.clock) -- instead of always the
// database server's now(). An announcement published immediately but
// scheduled to only become visible later (starts_at in the future) must
// stay hidden under the real clock and appear once a simulated time
// inside its window is attached to ctx, then disappear again past
// ends_at. The background "announcements.publish_scheduled" job
// (ListDueScheduled) that promotes draft->scheduled->published rows stays
// on the real clock regardless (docs/testing-time-simulation.md); this
// test only exercises the publish *window* of an already-published row,
// which is the part a reader-facing request actually resolves.
func TestPublishedAnnouncementFollowsSimulatedPublishWindow(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	q := db.New(pg.AdminPool)

	tenant, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "announce-sim", Name: "Announce Sim", EducationLevel: "sma",
		Timezone: "UTC", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	tenantID := tenant.ID

	sender, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantID, Username: "sender", PasswordHash: "x", Name: "Sender", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	reader, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantID, Username: "reader", PasswordHash: "x", Name: "Reader", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	mod := Register(Dependencies{Pool: pg.AppPool, Clock: clock.Real{}})

	startsAt := time.Now().UTC().AddDate(0, 0, 5)
	endsAt := startsAt.AddDate(0, 0, 3)
	created, err := mod.Service.Create(ctx, tenantID, sender.ID, service.Input{
		Title: "Pengumuman Simulasi", BodyHTML: "<p>Isi pengumuman</p>",
		Audience: domain.Audience{Type: domain.AudienceAll},
		StartsAt: &startsAt, EndsAt: &endsAt,
	})
	require.NoError(t, err)

	// Publish now: status becomes "published" immediately, but the
	// starts_at/ends_at window still gates visibility for readers.
	_, err = mod.Service.Publish(ctx, tenantID, created.ID)
	require.NoError(t, err)

	before, err := mod.Service.ListForUser(ctx, tenantID, reader.ID)
	require.NoError(t, err)
	require.Empty(t, before, "the real clock is before starts_at: the announcement must stay hidden")

	insideWindow := startsAt.AddDate(0, 0, 1)
	simCtx := clock.WithTime(ctx, insideWindow)
	visible, err := mod.Service.ListForUser(simCtx, tenantID, reader.ID)
	require.NoError(t, err)
	require.Len(t, visible, 1, "a simulated time inside the publish window must reveal the announcement")
	require.Equal(t, created.ID, visible[0].Announcement.ID)

	afterWindow := endsAt.AddDate(0, 0, 1)
	simCtxAfter := clock.WithTime(ctx, afterWindow)
	afterVisible, err := mod.Service.ListForUser(simCtxAfter, tenantID, reader.ID)
	require.NoError(t, err)
	require.Empty(t, afterVisible, "a simulated time past ends_at must hide the announcement again")

	stillHidden, err := mod.Service.ListForUser(ctx, tenantID, reader.ID)
	require.NoError(t, err)
	require.Empty(t, stillHidden, "a request with no simulated time attached must keep using the real clock")
}
