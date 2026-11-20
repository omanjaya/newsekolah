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
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// countingNotifier counts the recipients notified per announcement.
type countingNotifier struct{ sent map[uuid.UUID]int }

func (c *countingNotifier) AnnouncementPublished(_ context.Context, _ uuid.UUID, recipients []uuid.UUID, a domain.Announcement) error {
	c.sent[a.ID] += len(recipients)
	return nil
}

// TestFutureStartNotifiesWhenVisible pins the announcement published with
// a "Tampil mulai" days ahead that notified everyone at publish time, while
// the feed rightly hid it until then: publishing notifies nobody while
// starts_at is ahead on the request's business clock, the periodic job
// (NotifyDue) notifies once starts_at has passed, exactly once, and an
// announcement published inside its window (here by a simulated clock past
// starts_at) is notified at publish as before.
func TestFutureStartNotifiesWhenVisible(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	q := db.New(pg.AdminPool)

	tenant, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "announce-notify-" + uuid.NewString()[:8], Name: "Announce Notify", EducationLevel: "sma",
		Timezone: "UTC", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	sender, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenant.ID, Username: "sender", PasswordHash: "x", Name: "Sender", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	_, err = q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenant.ID, Username: "reader", PasswordHash: "x", Name: "Reader", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	notifier := &countingNotifier{sent: map[uuid.UUID]int{}}
	mod := Register(Dependencies{Pool: pg.AppPool, Notifier: notifier, Clock: clock.Real{}})
	create := func(startsAt time.Time) uuid.UUID {
		t.Helper()
		created, err := mod.Service.Create(ctx, tenant.ID, sender.ID, service.Input{
			Title: "Pengumuman", BodyHTML: "<p>Isi</p>", Audience: domain.Audience{Type: domain.AudienceAll},
			StartsAt: &startsAt,
		})
		require.NoError(t, err)
		return created.ID
	}

	later := create(time.Now().UTC().AddDate(0, 0, 5))
	published, err := mod.Service.Publish(ctx, tenant.ID, later)
	require.NoError(t, err)
	require.Equal(t, domain.StatusPublished, published.Status)
	require.Equal(t, 2, published.RecipientCount)
	require.Zero(t, notifier.sent[later], "nobody is notified before the announcement is visible")

	notified, errs := mod.Service.NotifyDue(ctx)
	require.Empty(t, errs)
	require.Zero(t, notified, "starts_at is still ahead")

	// Its start passes, as the job would find it a few days later.
	_, err = pg.AdminPool.Exec(ctx, `update announcements set starts_at = now() - interval '1 minute' where id = $1`, later)
	require.NoError(t, err)
	notified, errs = mod.Service.NotifyDue(ctx)
	require.Empty(t, errs)
	require.Equal(t, 1, notified)
	require.Equal(t, 2, notifier.sent[later])

	notified, errs = mod.Service.NotifyDue(ctx)
	require.Empty(t, errs)
	require.Zero(t, notified, "a notified announcement is never notified again")
	require.Equal(t, 2, notifier.sent[later])

	// On a simulated day past starts_at the announcement is already
	// visible, so publishing notifies at once.
	startsAt := time.Now().UTC().AddDate(0, 0, 5)
	simulated := create(startsAt)
	_, err = mod.Service.Publish(clock.WithTime(ctx, startsAt.Add(time.Hour)), tenant.ID, simulated)
	require.NoError(t, err)
	require.Equal(t, 2, notifier.sent[simulated])
	notified, errs = mod.Service.NotifyDue(ctx)
	require.Empty(t, errs)
	require.Zero(t, notified)
}
