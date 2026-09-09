package jobs

import (
	"context"
	"fmt"

	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/notify"
)

// DigestWorker sends every tenant's due daily-digest emails.
type DigestWorker struct {
	river.WorkerDefaults[service.RunDigestArgs]
	svc   *service.Service
	email notify.EmailSender
}

func (w *DigestWorker) Work(ctx context.Context, _ *river.Job[service.RunDigestArgs]) error {
	batches, err := w.svc.ComputeDueDigests(ctx)
	if err != nil {
		return fmt.Errorf("compute due digests: %w", err)
	}

	for _, batch := range batches {
		items := make([]notify.DigestEmailItem, len(batch.Items))
		for i, n := range batch.Items {
			items[i] = notify.DigestEmailItem{Title: n.Title, Href: n.Href}
		}
		htmlBody, textBody, err := notify.RenderDigestEmail(notify.DigestEmailData{Items: items})
		if err != nil {
			continue
		}
		if err := w.email.Send(ctx, notify.EmailMessage{
			To: batch.Email, Subject: "Ringkasan notifikasi", HTMLBody: htmlBody, TextBody: textBody,
		}); err != nil {
			continue // this user's digest is retried on the next hourly run, not immediately
		}
		_ = w.svc.MarkDigestSent(ctx, batch.TenantID, batch.UserID)
	}
	return nil
}

// PruneDevicesWorker removes expired or repeatedly-failing push devices.
type PruneDevicesWorker struct {
	river.WorkerDefaults[service.PruneDevicesArgs]
	svc *service.Service
}

func (w *PruneDevicesWorker) Work(ctx context.Context, _ *river.Job[service.PruneDevicesArgs]) error {
	return w.svc.PruneDevices(ctx)
}

// RunRetentionWorker deletes notifications and deliveries past their
// retention window (docs/06-database-schema.md section 10).
type RunRetentionWorker struct {
	river.WorkerDefaults[service.RunRetentionArgs]
	svc *service.Service
}

func (w *RunRetentionWorker) Work(ctx context.Context, _ *river.Job[service.RunRetentionArgs]) error {
	return w.svc.RunRetention(ctx)
}

// EnsurePartitionsWorker keeps the notifications table's monthly
// partitions created ahead of the traffic that needs them.
type EnsurePartitionsWorker struct {
	river.WorkerDefaults[service.EnsurePartitionsArgs]
	svc *service.Service
}

func (w *EnsurePartitionsWorker) Work(ctx context.Context, _ *river.Job[service.EnsurePartitionsArgs]) error {
	return w.svc.EnsurePartitions(ctx)
}
