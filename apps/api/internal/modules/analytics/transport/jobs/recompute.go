// Package jobs is the River worker for analytics' recompute schedule.
package jobs

import (
	"context"
	"time"

	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/service"
)

// RecomputeArgs takes no payload: the worker recomputes every active
// tenant's risk results itself (service.RecomputeAllTenants), the same
// shape as notifications' RunRetentionArgs.
type RecomputeArgs struct{}

func (RecomputeArgs) Kind() string { return "analytics_recompute" }

type RecomputeWorker struct {
	river.WorkerDefaults[RecomputeArgs]
	Service *service.Service
}

func (w *RecomputeWorker) Work(ctx context.Context, _ *river.Job[RecomputeArgs]) error {
	return w.Service.RecomputeAllTenants(ctx)
}

// Register adds the recompute worker to workers.
func Register(workers *river.Workers, svc *service.Service) error {
	return river.AddWorkerSafely(workers, &RecomputeWorker{Service: svc})
}

// PeriodicJobs schedules the nightly recompute: a risk level computed
// hours before school starts is what puts it "in front of the person who
// can act before the term ends" (this module's own brief), so once a day
// is frequent enough without recomputing on every read.
func PeriodicJobs() []*river.PeriodicJob {
	return []*river.PeriodicJob{
		river.NewPeriodicJob(river.PeriodicInterval(24*time.Hour), func() (river.JobArgs, *river.InsertOpts) {
			return RecomputeArgs{}, nil
		}, &river.PeriodicJobOpts{ID: "analytics_recompute", RunOnStart: true}),
	}
}
