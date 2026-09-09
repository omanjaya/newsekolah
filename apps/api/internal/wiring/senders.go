// Package wiring holds construction helpers shared by cmd/api and
// cmd/worker so the two processes configure providers identically.
package wiring

import (
	"context"
	"log/slog"

	reportsjobs "github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/transport/jobs"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/notify"
)

// SendersFromConfig maps the environment-derived config onto the notify
// adapters. A misconfigured provider is logged and replaced by no-ops
// rather than stopping the process: notifications still land in the inbox.
func SendersFromConfig(cfg config.Config, logger *slog.Logger) notify.Senders {
	from := "noreply@" + cfg.BaseDomain
	if cfg.BaseDomain == "" {
		from = "noreply@localhost"
	}
	senders, err := notify.NewSenders(notify.SendersConfig{
		SMTPURL: cfg.SMTPURL, EmailFrom: from,
		WhatsAppProvider: cfg.WhatsAppProvider, WhatsAppToken: cfg.WhatsAppToken, WhatsAppPhoneID: cfg.WhatsAppPhoneID,
		WebPush: notify.WebPushConfig{PublicKey: cfg.VAPIDPublicKey, PrivateKey: cfg.VAPIDPrivateKey, Subject: cfg.VAPIDSubject},
		APNS:    notify.APNSConfig{KeyP8: cfg.APNSKeyP8, KeyID: cfg.APNSKeyID, TeamID: cfg.APNSTeamID, Topic: cfg.APNSTopic, Production: cfg.APNSProduction},
		FCM:     notify.FCMConfig{ProjectID: cfg.FCMProjectID, ServiceAccountJSON: cfg.FCMServiceAccountJSON},
	}, logger)
	if err != nil {
		logger.Warn("notification providers misconfigured; falling back to no-op senders", "error", err)
		fallback, _ := notify.NewSenders(notify.SendersConfig{}, logger)
		return fallback
	}
	return senders
}

// ReportsEmailSender adapts platform/notify.EmailSender to the report
// schedule job's own narrow EmailSender interface, so that package does
// not need to import platform/notify just to name its message type.
type ReportsEmailSender struct{ Email notify.EmailSender }

func (r ReportsEmailSender) Send(ctx context.Context, msg reportsjobs.EmailMessage) error {
	return r.Email.Send(ctx, notify.EmailMessage{
		To: msg.To, Subject: msg.Subject, TextBody: msg.TextBody, HTMLBody: msg.HTMLBody,
	})
}
