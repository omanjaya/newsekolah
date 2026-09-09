// Package jobs implements the notifications module's River workers:
// deliver push/email/WhatsApp, run the daily digest, prune push devices,
// enforce retention, and keep the notifications partition ahead of
// traffic. Workers hold the notify adapters directly and call back into
// service.Service to read/record state -- the service package itself
// never imports platform/notify (see notify.go's comment on that split).
package jobs

import (
	"context"
	"errors"
	"fmt"

	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/notify"
)

// DeliverPushWorker sends one push notification to one device.
type DeliverPushWorker struct {
	river.WorkerDefaults[service.DeliverPushArgs]
	svc  *service.Service
	push notify.PushSender
}

func (w *DeliverPushWorker) Work(ctx context.Context, job *river.Job[service.DeliverPushArgs]) error {
	args := job.Args

	device, err := w.svc.GetPushDevice(ctx, args.TenantID, args.DeviceID)
	if err != nil {
		// The device was removed (unregistered, or a previous attempt
		// already pruned it) between enqueue and this attempt: nothing
		// left to send to, and retrying will not change that.
		return nil
	}

	sendErr := w.push.Send(ctx, notify.PushDevice{
		Platform: notify.Platform(device.Platform), TokenOrEndpoint: device.TokenOrEndpoint,
		P256dh: device.P256dh, AuthKey: device.AuthKey,
	}, notify.PushPayload{Title: args.Title, Body: args.Body, Href: args.Href})

	if sendErr != nil {
		return w.handleFailure(ctx, args, sendErr)
	}

	_ = w.svc.TouchPushDeviceUsed(ctx, args.TenantID, args.DeviceID)
	return w.svc.RecordDeliveryAttempt(ctx, args.TenantID, args.DeliveryID, service.DeliveryStatusSent, "", "")
}

func (w *DeliverPushWorker) handleFailure(ctx context.Context, args service.DeliverPushArgs, sendErr error) error {
	_ = w.svc.RecordDeliveryAttempt(ctx, args.TenantID, args.DeliveryID, service.DeliveryStatusFailed, "", sendErr.Error())

	if errors.Is(sendErr, notify.ErrDeviceGone) {
		// Permanent failure: remove the device and do not retry.
		return w.svc.RemovePushDevice(ctx, args.TenantID, args.DeviceID)
	}

	_ = w.svc.IncrementPushDeviceFailure(ctx, args.TenantID, args.DeviceID)
	return fmt.Errorf("deliver push: %w", sendErr) // returns non-nil so River retries with backoff
}

// DeliverEmailWorker sends one notification email.
type DeliverEmailWorker struct {
	river.WorkerDefaults[service.DeliverEmailArgs]
	svc   *service.Service
	email notify.EmailSender
}

func (w *DeliverEmailWorker) Work(ctx context.Context, job *river.Job[service.DeliverEmailArgs]) error {
	args := job.Args

	htmlBody, textBody, err := notify.RenderNotificationEmail(notify.NotificationEmailData{
		Title: args.Title, Body: args.Body, Href: args.Href,
	})
	if err != nil {
		_ = w.svc.RecordDeliveryAttempt(ctx, args.TenantID, args.DeliveryID, service.DeliveryStatusFailed, "", err.Error())
		return fmt.Errorf("render notification email: %w", err)
	}

	sendErr := w.email.Send(ctx, notify.EmailMessage{To: args.ToEmail, Subject: args.Title, HTMLBody: htmlBody, TextBody: textBody})
	if sendErr != nil {
		_ = w.svc.RecordDeliveryAttempt(ctx, args.TenantID, args.DeliveryID, service.DeliveryStatusFailed, "", sendErr.Error())
		return fmt.Errorf("deliver email: %w", sendErr)
	}
	return w.svc.RecordDeliveryAttempt(ctx, args.TenantID, args.DeliveryID, service.DeliveryStatusSent, "", "")
}

// DeliverWhatsAppWorker sends one WhatsApp message.
type DeliverWhatsAppWorker struct {
	river.WorkerDefaults[service.DeliverWhatsAppArgs]
	svc      *service.Service
	whatsApp notify.WhatsAppSender
}

func (w *DeliverWhatsAppWorker) Work(ctx context.Context, job *river.Job[service.DeliverWhatsAppArgs]) error {
	args := job.Args

	sendErr := w.whatsApp.Send(ctx, args.ToPhone, args.Message)
	if sendErr != nil {
		_ = w.svc.RecordDeliveryAttempt(ctx, args.TenantID, args.DeliveryID, service.DeliveryStatusFailed, "", sendErr.Error())
		return fmt.Errorf("deliver whatsapp message: %w", sendErr)
	}
	return w.svc.RecordDeliveryAttempt(ctx, args.TenantID, args.DeliveryID, service.DeliveryStatusSent, "", "")
}
