// Package announcements wires the announcements module: school-wide or
// targeted notices with a draft/scheduled/published lifecycle, read
// receipts, and a fan-out to the notifications inbox on publish.
package announcements

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

type Dependencies struct {
	Pool     *pgxpool.Pool
	Notifier service.Notifier // nil: publish without inbox fan-out
	Clock    clock.Clock
	Logger   *slog.Logger
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.AnnouncementsHandler
	logger  *slog.Logger
}

func Register(deps Dependencies) *Module {
	svc := service.New(deps.Pool, repository.New(deps.Pool), deps.Notifier, deps.Clock)
	logger := deps.Logger
	if logger == nil {
		logger = slog.Default()
	}
	return &Module{Service: svc, Handler: transporthttp.New(svc), logger: logger}
}

// PublishScheduledArgs is the River job that promotes due scheduled
// announcements. It carries no payload; the service scans every tenant.
type PublishScheduledArgs struct{}

func (PublishScheduledArgs) Kind() string { return "announcements.publish_scheduled" }

type publishScheduledWorker struct {
	river.WorkerDefaults[PublishScheduledArgs]
	svc    *service.Service
	logger *slog.Logger
}

func (w *publishScheduledWorker) Work(ctx context.Context, _ *river.Job[PublishScheduledArgs]) error {
	published, errs := w.svc.PublishDue(ctx)
	for _, err := range errs {
		w.logger.Warn("scheduled announcement publish failed", "error", err)
	}
	if published > 0 {
		w.logger.Info("scheduled announcements published", "count", published)
	}
	return nil
}

// RegisterJobs adds the module's worker and returns its periodic schedule
// (every minute, so a starts_at is honoured within a minute).
func (m *Module) RegisterJobs(workers *river.Workers) []*river.PeriodicJob {
	river.AddWorker(workers, &publishScheduledWorker{svc: m.Service, logger: m.logger})
	return []*river.PeriodicJob{
		river.NewPeriodicJob(river.PeriodicInterval(time.Minute), func() (river.JobArgs, *river.InsertOpts) {
			return PublishScheduledArgs{}, nil
		}, &river.PeriodicJobOpts{ID: "announcements_publish_scheduled"}),
	}
}
