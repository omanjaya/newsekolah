// Package discipline wires the discipline module: violation catalog and
// records with point snapshots, warning letters against a tenant policy,
// and encrypted counseling notes.
package discipline

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/documents"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
)

type Dependencies struct {
	Pool      *pgxpool.Pool
	Years     service.AcademicYearReader
	Docs      service.DocumentIssuer // nil: letters are numbered locally without a PDF
	Sealer    *crypto.Sealer
	Bus       *events.Bus
	Clock     clock.Clock
	Names     service.NameLookup     // nil: reporter/issuer names blank on documents
	Guardians service.GuardianReader // nil: warning letters do not notify parents
	Storage   service.Storage        // nil: counseling attachments and ad hoc PDF reports disabled
	Config    service.Config
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.DisciplineHandler
}

func Register(deps Dependencies) *Module {
	var publisher service.EventPublisher
	if deps.Bus != nil {
		publisher = busPublisher{bus: deps.Bus}
	}
	svc := service.New(
		deps.Pool, repository.New(deps.Pool), deps.Years, deps.Docs, deps.Sealer, publisher, deps.Clock,
		deps.Names, deps.Guardians, deps.Storage, documents.NewHTMLPDFRenderer(), deps.Config,
	)
	return &Module{Service: svc, Handler: transporthttp.New(svc)}
}

type busPublisher struct{ bus *events.Bus }

func (p busPublisher) Publish(ctx context.Context, evt interface{ EventName() string }) error {
	return p.bus.Publish(ctx, evt)
}
