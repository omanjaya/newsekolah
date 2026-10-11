// Package platform wires the platform console module: cross-tenant tenant
// management (list with health summary, create with a first admin,
// suspend/resume, custom domain), per-tenant module feature flags, and
// tenant data exports (docs/12-roadmap.md Fase 3, first bullet).
package platform

import (
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
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
	// Sealer seals/opens the operator alerts Telegram bot token
	// (service/operator_alerts.go); the same instance every other module
	// that encrypts a field uses (cmd/api/wire.go builds it once from
	// config.EncryptionSecret()).
	Sealer *crypto.Sealer
	// Retention sets how long audit logs, login attempts and webhook
	// deliveries are kept (zero fields disable a rule); built from config
	// by cmd/api and cmd/worker.
	Retention service.RetentionPolicy
	// Logger receives the maintenance jobs' output; nil uses slog.Default.
	Logger *slog.Logger
}

type Module struct {
	Service *service.Service
	// Maintenance runs the partition and retention jobs (RegisterJobs).
	Maintenance *service.Maintenance
	Handler     *transporthttp.PlatformHandler
}

func Register(deps Dependencies) *Module {
	svc := service.New(deps.Pool, repository.New(deps.Pool), deps.Admin, deps.Jobs, deps.Storage, deps.Clock, deps.Mode, deps.Bucket, deps.Sealer)
	maintenance := service.NewMaintenance(deps.Pool, repository.New(deps.Pool), deps.Clock, deps.Retention, deps.Logger)
	return &Module{Service: svc, Maintenance: maintenance, Handler: transporthttp.New(svc)}
}

// RegisterJobs adds the module's workers (jobs.go) and returns the periodic
// schedule for the partition and retention maintenance jobs. Export runs
// have no schedule: each is enqueued explicitly by RequestExport.
func (m *Module) RegisterJobs(workers *river.Workers) []*river.PeriodicJob {
	river.AddWorker(workers, &exportWorker{svc: m.Service})
	river.AddWorker(workers, &ensurePartitionsWorker{maintenance: m.Maintenance})
	river.AddWorker(workers, &runRetentionWorker{maintenance: m.Maintenance})
	return maintenancePeriodicJobs()
}
