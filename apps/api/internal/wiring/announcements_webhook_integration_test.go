package wiring

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements"
	announcementsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/domain"
	announcementsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations"
	integrationsrepository "github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/repository"
	integrationsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
)

// discardJobs accepts every enqueue without running anything: the test
// only checks the rows written in the publishing transaction.
type discardJobs struct{}

func (discardJobs) InsertTx(context.Context, pgx.Tx, river.JobArgs, *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	return &rivertype.JobInsertResult{Job: &rivertype.JobRow{}}, nil
}

type publicHost struct{}

func (publicHost) LookupIPs(context.Context, string) ([]string, error) {
	return []string{"93.184.216.34"}, nil
}

// TestAnnouncementPublishReachesWebhooks proves publishing an announcement
// puts announcement.published on the bus, so an endpoint subscribed to it
// gets a pending delivery (it was offered in the catalogue but never fired).
func TestAnnouncementPublishReachesWebhooks(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	q := db.New(pg.AdminPool)

	tenantRow, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "announce-webhook-" + uuid.NewString()[:8], Name: "Webhook School", EducationLevel: "sma",
		Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	sender, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantRow.ID, Username: "guru-" + uuid.NewString()[:8], PasswordHash: "x", Name: "Guru", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	bus := events.NewBus()
	notificationsModule := notifications.Register(notifications.Dependencies{Pool: pg.AppPool, Jobs: discardJobs{}, Clock: clock.Real{}})
	sealer, err := crypto.NewSealer("test", "announce-webhook-secret-32-characters-min")
	require.NoError(t, err)
	integrations.Register(integrations.Dependencies{
		Pool: pg.AppPool, Bus: bus, Sealer: sealer, Jobs: discardJobs{}, Clock: clock.Real{},
	})
	announcementsModule := announcements.Register(announcements.Dependencies{
		Pool: pg.AppPool, Notifier: AnnouncementNotifier{Svc: notificationsModule.Service, Bus: bus}, Clock: clock.Real{},
	})

	// Register through a service built with a fake resolver so the test
	// does not depend on DNS; the module's own service shares the tables.
	registrar := integrationsservice.New(pg.AppPool, nil, integrationsrepository.New(pg.AppPool), nil, sealer, discardJobs{}, clock.Real{}, publicHost{})
	registered, err := registrar.RegisterEndpoint(ctx, tenantRow.ID, sender.ID, integrationsservice.RegisterEndpointInput{
		URL: "https://example.com/hook", EventTypes: []string{events.AnnouncementPublished},
	})
	require.NoError(t, err)

	draft, err := announcementsModule.Service.Create(ctx, tenantRow.ID, sender.ID, announcementsservice.Input{
		Title: "Rapat orang tua", BodyHTML: "<p>Jumat pukul 09.00</p>",
		Audience: announcementsdomain.Audience{Type: announcementsdomain.AudienceAll},
	})
	require.NoError(t, err)
	_, err = announcementsModule.Service.Publish(ctx, tenantRow.ID, draft.ID)
	require.NoError(t, err)

	var eventType string
	var payload []byte
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`select event_type, payload from integration_webhook_deliveries where tenant_id = $1 and endpoint_id = $2`,
		tenantRow.ID, registered.Endpoint.ID).Scan(&eventType, &payload))
	require.Equal(t, events.AnnouncementPublished, eventType)
	var body map[string]any
	require.NoError(t, json.Unmarshal(payload, &body))
	require.Equal(t, draft.ID.String(), body["announcement_id"])
	require.Equal(t, "Rapat orang tua", body["title"])

	// The inbox entry is written once, not again through the bus.
	var inbox int
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`select count(*) from notifications where tenant_id = $1 and kind = 'announcement_published'`,
		tenantRow.ID).Scan(&inbox))
	require.Equal(t, 1, inbox)
}
