// Package visitors wires the visitors module: guests at the gate (expected
// list, the board, sign-in and sign-out with a printed badge) and campus
// incidents with a restricted, audited read.
package visitors

import (
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/realtime"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

type Dependencies struct {
	Pool  *pgxpool.Pool
	Years service.AcademicYearReader
	Docs  service.DocumentIssuer // nil: badges are numbered locally without a PDF
	Flags service.FlagReader
	Audit service.AuditRecorder
	// Hub is optional: nil disables the gate board's live push
	// ("visitor.checked_in"/"visitor.checked_out") without failing the
	// check-in/check-out itself.
	Hub *realtime.Hub
	// Letterhead loads a tenant's configured kop laporan for the daily/
	// monthly recap exports; nil is fine (those exports just never show
	// one).
	Letterhead reportdoc.LetterheadSource
	Clock      clock.Clock
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.VisitorsHandler
}

// hubPublisher adapts platform/realtime's Hub to service.RealtimePublisher
// over realtime.TopicRole -- chunk B's subscribe authorization only
// accepts "user:"/"role:"/"duty:" topics (internal/platform/realtime/
// subscribe.go), so this reuses the same role topic every other module's
// hubPublisher does rather than a bespoke public topic string.
type hubPublisher struct{ hub *realtime.Hub }

func (p hubPublisher) PublishRole(tenantID uuid.UUID, role, eventType string, payload any) error {
	return p.hub.PublishEvent(realtime.TopicRole(tenantID, role), eventType, payload)
}

func Register(deps Dependencies) *Module {
	var realtimePublisher service.RealtimePublisher
	if deps.Hub != nil {
		realtimePublisher = hubPublisher{hub: deps.Hub}
	}
	svc := service.New(deps.Pool, repository.New(deps.Pool), deps.Years, deps.Docs, deps.Flags, deps.Audit, realtimePublisher, deps.Letterhead, deps.Clock)
	return &Module{Service: svc, Handler: transporthttp.New(svc)}
}
