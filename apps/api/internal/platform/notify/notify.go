// Package notify sends outbound messages: email (SMTP), WhatsApp, and push
// (web/APNs/FCM). No module sends a notification yet in this phase; these
// are the adapters later phases' notification module will call from a
// River job, never synchronously from a request handler.
package notify

import (
	"context"
	"errors"
	"fmt"
	"net/smtp"
	"net/url"
)

// ErrProviderNotImplemented is returned by a non-noop provider this phase
// has not implemented yet, rather than silently pretending to send.
var ErrProviderNotImplemented = errors.New("notify: provider not implemented")

type EmailMessage struct {
	To      string
	Subject string
	Body    string
}

type EmailSender interface {
	Send(ctx context.Context, msg EmailMessage) error
}

// NewEmailSender parses an SMTP_URL like "smtp://user:pass@host:port" (no
// credentials for the local Mailpit dev server) and returns a sender that
// delivers over that connection.
func NewEmailSender(smtpURL, fromAddress string) (EmailSender, error) {
	if smtpURL == "" {
		return noopEmailSender{}, nil
	}
	u, err := url.Parse(smtpURL)
	if err != nil {
		return nil, fmt.Errorf("parse SMTP_URL: %w", err)
	}
	return &smtpEmailSender{addr: u.Host, from: fromAddress, user: u.User}, nil
}

type noopEmailSender struct{}

func (noopEmailSender) Send(context.Context, EmailMessage) error { return nil }

type smtpEmailSender struct {
	addr string
	from string
	user *url.Userinfo
}

func (s *smtpEmailSender) Send(_ context.Context, msg EmailMessage) error {
	body := fmt.Sprintf("To: %s\r\nSubject: %s\r\n\r\n%s\r\n", msg.To, msg.Subject, msg.Body)

	var auth smtp.Auth
	if s.user != nil {
		password, _ := s.user.Password()
		auth = smtp.PlainAuth("", s.user.Username(), password, hostOnly(s.addr))
	}

	if err := smtp.SendMail(s.addr, auth, s.from, []string{msg.To}, []byte(body)); err != nil {
		return fmt.Errorf("send email: %w", err)
	}
	return nil
}

func hostOnly(addr string) string {
	for i := 0; i < len(addr); i++ {
		if addr[i] == ':' {
			return addr[:i]
		}
	}
	return addr
}

// WhatsAppSender sends a templated WhatsApp message to a phone number.
type WhatsAppSender interface {
	Send(ctx context.Context, toPhone, message string) error
}

type noopWhatsAppSender struct{}

func (noopWhatsAppSender) Send(context.Context, string, string) error { return nil }

// NewWhatsAppSender returns the noop sender for provider "noop" (the
// config default), or an error for any other provider: docs/09-tech-stack.md
// names "meta" and "fonnte" as intended providers, but wiring their
// specific APIs is not part of this phase's identity/school scope.
func NewWhatsAppSender(provider, _, _ string) (WhatsAppSender, error) {
	switch provider {
	case "", "noop":
		return noopWhatsAppSender{}, nil
	default:
		return nil, fmt.Errorf("%w: %q", ErrProviderNotImplemented, provider)
	}
}

// PushSender delivers a push notification to one registered device.
// docs/09-tech-stack.md: Web Push (VAPID), APNs, FCM v1 share one outbox;
// no push_devices consumer exists yet in this phase.
type PushSender interface {
	Send(ctx context.Context, deviceToken, title, body string) error
}

type noopPushSender struct{}

func (noopPushSender) Send(context.Context, string, string, string) error { return nil }

func NewNoopPushSender() PushSender { return noopPushSender{} }
