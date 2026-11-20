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

// recomputeInterval is how often every tenant is rescored. Hourly, so an
// absence, violation or published grade recorded during the school day
// shows on the list the same day; a day-long interval counted from process
// start left the list hours stale in the middle of the school day. A reader
// of the list can still rescore at once (POST /v1/analytics/recompute), and
// saving the policy rescores too; a tenant already being rescored by one of
// those when this runs is skipped (service.ErrRecomputeInProgress).
const recomputeInterval = time.Hour

// PeriodicJobs schedules the recurring recompute.
func PeriodicJobs() []*river.PeriodicJob {
	return []*river.PeriodicJob{
		river.NewPeriodicJob(river.PeriodicInterval(recomputeInterval), func() (river.JobArgs, *river.InsertOpts) {
			return RecomputeArgs{}, nil
		}, &river.PeriodicJobOpts{ID: "analytics_recompute", RunOnStart: true}),
	}
}
