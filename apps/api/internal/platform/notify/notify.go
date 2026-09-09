// Package notify sends outbound messages: email (SMTP), WhatsApp, and push
// (web/APNs/FCM). The notifications module's delivery worker is the only
// caller -- adapters here are never invoked synchronously from a request
// handler, so a slow provider cannot stall an HTTP response.
package notify

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"mime"
	"net/smtp"
	"net/url"
	"strings"
)

// ErrProviderNotImplemented is returned by a non-noop provider this phase
// has not implemented yet, rather than silently pretending to send.
var ErrProviderNotImplemented = errors.New("notify: provider not implemented")

// EmailMessage carries both a plain-text and an HTML body; the SMTP sender
// sends a multipart/alternative message so either can render.
type EmailMessage struct {
	To       string
	Subject  string
	TextBody string
	HTMLBody string
}

type EmailSender interface {
	Send(ctx context.Context, msg EmailMessage) error
}

// NewEmailSender parses an SMTP_URL like "smtp://user:pass@host:port" (no
// credentials for the local Mailpit dev server) and returns a sender that
// delivers over that connection. An empty smtpURL returns a sender that
// silently succeeds, for environments (tests, a school with no configured
// mail relay) that never actually need email delivery.
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
	body := buildMultipartEmail(s.from, msg)

	var auth smtp.Auth
	if s.user != nil {
		password, _ := s.user.Password()
		auth = smtp.PlainAuth("", s.user.Username(), password, hostOnly(s.addr))
	}

	if err := smtp.SendMail(s.addr, auth, s.from, []string{msg.To}, body); err != nil {
		return fmt.Errorf("send email: %w", err)
	}
	return nil
}

// buildMultipartEmail renders a minimal multipart/alternative RFC 5322
// message by hand (text/plain first, then text/html), rather than pulling
// in a MIME-building dependency for two parts.
func buildMultipartEmail(from string, msg EmailMessage) []byte {
	const boundary = "newsekolah-notify-boundary"

	var b strings.Builder
	fmt.Fprintf(&b, "From: %s\r\n", from)
	fmt.Fprintf(&b, "To: %s\r\n", msg.To)
	fmt.Fprintf(&b, "Subject: %s\r\n", mime.QEncoding.Encode("UTF-8", msg.Subject))
	fmt.Fprintf(&b, "MIME-Version: 1.0\r\n")
	fmt.Fprintf(&b, "Content-Type: multipart/alternative; boundary=%q\r\n\r\n", boundary)

	fmt.Fprintf(&b, "--%s\r\n", boundary)
	b.WriteString("Content-Type: text/plain; charset=UTF-8\r\n\r\n")
	b.WriteString(msg.TextBody)
	b.WriteString("\r\n\r\n")

	fmt.Fprintf(&b, "--%s\r\n", boundary)
	b.WriteString("Content-Type: text/html; charset=UTF-8\r\n\r\n")
	b.WriteString(msg.HTMLBody)
	b.WriteString("\r\n\r\n")

	fmt.Fprintf(&b, "--%s--\r\n", boundary)
	return []byte(b.String())
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

// noopWhatsAppSender is the WHATSAPP_PROVIDER=noop (default) implementation:
// it logs the message it would have sent instead of silently discarding
// it, so a school that has not configured WhatsApp yet can still see in
// its logs which notifications would have gone out.
type noopWhatsAppSender struct {
	logger *slog.Logger
}

func (s noopWhatsAppSender) Send(_ context.Context, toPhone, message string) error {
	s.logger.Info("whatsapp send skipped (WHATSAPP_PROVIDER=noop)", "to", toPhone, "message", message)
	return nil
}

// NewWhatsAppSender returns the logging noop sender for provider "noop"
// (the config default), or the Meta Cloud API sender for "meta".
func NewWhatsAppSender(provider, token, phoneID string, logger *slog.Logger) (WhatsAppSender, error) {
	if logger == nil {
		logger = slog.Default()
	}
	switch provider {
	case "", "noop":
		return noopWhatsAppSender{logger: logger}, nil
	case "meta":
		return newMetaWhatsAppSender(token, phoneID), nil
	default:
		return nil, fmt.Errorf("%w: %q", ErrProviderNotImplemented, provider)
	}
}
