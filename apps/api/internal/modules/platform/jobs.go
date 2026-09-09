package platform

import (
	"context"

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
