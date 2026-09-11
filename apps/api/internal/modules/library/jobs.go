package library

import (
	"context"
	"log/slog"
	"time"

	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
)

// ExpireReservationsArgs releases a copy held for a hold that expired
// before the member picked it up (old app: hourly job,
// library_circulation.go:1909-1993; regression fix -- the rebuild's first
// pass never had a job for this at all).
type ExpireReservationsArgs struct{}

func (ExpireReservationsArgs) Kind() string { return "library.expire_reservations" }

// SendDueRemindersArgs is the daily due-date reminder pass (old app: daily
// 07:00 job, library_circulation.go:1998-2090).
type SendDueRemindersArgs struct{}

func (SendDueRemindersArgs) Kind() string { return "library.send_due_reminders" }

type expireReservationsWorker struct {
	river.WorkerDefaults[ExpireReservationsArgs]
	svc    *service.Service
	logger *slog.Logger
}

func (w *expireReservationsWorker) Work(ctx context.Context, _ *river.Job[ExpireReservationsArgs]) error {
	n, err := w.svc.ExpireReadyReservationsAllTenants(ctx)
	if err != nil {
		return err
	}
	w.logger.Info("expired ready library reservations", "count", n)
	return nil
}

type sendDueRemindersWorker struct {
	river.WorkerDefaults[SendDueRemindersArgs]
	svc    *service.Service
	logger *slog.Logger
}

func (w *sendDueRemindersWorker) Work(ctx context.Context, _ *river.Job[SendDueRemindersArgs]) error {
	n, err := w.svc.SendDueRemindersAllTenants(ctx)
	if err != nil {
		return err
	}
	w.logger.Info("sent library due-date reminders", "members_notified", n)
	return nil
}

// RegisterJobs adds the module's workers and returns its periodic
// schedule: reservation expiry every 15 minutes (a ready hold is time
// sensitive, but not urgent enough for a shorter interval), reminders
// hourly with each tenant's own 07:00 check inside SendDueRemindersAllTenants
// so it fires once per tenant per day regardless of timezone.
func (m *Module) RegisterJobs(workers *river.Workers, logger *slog.Logger) []*river.PeriodicJob {
	river.AddWorker(workers, &expireReservationsWorker{svc: m.Service, logger: logger})
	river.AddWorker(workers, &sendDueRemindersWorker{svc: m.Service, logger: logger})
	return []*river.PeriodicJob{
		river.NewPeriodicJob(river.PeriodicInterval(15*time.Minute), func() (river.JobArgs, *river.InsertOpts) {
			return ExpireReservationsArgs{}, nil
		}, &river.PeriodicJobOpts{RunOnStart: true}),
		river.NewPeriodicJob(river.PeriodicInterval(time.Hour), func() (river.JobArgs, *river.InsertOpts) {
			return SendDueRemindersArgs{}, nil
		}, &river.PeriodicJobOpts{RunOnStart: true}),
	}
}
