package notify

import (
	"fmt"
	"log/slog"
)

// Senders bundles the three outbound channels the delivery workers need.
type Senders struct {
	Push     PushSender
	Email    EmailSender
	WhatsApp WhatsAppSender
}

// SendersConfig is the provider configuration, already resolved from the
// environment by the caller so this package never reads env itself.
type SendersConfig struct {
	SMTPURL   string
	EmailFrom string

	WhatsAppProvider string
	WhatsAppToken    string
	WhatsAppPhoneID  string

	WebPush WebPushConfig
	APNS    APNSConfig
	FCM     FCMConfig
}

// NewSenders builds every configured adapter. A channel whose provider is
// not configured degrades to a no-op (email, WhatsApp) or to
// ErrProviderNotImplemented per platform (push), and is logged once here
// so operators can see which channels are live.
func NewSenders(cfg SendersConfig, logger *slog.Logger) (Senders, error) {
	if logger == nil {
		logger = slog.Default()
	}
	email, err := NewEmailSender(cfg.SMTPURL, cfg.EmailFrom)
	if err != nil {
		return Senders{}, fmt.Errorf("email sender: %w", err)
	}
	whatsApp, err := NewWhatsAppSender(cfg.WhatsAppProvider, cfg.WhatsAppToken, cfg.WhatsAppPhoneID, logger)
	if err != nil {
		return Senders{}, fmt.Errorf("whatsapp sender: %w", err)
	}

	gateway := PushGatewayConfig{}
	if cfg.WebPush.PublicKey != "" && cfg.WebPush.PrivateKey != "" {
		gateway.Web = NewWebPushSender(cfg.WebPush)
	} else {
		logger.Info("web push disabled: VAPID keys not configured")
	}
	if cfg.APNS.KeyP8 != "" {
		sender, err := NewAPNSSender(cfg.APNS)
		if err != nil {
			return Senders{}, fmt.Errorf("apns sender: %w", err)
		}
		gateway.IOS = sender
	} else {
		logger.Info("apns push disabled: APNS_KEY_P8 not configured")
	}
	if cfg.FCM.ServiceAccountJSON != "" {
		sender, err := NewFCMSender(cfg.FCM)
		if err != nil {
			return Senders{}, fmt.Errorf("fcm sender: %w", err)
		}
		gateway.Android = sender
	} else {
		logger.Info("fcm push disabled: FCM_SERVICE_ACCOUNT_JSON not configured")
	}

	return Senders{Push: NewPushGateway(gateway), Email: email, WhatsApp: whatsApp}, nil
}
