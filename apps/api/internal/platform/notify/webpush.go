package notify

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// WebPushConfig is the VAPID key pair used to sign every Web Push request.
// Generate one with `webpush.GenerateVAPIDKeys()`; docs/09-tech-stack.md
// section on push expects it configured via VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY.
type WebPushConfig struct {
	PublicKey  string
	PrivateKey string
	// Subject is a mailto: or https: URL identifying the sender, required
	// by the VAPID spec and sent in the JWT's "sub" claim.
	Subject string
}

type webPushSender struct {
	cfg WebPushConfig
}

// NewWebPushSender returns nil (not an error) when cfg has no keys
// configured, matching the rest of this package's pattern of degrading to
// "not implemented" per platform rather than failing startup -- a school
// running only iOS/Android devices should not need VAPID keys.
func NewWebPushSender(cfg WebPushConfig) PushSender {
	if cfg.PublicKey == "" || cfg.PrivateKey == "" {
		return nil
	}
	return &webPushSender{cfg: cfg}
}

func (s *webPushSender) Send(ctx context.Context, device PushDevice, payload PushPayload) error {
	body, err := json.Marshal(map[string]any{
		"title": payload.Title,
		"body":  payload.Body,
		"href":  payload.Href,
		"data":  payload.Data,
	})
	if err != nil {
		return fmt.Errorf("marshal web push payload: %w", err)
	}

	sub := &webpush.Subscription{
		Endpoint: device.TokenOrEndpoint,
		Keys:     webpush.Keys{Auth: device.AuthKey, P256dh: device.P256dh},
	}

	resp, err := webpush.SendNotificationWithContext(ctx, body, sub, &webpush.Options{
		Subscriber:      s.cfg.Subject,
		VAPIDPublicKey:  s.cfg.PublicKey,
		VAPIDPrivateKey: s.cfg.PrivateKey,
		TTL:             3600,
		Urgency:         webpush.UrgencyHigh,
		Topic:           payload.Topic,
	})
	if err != nil {
		return fmt.Errorf("send web push: %w", err)
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
		return ErrDeviceGone
	}
	if resp.StatusCode >= 300 {
		return fmt.Errorf("web push provider returned status %d", resp.StatusCode)
	}
	return nil
}
