package notifications

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// switchableFlags is a module flag reader the test turns modules off and on
// through, standing in for the platform's cached feature flags.
type switchableFlags struct{ off map[string]bool }

var _ service.ModuleFlagReader = (*switchableFlags)(nil)

func (f *switchableFlags) IsModuleEnabled(_ context.Context, _ uuid.UUID, module string) (bool, error) {
	return !f.off[module], nil
}

type fixedContacts struct{ email string }

func (c fixedContacts) EmailForUser(context.Context, uuid.UUID, uuid.UUID) (string, bool, error) {
	return c.email, true, nil
}

func (fixedContacts) PhoneNumberForUser(context.Context, uuid.UUID, uuid.UUID) (string, bool, error) {
	return "", false, nil
}

func notificationKinds(items []domain.Notification) []domain.Kind {
	kinds := make([]domain.Kind, len(items))
	for i, n := range items {
		kinds[i] = n.Kind
	}
	return kinds
}

// TestDisabledModuleNotificationsAreHidden covers what a school sees after
// switching a module off in the console: that module's notifications leave
// the inbox, the unread count and the daily digest (an explicit kind filter
// naming it finds nothing either) and mark-all-read leaves them alone, while
// notifications of always-on modules stay. Switching the module back on
// brings its rows back, still unread.
func TestDisabledModuleNotificationsAreHidden(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	// 00:30 UTC is 08:30 in Asia/Makassar: the user's digest hour below.
	now := time.Date(2026, 3, 10, 0, 30, 0, 0, time.UTC)

	tenant, err := db.New(pg.AdminPool).CreateTenant(ctx, db.CreateTenantParams{
		Slug: "notif-hidden", Name: "Notif Hidden", EducationLevel: "sma", Timezone: "Asia/Makassar", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	userID := uuid.New()
	for i, kind := range []domain.Kind{domain.KindAttendanceSubmitted, domain.KindAnnouncementPublished} {
		_, err = pg.AdminPool.Exec(ctx, `
			insert into notifications (tenant_id, user_id, kind, title, body, created_at)
			values ($1, $2, $3, $4, 'body', $5)`,
			tenant.ID, userID, string(kind), string(kind), now.Add(-time.Duration(i+1)*time.Hour))
		require.NoError(t, err)
	}
	_, err = pg.AdminPool.Exec(ctx, `
		insert into notification_settings (user_id, tenant_id, digest_enabled, digest_hour)
		values ($1, $2, true, 8)`, userID, tenant.ID)
	require.NoError(t, err)

	flags := &switchableFlags{off: map[string]bool{}}
	module := Register(Dependencies{
		Pool: pg.AppPool, Clock: clock.Frozen{At: now}, Contacts: fixedContacts{email: "user@example.com"}, Flags: flags,
	})
	svc := module.Service

	digestKinds := func() []domain.Kind {
		t.Helper()
		batches, err := svc.ComputeDueDigests(ctx)
		require.NoError(t, err)
		for _, b := range batches {
			if b.UserID == userID {
				return notificationKinds(b.Items)
			}
		}
		return nil
	}
	requireVisible := func(want ...domain.Kind) {
		t.Helper()
		page, err := svc.List(ctx, tenant.ID, userID, false, "", "", "", 0)
		require.NoError(t, err)
		require.Equal(t, want, notificationKinds(page.Items), "inbox")
		count, err := svc.UnreadCount(ctx, tenant.ID, userID)
		require.NoError(t, err)
		require.Equal(t, int64(len(want)), count, "unread count")
		require.Equal(t, want, digestKinds(), "digest")
	}

	requireVisible(domain.KindAttendanceSubmitted, domain.KindAnnouncementPublished)

	flags.off[domain.ModuleAnnouncements] = true
	requireVisible(domain.KindAttendanceSubmitted)
	page, err := svc.List(ctx, tenant.ID, userID, false, "", string(domain.KindAnnouncementPublished), "", 0)
	require.NoError(t, err)
	require.Empty(t, page.Items, "a kind filter naming a switched-off module finds nothing")

	require.NoError(t, svc.MarkAllRead(ctx, tenant.ID, userID))
	count, err := svc.UnreadCount(ctx, tenant.ID, userID)
	require.NoError(t, err)
	require.Zero(t, count)

	delete(flags.off, domain.ModuleAnnouncements)
	page, err = svc.List(ctx, tenant.ID, userID, false, "", "", "", 0)
	require.NoError(t, err)
	require.Equal(t, []domain.Kind{domain.KindAttendanceSubmitted, domain.KindAnnouncementPublished}, notificationKinds(page.Items),
		"the rows come back with the module")
	count, err = svc.UnreadCount(ctx, tenant.ID, userID)
	require.NoError(t, err)
	require.Equal(t, int64(1), count, "mark-all-read left the hidden announcement unread")
	require.Equal(t, []domain.Kind{domain.KindAnnouncementPublished}, digestKinds())
}

// TestNoFlagReaderHidesNothing covers a process wired without flags (the
// default): every notification stays visible.
func TestNoFlagReaderHidesNothing(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	tenant, err := db.New(pg.AdminPool).CreateTenant(ctx, db.CreateTenantParams{
		Slug: "notif-no-flags", Name: "Notif No Flags", EducationLevel: "sma", Timezone: "Asia/Makassar", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	userID := uuid.New()
	_, err = pg.AdminPool.Exec(ctx, `
		insert into notifications (tenant_id, user_id, kind, title, body)
		values ($1, $2, $3, 'title', 'body')`, tenant.ID, userID, string(domain.KindLibraryLoanDueReminder))
	require.NoError(t, err)

	svc := Register(Dependencies{Pool: pg.AppPool, Clock: clock.Real{}}).Service
	count, err := svc.UnreadCount(ctx, tenant.ID, userID)
	require.NoError(t, err)
	require.Equal(t, int64(1), count)
}
