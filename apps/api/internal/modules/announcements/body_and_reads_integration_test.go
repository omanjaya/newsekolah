package announcements

import (
	"context"
	"io/fs"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/migrations"
)

const multiParagraphBody = "<p>Seluruh warga sekolah wajib hadir.</p><p>Pakaian: seragam putih abu-abu.<br>Bawa topi &amp; air <strong>mi</strong>num.</p>"

// TestBodyTextKeepsWordBreaks pins the glued plain text ("hadir.Pakaian")
// that notifications, search and previews showed: paragraph and line
// breaks become spaces, while an inline tag inside a word does not split it.
func TestBodyTextKeepsWordBreaks(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	mod := Register(Dependencies{Pool: pg.AppPool, Notifier: &recordingNotifier{}, Clock: clock.Real{}})
	tenantID, senderID, _ := seedAnnouncementTenant(t, pg, 0)

	created, err := mod.Service.Create(ctx, tenantID, senderID, service.Input{
		Title: "Upacara", BodyHTML: multiParagraphBody, Audience: domain.Audience{Type: domain.AudienceAll},
	})
	require.NoError(t, err)
	require.Equal(t, "Seluruh warga sekolah wajib hadir. Pakaian: seragam putih abu-abu. Bawa topi & air minum.", created.BodyText)
	require.Contains(t, created.BodyHTML, "<br", "the stored HTML keeps its line break")
}

// TestMigrationRederivesGluedBodyText runs the announcement_body_text_breaks
// migration over a row stored by the old derivation and checks it gets the
// same text the service now writes. The file is found by its name, not its
// number, so renumbering it when parallel branches merge is a plain rename.
func TestMigrationRederivesGluedBodyText(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	mod := Register(Dependencies{Pool: pg.AppPool, Notifier: &recordingNotifier{}, Clock: clock.Real{}})
	tenantID, senderID, _ := seedAnnouncementTenant(t, pg, 0)
	created, err := mod.Service.Create(ctx, tenantID, senderID, service.Input{
		Title: "Upacara", BodyHTML: multiParagraphBody, Audience: domain.Audience{Type: domain.AudienceAll},
	})
	require.NoError(t, err)
	_, err = pg.AdminPool.Exec(ctx, `update announcements set body_text = 'Seluruh warga sekolah wajib hadir.Pakaian: seragam putih abu-abu.Bawa topi & air minum.' where id = $1`, created.ID)
	require.NoError(t, err)

	matches, err := fs.Glob(migrations.FS, "*_announcement_body_text_breaks.up.sql")
	require.NoError(t, err)
	require.Len(t, matches, 1)
	up, err := migrations.FS.ReadFile(matches[0])
	require.NoError(t, err)
	_, err = pg.AdminPool.Exec(ctx, string(up))
	require.NoError(t, err)

	var text string
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select body_text from announcements where id = $1`, created.ID).Scan(&text))
	require.Equal(t, created.BodyText, text)
}

// TestAdminListCarriesReadCounts pins the "read" column that always showed
// 0: every row of the admin list carries its read count.
func TestAdminListCarriesReadCounts(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	mod := Register(Dependencies{Pool: pg.AppPool, Notifier: &recordingNotifier{}, Clock: clock.Real{}})
	tenantID, senderID, readers := seedAnnouncementTenant(t, pg, 2)

	read, err := mod.Service.Create(ctx, tenantID, senderID, service.Input{
		Title: "Dibaca", BodyHTML: "<p>Isi</p>", Audience: domain.Audience{Type: domain.AudienceAll},
	})
	require.NoError(t, err)
	_, err = mod.Service.Publish(ctx, tenantID, read.ID)
	require.NoError(t, err)
	unread, err := mod.Service.Create(ctx, tenantID, senderID, service.Input{
		Title: "Belum dibaca", BodyHTML: "<p>Isi</p>", Audience: domain.Audience{Type: domain.AudienceAll},
	})
	require.NoError(t, err)
	_, err = mod.Service.Publish(ctx, tenantID, unread.ID)
	require.NoError(t, err)

	for _, reader := range readers {
		require.NoError(t, mod.Service.MarkRead(ctx, tenantID, reader, read.ID))
	}

	page, err := mod.Service.List(ctx, tenantID, "", "", 20)
	require.NoError(t, err)
	require.Len(t, page.Items, 2)
	require.Equal(t, int64(2), page.ReadCounts[read.ID])
	require.Equal(t, int64(0), page.ReadCounts[unread.ID])

	detail, err := mod.Service.Get(ctx, tenantID, read.ID)
	require.NoError(t, err)
	require.Equal(t, detail.ReadCount, page.ReadCounts[read.ID], "the list and the detail agree")
}

// TestEndsBeforeStartIsItsOwnError lets the API name the field at fault.
func TestEndsBeforeStartIsItsOwnError(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	mod := Register(Dependencies{Pool: pg.AppPool, Notifier: &recordingNotifier{}, Clock: clock.Real{}})
	tenantID, senderID, _ := seedAnnouncementTenant(t, pg, 0)
	starts := time.Date(2026, 11, 25, 0, 0, 0, 0, time.UTC)
	ends := time.Date(2026, 11, 22, 0, 0, 0, 0, time.UTC)

	_, err := mod.Service.Create(ctx, tenantID, senderID, service.Input{
		Title: "Jendela", BodyHTML: "<p>Isi</p>", Audience: domain.Audience{Type: domain.AudienceAll},
		StartsAt: &starts, EndsAt: &ends,
	})
	require.ErrorIs(t, err, domain.ErrEndsBeforeStart)
}

// seedAnnouncementTenant creates a tenant with a sender and n reader
// users, all active, so an "all" audience reaches the readers.
func seedAnnouncementTenant(t *testing.T, pg dbtest.Postgres, readers int) (tenantID, senderID uuid.UUID, readerIDs []uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	q := db.New(pg.AdminPool)
	slug := "announce-" + uuid.NewString()[:8]
	tenant, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: slug, Name: slug, EducationLevel: "sma", Timezone: "UTC", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	sender, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenant.ID, Username: "sender-" + slug, PasswordHash: "x", Name: "Sender", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	for i := 0; i < readers; i++ {
		u, err := q.CreateUser(ctx, db.CreateUserParams{
			TenantID: tenant.ID, Username: "reader-" + uuid.NewString()[:8], PasswordHash: "x", Name: "Reader", Status: "active", Locale: "id",
		})
		require.NoError(t, err)
		readerIDs = append(readerIDs, u.ID)
	}
	return tenant.ID, sender.ID, readerIDs
}
