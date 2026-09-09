// Package integrations wires the module that gives a school machine access
// to its own data: named API keys with a bounded permission subset, and
// outgoing webhook endpoints delivered as River jobs with signed,
// retried, logged attempts. See docs/14-public-api.md for the wire
// contract a client or receiver integrates against.
package integrations

import (
	"context"
	"log/slog"
	"net"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/transport/http"
	transportjobs "github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/transport/jobs"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
)

type Dependencies struct {
	Pool   *pgxpool.Pool
	Bus    *events.Bus
	Perms  authz.PermissionsProvider
	Sealer *crypto.Sealer
	Jobs   service.JobInserter
	Clock  clock.Clock
	Logger *slog.Logger
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.IntegrationsHandler
	logger  *slog.Logger
}

// dnsResolver is the production service.HostResolver: a thin adapter over
// net.Resolver so the webhook registration's private-address check
// resolves the same way a real delivery attempt would.
type dnsResolver struct{}

func (dnsResolver) LookupIPs(ctx context.Context, host string) ([]string, error) {
	addrs, err := net.DefaultResolver.LookupHost(ctx, host)
	if err != nil {
		return nil, err
	}
	return addrs, nil
}

func Register(deps Dependencies) *Module {
	logger := deps.Logger
	if logger == nil {
		logger = slog.Default()
	}
	clk := deps.Clock
	if clk == nil {
		clk = clock.Real{}
	}

	repo := repository.New(deps.Pool)
	svc := service.New(deps.Pool, repo, repo, deps.Perms, deps.Sealer, deps.Jobs, clk, dnsResolver{})
	m := &Module{Service: svc, Handler: transporthttp.New(svc), logger: logger}

	if deps.Bus != nil {
		m.subscribeToEventCatalog(deps.Bus)
	}
	return m
}

// subscribeToEventCatalog fans every event in service.EventCatalog out to
// DispatchEvent. A dispatch failure is logged, never returned: the
// originating module's transaction (attendance recording an entry, permits
// issuing a letter, ...) must not roll back because a webhook could not be
// enqueued, the same rule the notification bridge follows for the inbox.
func (m *Module) subscribeToEventCatalog(bus *events.Bus) {
	for _, eventType := range service.EventCatalog {
		et := eventType
		bus.Subscribe(et, func(ctx context.Context, evt events.Event) error {
			envelope, ok := evt.(events.Envelope)
			if !ok {
				return nil
			}
			payload := map[string]any{"actor_user_id": envelope.Actor}
			for k, v := range envelope.Payload {
				payload[k] = v
			}
			if err := m.Service.DispatchEvent(ctx, envelope.Tenant, et, uuid.Must(uuid.NewV7()), payload); err != nil {
				m.logger.Warn("integrations: dispatch webhook event failed", "event", et, "error", err)
			}
			return nil
		})
	}
}

// RegisterJobs adds the delivery worker to workers.
func (m *Module) RegisterJobs(workers *river.Workers, clk clock.Clock) {
	if clk == nil {
		clk = clock.Real{}
	}
	river.AddWorker(workers, transportjobs.NewDeliverWebhookWorker(m.Service, clk))
}
