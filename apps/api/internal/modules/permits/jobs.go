package permits

import (
	"context"
	"log/slog"
	"time"

	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
)

// ExpireWorkflowsArgs closes flows still in progress after their opening day.
type ExpireWorkflowsArgs struct{}

func (ExpireWorkflowsArgs) Kind() string { return "permits.expire_workflows" }

// CleanupScanTokensArgs deletes expired scan tokens older than a day.
type CleanupScanTokensArgs struct{}

func (CleanupScanTokensArgs) Kind() string { return "permits.cleanup_scan_tokens" }

type expireWorker struct {
	river.WorkerDefaults[ExpireWorkflowsArgs]
	svc    *service.Service
	logger *slog.Logger
}

func (w *expireWorker) Work(ctx context.Context, _ *river.Job[ExpireWorkflowsArgs]) error {
	n, err := w.svc.ExpireHangingInstances(ctx)
	if err != nil {
		return err
	}
	w.logger.Info("expired hanging workflow instances", "count", n)
	return nil
}

type cleanupWorker struct {
	river.WorkerDefaults[CleanupScanTokensArgs]
	svc    *service.Service
	logger *slog.Logger
}

func (w *cleanupWorker) Work(ctx context.Context, _ *river.Job[CleanupScanTokensArgs]) error {
	n, err := w.svc.CleanupExpiredScanTokens(ctx)
	if err != nil {
		return err
	}
	w.logger.Info("deleted expired scan tokens", "count", n)
	return nil
}

// RegisterJobs adds the module's workers and returns its periodic schedule:
// expiry runs every 15 minutes (cheap; the query is indexed and idempotent)
// so a hanging flow never blocks the next morning's attendance, cleanup hourly.
func (m *Module) RegisterJobs(workers *river.Workers, logger *slog.Logger) []*river.PeriodicJob {
	river.AddWorker(workers, &expireWorker{svc: m.Service, logger: logger})
	river.AddWorker(workers, &cleanupWorker{svc: m.Service, logger: logger})
	return []*river.PeriodicJob{
		river.NewPeriodicJob(river.PeriodicInterval(15*time.Minute), func() (river.JobArgs, *river.InsertOpts) {
			return ExpireWorkflowsArgs{}, nil
		}, &river.PeriodicJobOpts{RunOnStart: true}),
		river.NewPeriodicJob(river.PeriodicInterval(time.Hour), func() (river.JobArgs, *river.InsertOpts) {
			return CleanupScanTokensArgs{}, nil
		}, &river.PeriodicJobOpts{RunOnStart: true}),
	}
}
