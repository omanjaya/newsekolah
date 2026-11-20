// Package jobs holds the report schedule feature's River worker. Sending
// email lives here rather than in service (platform/notify stays out of
// the service layer, same reasoning as the notifications module: see
// notifications/transport/jobs/register.go).
package jobs

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/service"
	platformjobs "github.com/omanjaya/newsekolah/apps/api/internal/platform/jobs"
)

// EmailSender is the narrow slice of platform/notify.EmailSender this
// worker needs.
type EmailSender interface {
	Send(ctx context.Context, msg EmailMessage) error
}

// EmailMessage mirrors platform/notify.EmailMessage's fields; kept as a
// local type so this package does not import platform/notify just to
// name its message type in the interface above.
type EmailMessage struct {
	To       string
	Subject  string
	TextBody string
	HTMLBody string
}

// RunSchedulesArgs carries no payload: the worker itself loops every
// active tenant (service.ScheduleService.RunDueSchedules), same shape as
// notifications.RunDigestArgs.
type RunSchedulesArgs struct{}

func (RunSchedulesArgs) Kind() string { return "reports.run_schedules" }

// Dependencies is everything RunSchedulesWorker needs beyond the
// ScheduleService.
type Dependencies struct {
	Schedules *service.ScheduleService
	Email     EmailSender
	Logger    *slog.Logger
}

// Register adds the report schedule job kind to workers.
func Register(workers *river.Workers, deps Dependencies) []*river.PeriodicJob {
	logger := deps.Logger
	if logger == nil {
		logger = slog.Default()
	}
	river.AddWorker(workers, &RunSchedulesWorker{schedules: deps.Schedules, email: deps.Email, logger: logger})
	// On the hour, not every hour from boot: a schedule due at 11:00 runs
	// at 11:00, not at whatever minute the process started. RunOnStart
	// picks up an hour that began while the worker was down; ClaimRun's
	// (schedule_id, due_at) key keeps that from running a slot twice.
	return []*river.PeriodicJob{
		river.NewPeriodicJob(platformjobs.EveryHourOnTheHour(), func() (river.JobArgs, *river.InsertOpts) {
			return RunSchedulesArgs{}, nil
		}, &river.PeriodicJobOpts{ID: "reports_run_schedules", RunOnStart: true}),
	}
}

type RunSchedulesWorker struct {
	river.WorkerDefaults[RunSchedulesArgs]
	schedules *service.ScheduleService
	email     EmailSender
	logger    *slog.Logger
}

// Work renders and uploads every due schedule (via ScheduleService), then
// emails each one's recipients a download link. A render/upload failure
// is already recorded by RunDueSchedules; a send failure is recorded here
// through FinalizeRun so either kind of failure shows up in run history.
func (w *RunSchedulesWorker) Work(ctx context.Context, _ *river.Job[RunSchedulesArgs]) error {
	pending, err := w.schedules.RunDueSchedules(ctx)
	if err != nil {
		w.logger.Error("report schedule run failed", "error", err)
	}
	for _, n := range pending {
		sendErr := w.sendAll(ctx, n)
		if finalizeErr := w.schedules.FinalizeRun(ctx, n, sendErr); finalizeErr != nil {
			w.logger.Error("failed to record report schedule run outcome", "schedule_id", n.ScheduleID, "error", finalizeErr)
		}
	}
	return err
}

func (w *RunSchedulesWorker) sendAll(ctx context.Context, n service.PendingNotification) error {
	if w.email == nil {
		return fmt.Errorf("no email sender configured")
	}
	subject := "Scheduled report: " + n.ReportKind
	text := "Your scheduled export is ready. Download it here (link expires in 7 days): " + n.DownloadURL
	html := "<p>Your scheduled export is ready.</p><p><a href=\"" + n.DownloadURL + "\">Download the report</a> (link expires in 7 days).</p>"

	var failed []string
	for _, to := range n.Recipients {
		if err := w.email.Send(ctx, EmailMessage{To: to, Subject: subject, TextBody: text, HTMLBody: html}); err != nil {
			failed = append(failed, to)
		}
	}
	if len(failed) > 0 {
		return fmt.Errorf("failed to send to %d of %d recipients: %v", len(failed), len(n.Recipients), failed)
	}
	return nil
}
