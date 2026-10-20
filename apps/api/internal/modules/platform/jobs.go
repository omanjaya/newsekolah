package platform

import (
	"context"
	"time"

	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/service"
)

// exportWorker runs one tenant export: RequestExport enqueues the job,
// this worker calls back into the service to build the ZIP and store it.
type exportWorker struct {
	river.WorkerDefaults[service.ExportTenantArgs]
	svc *service.Service
}

func (w *exportWorker) Work(ctx context.Context, job *river.Job[service.ExportTenantArgs]) error {
	return w.svc.RunExport(ctx, job.Args.TenantID, job.Args.ExportID)
}

// ensurePartitionsWorker keeps the audit_logs and login_attempts monthly
// partitions created ahead of the traffic that needs them.
type ensurePartitionsWorker struct {
	river.WorkerDefaults[service.EnsurePartitionsArgs]
	maintenance *service.Maintenance
}

func (w *ensurePartitionsWorker) Work(ctx context.Context, _ *river.Job[service.EnsurePartitionsArgs]) error {
	return w.maintenance.EnsurePartitions(ctx)
}

// runRetentionWorker applies the data retention policy (old partitions,
// login attempts, webhook deliveries).
type runRetentionWorker struct {
	river.WorkerDefaults[service.RunRetentionArgs]
	maintenance *service.Maintenance
}

func (w *runRetentionWorker) Work(ctx context.Context, _ *river.Job[service.RunRetentionArgs]) error {
	return w.maintenance.RunRetention(ctx)
}

// maintenancePeriodicJobs is the schedule for the two jobs above: partitions
// are ensured at process start (so a fresh deploy or a long outage is
// repaired immediately) and daily; retention runs daily.
func maintenancePeriodicJobs() []*river.PeriodicJob {
	return []*river.PeriodicJob{
		river.NewPeriodicJob(river.PeriodicInterval(24*time.Hour), func() (river.JobArgs, *river.InsertOpts) {
			return service.EnsurePartitionsArgs{}, nil
		}, &river.PeriodicJobOpts{ID: "platform_ensure_partitions", RunOnStart: true}),

		river.NewPeriodicJob(river.PeriodicInterval(24*time.Hour), func() (river.JobArgs, *river.InsertOpts) {
			return service.RunRetentionArgs{}, nil
		}, &river.PeriodicJobOpts{ID: "platform_run_retention"}),
	}
}
