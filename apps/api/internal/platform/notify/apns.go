package notify

import (
	"context"
	"fmt"

	"github.com/sideshow/apns2"
	"github.com/sideshow/apns2/token"
)

// APNSConfig is token-based (.p8) APNs authentication, per
// docs/09-tech-stack.md: no certificate-based auth, no per-app renewal.
type APNSConfig struct {
	// KeyP8 is the PEM contents of the .p8 key file (not a path -- callers
	// read APNS_KEY_P8 or APNS_KEY_P8_FILE via platform/config).
	KeyP8      string
	KeyID      string
	TeamID     string
	Topic      string // the app's bundle ID
	Production bool
}

type apnsClient interface {
	PushWithContext(ctx apns2.Context, n *apns2.Notification) (*apns2.Response, error)
}

type apnsSender struct {
	client apnsClient
	topic  string
}

// NewAPNSSender returns nil when cfg is not configured, same convention as
// NewWebPushSender: a school with no iOS app installed base need not set
// APNs credentials.
func NewAPNSSender(cfg APNSConfig) (PushSender, error) {
	if cfg.KeyP8 == "" || cfg.KeyID == "" || cfg.TeamID == "" || cfg.Topic == "" {
		return nil, nil
	}

	authKey, err := token.AuthKeyFromBytes([]byte(cfg.KeyP8))
	if err != nil {
		return nil, fmt.Errorf("parse APNs .p8 key: %w", err)
	}
	tok := &token.Token{AuthKey: authKey, KeyID: cfg.KeyID, TeamID: cfg.TeamID}

	client := apns2.NewTokenClient(tok)
	if cfg.Production {
		client = client.Production()
	} else {
		client = client.Development()
	}

	return &apnsSender{client: client, topic: cfg.Topic}, nil
}

func (s *apnsSender) Send(ctx context.Context, device PushDevice, payload PushPayload) error {
	aps := map[string]any{
		"alert": map[string]string{"title": payload.Title, "body": payload.Body},
		"sound": "default",
	}
	if payload.Badge != nil {
		aps["badge"] = *payload.Badge
	}

	n := &apns2.Notification{
		DeviceToken: device.TokenOrEndpoint,
		Topic:       s.topic,
		Payload: map[string]any{
			"aps":  aps,
			"href": payload.Href,
			"data": payload.Data,
		},
	}

	resp, err := s.client.PushWithContext(ctx, n)
	if err != nil {
		return fmt.Errorf("send APNs push: %w", err)
	}
	// Unregistered/BadDeviceToken are permanently dead; ExpiredToken means
	// the provider token itself expired for that device registration --
	// APNs will never accept it again either, so it is device-gone too
	// (reference/sion-rebuild-go apns.go), not just a transient failure to
	// retry.
	switch resp.Reason {
	case apns2.ReasonUnregistered, apns2.ReasonBadDeviceToken, apns2.ReasonExpiredToken:
		return ErrDeviceGone
	}
	if !resp.Sent() {
		return fmt.Errorf("APNs rejected push: status=%d reason=%s", resp.StatusCode, resp.Reason)
	}
	return nil
}
