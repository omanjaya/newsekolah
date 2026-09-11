// Package scheduling wires the module's repository, service, and HTTP
// transport together, and exports the interfaces other modules consume:
// AccessChecker lets the attendance module (and, once merged, the permits
// module) ask "may this user act on this schedule occurrence" without
// importing scheduling's repository, per docs/03-layered-architecture.md
// section 1 ("Interface yang diekspor modul, disuntik saat wiring").
package scheduling

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
)

type Module struct {
	Service *service.Service
	Handler *transporthttp.SchedulingHandler
	// AccessChecker and ScheduleReader are exported for the attendance
	// module to consume once it is wired in (see access.go), without
	// attendance importing scheduling's repository or service directly.
	AccessChecker  AccessChecker
	ScheduleReader ScheduleReader
	JournalService JournalService
}

// busPublisher adapts the platform-wide event bus to
// scheduling/service.EventPublisher: the two packages declare structurally
// identical but distinct Event interfaces (per substitution.go's doc
// comment, mirroring identity/service's own narrow-interface pattern), so
// a plain type assignment cannot satisfy service.EventPublisher directly.
type busPublisher struct {
	bus *events.Bus
}

// Publish wraps the two substitution events into the events.Envelope shape
// notifications/service/events.go's subscriber requires (a bare struct
// satisfying service.Event fails its type assertion to events.Envelope, so
// the subscriber's handler always errored and notifications never fired --
// see docs/03-layered-architecture.md section 1 on this wiring boundary).
// Subject addresses the event at whoever needs to know: the substitute for
// a request, the requester for a response.
func (p busPublisher) Publish(ctx context.Context, evt service.Event) error {
	switch e := evt.(type) {
	case service.SubstitutionRequested:
		return p.bus.Publish(ctx, events.Envelope{
			Name: e.EventName(), Tenant: e.TenantID, Actor: e.RequesterUserID, Subject: []uuid.UUID{e.SubstituteUserID},
			Payload: map[string]any{
				"substitution_id": e.SubstitutionID.String(), "schedule_id": e.ScheduleID.String(), "date": e.Date.Format("2006-01-02"),
			},
		})
	case service.SubstitutionResponded:
		return p.bus.Publish(ctx, events.Envelope{
			Name: e.EventName(), Tenant: e.TenantID, Actor: e.SubstituteUserID, Subject: []uuid.UUID{e.RequesterUserID},
			Payload: map[string]any{
				"substitution_id": e.SubstitutionID.String(), "schedule_id": e.ScheduleID.String(),
				"date": e.Date.Format("2006-01-02"), "accepted": e.Accepted,
			},
		})
	default:
		return p.bus.Publish(ctx, evt)
	}
}

func Register(pool *pgxpool.Pool, bus *events.Bus, perms authz.PermissionsProvider) *Module {
	repo := repository.New(pool)
	svc := service.New(pool, repo)
	handler := transporthttp.New(svc, perms, busPublisher{bus: bus})

	return &Module{
		Service:        svc,
		Handler:        handler,
		AccessChecker:  svc,
		ScheduleReader: service.NewScheduleReaderAdapter(svc),
		JournalService: service.NewJournalServiceAdapter(svc),
	}
}
