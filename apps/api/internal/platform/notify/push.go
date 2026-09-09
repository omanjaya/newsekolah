package notify

import (
	"context"
	"errors"
	"fmt"
)

// Platform is where a push device is registered. Mirrors
// push_devices.platform's check constraint.
type Platform string

const (
	PlatformWeb     Platform = "web"
	PlatformIOS     Platform = "ios"
	PlatformAndroid Platform = "android"
)

// PushDevice is the minimal shape every push adapter needs, independent of
// how the notifications module stores it.
type PushDevice struct {
	Platform        Platform
	TokenOrEndpoint string // web: subscription endpoint URL; ios/android: device token
	P256dh          string // web only
	AuthKey         string // web only
}

// PushPayload is the content of one push message.
type PushPayload struct {
	Title string
	Body  string
	Href  string
	Data  map[string]string
}

// ErrDeviceGone is returned when the provider reports a device's
// registration is permanently invalid (web push 404/410, APNs
// "Unregistered", FCM "UNREGISTERED"). The caller (the notifications
// delivery worker) deletes the push_devices row on this error.
var ErrDeviceGone = errors.New("notify: push device registration is gone")

// PushSender delivers one push message to one device.
type PushSender interface {
	Send(ctx context.Context, device PushDevice, payload PushPayload) error
}

// PushGateway dispatches to the adapter registered for a device's
// platform. A platform with no adapter configured (e.g. APNS_KEY_P8 unset
// in dev) returns ErrProviderNotImplemented rather than silently dropping
// the message, so the caller can record that outcome in message_deliveries.
type PushGateway struct {
	web     PushSender
	ios     PushSender
	android PushSender
}

type PushGatewayConfig struct {
	Web     PushSender
	IOS     PushSender
	Android PushSender
}

func NewPushGateway(cfg PushGatewayConfig) *PushGateway {
	return &PushGateway{web: cfg.Web, ios: cfg.IOS, android: cfg.Android}
}

func (g *PushGateway) Send(ctx context.Context, device PushDevice, payload PushPayload) error {
	var sender PushSender
	switch device.Platform {
	case PlatformWeb:
		sender = g.web
	case PlatformIOS:
		sender = g.ios
	case PlatformAndroid:
		sender = g.android
	default:
		return fmt.Errorf("notify: unknown push platform %q", device.Platform)
	}
	if sender == nil {
		return fmt.Errorf("%w: push platform %q", ErrProviderNotImplemented, device.Platform)
	}
	return sender.Send(ctx, device, payload)
}

var _ PushSender = (*PushGateway)(nil)

type noopPushSender struct{}

func (noopPushSender) Send(context.Context, PushDevice, PushPayload) error { return nil }

// NewNoopPushGateway is used where no push credentials are configured at
// all (local dev without VAPID/APNs/FCM setup): every send succeeds
// without actually delivering anything.
func NewNoopPushGateway() *PushGateway {
	n := noopPushSender{}
	return NewPushGateway(PushGatewayConfig{Web: n, IOS: n, Android: n})
}
