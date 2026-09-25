// Package grading wires the grading module: assessment components and
// scores, report scores computed from weighted averages with the school's
// increase ranges, publication to students, and the star ledger.
package grading

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/realtime"
)

type Dependencies struct {
	Pool  *pgxpool.Pool
	Years service.AcademicYearReader
	Perms transporthttp.PermissionChecker // nil: only the assigned teacher may write
	Flags service.FlagReader              // nil: module is always enabled
	// Hub is optional: nil disables the "grading.published" live push to
	// each student without failing publication itself.
	Hub   *realtime.Hub
	Clock clock.Clock
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.GradingHandler
}

// hubPublisher adapts platform/realtime's Hub to service.RealtimePublisher
// over realtime.TopicUser, mirroring permits/module.go's identically-
// shaped adapter.
type hubPublisher struct{ hub *realtime.Hub }

func (p hubPublisher) PublishToUser(_ context.Context, tenantID, userID uuid.UUID, eventType string, payload any) error {
	return p.hub.PublishEvent(realtime.TopicUser(tenantID, userID), eventType, payload)
}

func Register(deps Dependencies) *Module {
	var realtimePublisher service.RealtimePublisher
	if deps.Hub != nil {
		realtimePublisher = hubPublisher{hub: deps.Hub}
	}
	svc := service.New(deps.Pool, repository.New(deps.Pool), deps.Years, deps.Flags, realtimePublisher, deps.Clock)
	return &Module{Service: svc, Handler: transporthttp.New(svc, deps.Perms)}
}
