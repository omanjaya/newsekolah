package jobs

import (
	"fmt"
	"time"

	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/notify"
)

// Dependencies is everything the module's workers need beyond the
// Service: the outbound adapters, which live in transport/jobs (not
// service) so the service package never imports platform/notify.
type Dependencies struct {
	Service  *service.Service
	Push     notify.PushSender
	Email    notify.EmailSender
	WhatsApp notify.WhatsAppSender
	Clock    clock.Clock
}

// Register adds every notifications job kind to workers. Called once at
// wiring time by both cmd/api (when WORKER_INLINE=true) and cmd/worker.
func Register(workers *river.Workers, deps Dependencies) error {
	if err := river.AddWorkerSafely(workers, &DeliverPushWorker{svc: deps.Service, push: deps.Push}); err != nil {
		return fmt.Errorf("register push delivery worker: %w", err)
	}
	if err := river.AddWorkerSafely(workers, &DeliverEmailWorker{svc: deps.Service, email: deps.Email}); err != nil {
		return fmt.Errorf("register email delivery worker: %w", err)
	}
	if err := river.AddWorkerSafely(workers, &DeliverWhatsAppWorker{svc: deps.Service, whatsApp: deps.WhatsApp, clock: deps.Clock}); err != nil {
		return fmt.Errorf("register whatsapp delivery worker: %w", err)
	}
	if err := river.AddWorkerSafely(workers, &DigestWorker{svc: deps.Service, email: deps.Email}); err != nil {
		return fmt.Errorf("register digest worker: %w", err)
	}
	if err := river.AddWorkerSafely(workers, &PruneDevicesWorker{svc: deps.Service}); err != nil {
		return fmt.Errorf("register prune devices worker: %w", err)
	}
	if err := river.AddWorkerSafely(workers, &RunRetentionWorker{svc: deps.Service}); err != nil {
		return fmt.Errorf("register retention worker: %w", err)
	}
	if err := river.AddWorkerSafely(workers, &EnsurePartitionsWorker{svc: deps.Service}); err != nil {
		return fmt.Errorf("register ensure partitions worker: %w", err)
	}
	return nil
}

// PeriodicJobs returns the schedule cmd/api and cmd/worker both register
// on their River client: the digest and pruning/retention/partition
// maintenance jobs, none of which take a payload (each processes every
// active tenant itself -- see service.ComputeDueDigests and friends).
func PeriodicJobs() []*river.PeriodicJob {
	return []*river.PeriodicJob{
		river.NewPeriodicJob(river.PeriodicInterval(1*time.Hour), func() (river.JobArgs, *river.InsertOpts) {
			return service.RunDigestArgs{}, nil
		}, &river.PeriodicJobOpts{ID: "notifications_run_digest"}),

		river.NewPeriodicJob(river.PeriodicInterval(6*time.Hour), func() (river.JobArgs, *river.InsertOpts) {
			return service.PruneDevicesArgs{}, nil
		}, &river.PeriodicJobOpts{ID: "notifications_prune_devices"}),

		river.NewPeriodicJob(river.PeriodicInterval(24*time.Hour), func() (river.JobArgs, *river.InsertOpts) {
			return service.RunRetentionArgs{}, nil
		}, &river.PeriodicJobOpts{ID: "notifications_run_retention"}),

		river.NewPeriodicJob(river.PeriodicInterval(24*time.Hour), func() (river.JobArgs, *river.InsertOpts) {
			return service.EnsurePartitionsArgs{}, nil
		}, &river.PeriodicJobOpts{ID: "notifications_ensure_partitions", RunOnStart: true}),
	}
}
