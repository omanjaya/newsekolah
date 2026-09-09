// Package platform wires the platform console module: cross-tenant tenant
// management (list with health summary, create with a first admin,
// suspend/resume, custom domain), per-tenant module feature flags, and
// tenant data exports (docs/12-roadmap.md Fase 3, first bullet).
package platform

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
)

type Dependencies struct {
	Pool *pgxpool.Pool
	// Admin provisions a new tenant's first administrator through the
	// identity module; required in any process that calls CreateTenant
	// (cmd/api), unused by a process that only runs the export worker
	// (cmd/worker may leave it nil).
	Admin service.IdentityProvisioner
	// Jobs enqueues the export job; nil makes RequestExport refuse with
	// ErrStorageDisabled instead of panicking (dev boxes without River).
	Jobs service.JobInserter
	// Storage is nil when object storage is not configured, degrading
	// exports the same way permits degrades document storage.
	Storage service.Storage
	Clock   clock.Clock
	Mode    config.TenancyMode
	Bucket  string
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.PlatformHandler
}

func Register(deps Dependencies) *Module {
	svc := service.New(deps.Pool, repository.New(deps.Pool), deps.Admin, deps.Jobs, deps.Storage, deps.Clock, deps.Mode, deps.Bucket)
	return &Module{Service: svc, Handler: transporthttp.New(svc)}
}

// RegisterJobs adds the module's export worker (jobs.go). There is no
// periodic schedule: every run is enqueued explicitly by RequestExport.
func (m *Module) RegisterJobs(workers *river.Workers) {
	river.AddWorker(workers, &exportWorker{svc: m.Service})
}
