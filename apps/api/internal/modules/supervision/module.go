// Package supervision wires the supervision module: a cycle's instrument,
// scheduled observations resolved through scheduling, completed
// observations scored against the instrument's scale, and per-teacher
// reports exported to XLSX.
package supervision

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

type Dependencies struct {
	Pool      *pgxpool.Pool
	Years     service.AcademicYearReader
	Schedules service.ScheduleReader
	Flags     service.FlagChecker
	// Letterhead loads a tenant's configured kop laporan for the teacher
	// report export; nil is fine (that export just never shows one).
	Letterhead reportdoc.LetterheadSource
	// Perms tells a school-wide reader (view_supervision) from a teacher
	// reading their own records (view_own_supervision); nil limits every
	// reader to their own records.
	Perms transporthttp.PermissionChecker
	// Bus carries the scheduled/completed/responded events the
	// notifications module turns into inbox entries; nil announces nothing.
	Bus   *events.Bus
	Clock clock.Clock
}

// busPublisher adapts the platform event bus to service.EventPublisher,
// wrapping each event in the events.Envelope the notifications subscriber
// requires, addressed at the one person it concerns.
type busPublisher struct{ bus *events.Bus }

func (p busPublisher) Publish(ctx context.Context, evt service.Event) error {
	return p.bus.Publish(ctx, events.Envelope{
		Name: evt.Name, Tenant: evt.TenantID, Actor: evt.ActorUserID,
		Subject: []uuid.UUID{evt.SubjectUserID}, Payload: evt.Payload,
	})
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.SupervisionHandler
}

func Register(deps Dependencies) *Module {
	svc := service.New(deps.Pool, repository.New(deps.Pool), deps.Years, deps.Schedules, deps.Flags, deps.Letterhead, deps.Clock)
	if deps.Bus != nil {
		svc.WithEvents(busPublisher{bus: deps.Bus})
	}
	return &Module{Service: svc, Handler: transporthttp.New(svc, deps.Perms)}
}
