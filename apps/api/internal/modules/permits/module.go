// Package permits wires the workflow engine, scan tokens, exit permits,
// late arrivals, leave requests and issued documents together. Other modules
// plug in through the service interfaces (ScheduleLookup, AttendanceSync).
package permits

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/documents"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
)

type Dependencies struct {
	Pool      *pgxpool.Pool
	Years     service.AcademicYearReader
	Schedule  service.ScheduleLookup // nil until scheduling is wired: teacher_of_class_now then never matches
	Sync      service.AttendanceSync // nil until attendance is wired
	Guardians service.GuardianLinks  // nil disables guardian_of_student: it then never matches
	Bus       *events.Bus
	Storage   service.Storage // nil disables uploads and PDF storage
	Clock     clock.Clock
	Config    service.Config
	Logger    *slog.Logger
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.PermitsHandler
}

// noSchedule stands in until the scheduling module is wired: the
// teacher_of_class_now rule then never matches, which fails closed.
type noSchedule struct{}

func (noSchedule) IsTeacherAssignedNowOrNext(context.Context, uuid.UUID, uuid.UUID, uuid.UUID, time.Time, int) (bool, error) {
	return false, nil
}

// noSync stands in until the attendance module is wired.
type noSync struct{}

func (noSync) ForceStatus(context.Context, uuid.UUID, uuid.UUID, time.Time, time.Time, string, string) error {
	return nil
}

// noGuardians stands in when no identity adapter is wired: the
// guardian_of_student rule then never matches (fails closed) and a
// guardian's queue is always empty.
type noGuardians struct{}

func (noGuardians) IsApprovingGuardianOf(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) (bool, error) {
	return false, nil
}

func (noGuardians) ApprovingChildrenOf(context.Context, uuid.UUID, uuid.UUID) ([]uuid.UUID, error) {
	return nil, nil
}

func Register(deps Dependencies) *Module {
	clk := deps.Clock
	if clk == nil {
		clk = clock.Real{}
	}
	var publisher service.EventPublisher
	if deps.Bus != nil {
		publisher = busPublisher{bus: deps.Bus}
	}
	schedule := deps.Schedule
	if schedule == nil {
		schedule = noSchedule{}
	}
	sync := deps.Sync
	if sync == nil {
		sync = noSync{}
	}
	guardians := deps.Guardians
	if guardians == nil {
		guardians = noGuardians{}
	}
	svc := service.New(deps.Pool, repository.New(deps.Pool), deps.Years, schedule, sync, guardians, publisher, deps.Storage,
		documents.NewHTMLPDFRenderer(), clk, deps.Config)
	return &Module{Service: svc, Handler: transporthttp.New(svc, clk)}
}

type busPublisher struct{ bus *events.Bus }

func (p busPublisher) Publish(ctx context.Context, evt events.Event) error {
	return p.bus.Publish(ctx, evt)
}
