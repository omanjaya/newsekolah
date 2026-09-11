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
	"time"

	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
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

	payload := notify.PushPayload{Title: args.Title, Body: args.Body, Href: args.Href, Topic: args.NotificationKind}
	if device.Platform == domain.PlatformIOS {
		// APNs shows this as the app icon's badge count -- the old app's
		// behavior (apns.go) that the rewrite had dropped.
		if unread, err := w.svc.UnreadCount(ctx, args.TenantID, device.UserID); err == nil {
			badge := int(unread)
			payload.Badge = &badge
		}
	}

	sendErr := w.push.Send(ctx, notify.PushDevice{
		Platform: notify.Platform(device.Platform), TokenOrEndpoint: device.TokenOrEndpoint,
		P256dh: device.P256dh, AuthKey: device.AuthKey,
	}, payload)

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

// messageIDSender is the optional extra a notify.WhatsAppSender may
// implement to report the provider's message id (see whatsapp_meta.go and
// whatsapp_gateway.go). Kept here rather than added to the WhatsAppSender
// interface itself, so every existing implementation (and every future
// provider that has no message id to report) stays a plain Send(...) error.
type messageIDSender interface {
	SendWithMessageID(ctx context.Context, toPhone, message string) (string, error)
}

// DeliverWhatsAppWorker sends one WhatsApp message. It resolves the
// tenant's own provider configuration on every attempt (rather than once
// at enqueue time) so a school that fixes its configuration between
// retries does not have to wait for the notification to be re-sent from
// scratch, and falls back to the deployment-wide default sender when a
// tenant has none configured or has switched it off.
type DeliverWhatsAppWorker struct {
	river.WorkerDefaults[service.DeliverWhatsAppArgs]
	svc      *service.Service
	whatsApp notify.WhatsAppSender // deployment-wide fallback (WHATSAPP_PROVIDER env config, or noop)
	clock    clock.Clock
}

func (w *DeliverWhatsAppWorker) Work(ctx context.Context, job *river.Job[service.DeliverWhatsAppArgs]) error {
	args := job.Args

	sender := w.resolveSender(ctx, args)

	var (
		messageID string
		sendErr   error
	)
	if idSender, ok := sender.(messageIDSender); ok {
		messageID, sendErr = idSender.SendWithMessageID(ctx, args.ToPhone, args.Message)
	} else {
		sendErr = sender.Send(ctx, args.ToPhone, args.Message)
	}

	if sendErr != nil {
		_ = w.svc.RecordDeliveryAttempt(ctx, args.TenantID, args.DeliveryID, service.DeliveryStatusFailed, "", sendErr.Error())
		return fmt.Errorf("deliver whatsapp message: %w", sendErr)
	}
	return w.svc.RecordDeliveryAttempt(ctx, args.TenantID, args.DeliveryID, service.DeliveryStatusSent, messageID, "")
}

// resolveSender picks the tenant's own Meta or gateway configuration when
// one is active, otherwise the deployment-wide fallback. Any error
// resolving the tenant config (not configured, decryption failure, ...) is
// treated the same as "not configured": fall back rather than fail the
// whole send, since the fallback (env config or noop) is always safe.
func (w *DeliverWhatsAppWorker) resolveSender(ctx context.Context, args service.DeliverWhatsAppArgs) notify.WhatsAppSender {
	cfg, err := w.svc.ResolveWhatsAppProvider(ctx, args.TenantID)
	if err != nil {
		return w.whatsApp
	}

	templateName, locale := args.MetaTemplateName, args.Locale

	switch cfg.Provider {
	case domain.WhatsAppProviderMeta:
		return notify.NewMetaWhatsAppSender(cfg.AccessToken, cfg.PhoneNumberID, templateName, locale, nil)
	case domain.WhatsAppProviderGateway:
		return notify.NewGatewayWhatsAppSender(cfg.GatewayURL, cfg.GatewayHeaderName, cfg.GatewayHeaderValue, nil)
	default:
		return w.whatsApp
	}
}

// NextRetry overrides River's default backoff with
// domain.WhatsAppRetryBackoff (exponential from 30s, capped at 1h), per
// docs/12-roadmap.md's requirement that WhatsApp delivery retry with
// backoff rather than River's default schedule.
func (w *DeliverWhatsAppWorker) NextRetry(job *river.Job[service.DeliverWhatsAppArgs]) time.Time {
	clk := w.clock
	if clk == nil {
		clk = clock.Real{}
	}
	return clk.Now().Add(domain.WhatsAppRetryBackoff(job.Attempt))
}
