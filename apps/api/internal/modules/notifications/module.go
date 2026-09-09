// Package notifications wires the notifications module: the per-user
// inbox, channel preferences, quiet hours and digests, push devices, and
// the River delivery workers behind them.
package notifications

import (
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/transport/jobs"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/notify"
)

type Dependencies struct {
	Pool     *pgxpool.Pool
	Jobs     service.JobInserter       // the River client; delivery jobs are enqueued in the inbox transaction
	Realtime service.RealtimePublisher // nil: no live "notification_created" push to open sockets
	Contacts service.ContactReader     // nil: email and WhatsApp channels have no address to send to
	Bus      *events.Bus               // nil: no domain-event subscriptions
	Clock    clock.Clock

	// Senders are only needed by the process that runs the workers.
	Push     notify.PushSender
	Email    notify.EmailSender
	WhatsApp notify.WhatsAppSender

	// WhatsApp per-tenant provider config: Sealer encrypts the stored
	// access token/gateway header, WhatsAppAppSecret verifies the inbound
	// status webhook's signature, and WhatsAppWebhookVerifyToken answers
	// Meta's GET verification handshake. All three are optional -- a
	// deployment that never sets them simply cannot use per-tenant
	// WhatsApp provider config or the webhook, and keeps working on the
	// deployment-wide WhatsApp env config alone.
	Sealer                     *crypto.Sealer
	WhatsAppAppSecret          string
	WhatsAppWebhookVerifyToken string
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.NotificationsHandler
	deps    Dependencies
}

func Register(deps Dependencies) *Module {
	clk := deps.Clock
	if clk == nil {
		clk = clock.Real{}
	}
	svc := service.New(deps.Pool, repository.New(deps.Pool), deps.Jobs, deps.Realtime, clk, deps.Contacts)
	svc.SetWhatsAppSecrets(deps.Sealer, deps.WhatsAppAppSecret, deps.WhatsAppWebhookVerifyToken)
	if deps.Bus != nil {
		service.RegisterEventHandlers(deps.Bus, svc)
	}
	return &Module{Service: svc, Handler: transporthttp.New(svc), deps: deps}
}

// RegisterJobs adds the delivery and maintenance workers and returns
// their periodic schedule. Senders left nil fall back to no-ops so a dev
// box without SMTP or push keys still drains the queue.
func (m *Module) RegisterJobs(workers *river.Workers) ([]*river.PeriodicJob, error) {
	push := m.deps.Push
	if push == nil {
		push = notify.NewNoopPushGateway()
	}
	email := m.deps.Email
	if email == nil {
		var err error
		if email, err = notify.NewEmailSender("", ""); err != nil {
			return nil, err
		}
	}
	whatsApp := m.deps.WhatsApp
	if whatsApp == nil {
		var err error
		if whatsApp, err = notify.NewWhatsAppSender("noop", "", "", nil); err != nil {
			return nil, err
		}
	}
	clk := m.deps.Clock
	if clk == nil {
		clk = clock.Real{}
	}
	if err := jobs.Register(workers, jobs.Dependencies{Service: m.Service, Push: push, Email: email, WhatsApp: whatsApp, Clock: clk}); err != nil {
		return nil, fmt.Errorf("notifications jobs: %w", err)
	}
	return jobs.PeriodicJobs(), nil
}
