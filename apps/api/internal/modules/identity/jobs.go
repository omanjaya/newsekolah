package identity

import (
	"context"
	"log/slog"
	"time"

	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
)

// PruneSessionsArgs carries no payload: every run processes every active
// tenant, one tenant transaction at a time (see service.PruneSessions).
type PruneSessionsArgs struct{}

func (PruneSessionsArgs) Kind() string { return "identity.prune_sessions" }

type pruneSessionsWorker struct {
	river.WorkerDefaults[PruneSessionsArgs]
	svc    *service.Service
	logger *slog.Logger
}

func (w *pruneSessionsWorker) Work(ctx context.Context, _ *river.Job[PruneSessionsArgs]) error {
	if err := w.svc.PruneSessions(ctx); err != nil {
		return err
	}
	w.logger.Info("pruned revoked/expired sessions older than 30 days")
	return nil
}

// RegisterJobs adds the module's workers and returns its periodic
// schedule: session retention runs daily, matching the old app's hourly
// maintenance sweep closely enough for a row that only ever grows stale,
// never urgent (docs/analysis/backend-inventory.md section 1.1).
func (m *Module) RegisterJobs(workers *river.Workers, logger *slog.Logger) []*river.PeriodicJob {
	river.AddWorker(workers, &pruneSessionsWorker{svc: m.Service, logger: logger})
	return []*river.PeriodicJob{
		river.NewPeriodicJob(river.PeriodicInterval(24*time.Hour), func() (river.JobArgs, *river.InsertOpts) {
			return PruneSessionsArgs{}, nil
		}, &river.PeriodicJobOpts{ID: "identity_prune_sessions"}),
	}
}
