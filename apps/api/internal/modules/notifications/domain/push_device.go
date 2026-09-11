package domain

import (
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Platform is where a push device is registered.
type Platform string

const (
	PlatformWeb     Platform = "web"
	PlatformIOS     Platform = "ios"
	PlatformAndroid Platform = "android"
)

func (p Platform) Valid() bool {
	switch p {
	case PlatformWeb, PlatformIOS, PlatformAndroid:
		return true
	default:
		return false
	}
}

// PushDevice is one registered push endpoint/token for a user.
type PushDevice struct {
	ID              uuid.UUID
	UserID          uuid.UUID
	Platform        Platform
	TokenOrEndpoint string
	P256dh          string
	AuthKey         string
	DeviceName      string
	FailureCount    int
	ExpiresAt       time.Time
}

// MaxPushFailures is how many consecutive delivery failures a device
// tolerates before the pruning job removes it, independent of any
// immediate 404/410 removal the delivery worker already does.
const MaxPushFailures = 5

// MaxDeviceTokenLength matches the old app's registerPushDeviceToken
// (reference/sion-rebuild-go apns.go): an APNs/FCM device token this long
// is already implausible and worth rejecting up front.
const MaxDeviceTokenLength = 255

// allowedWebPushHosts are the browser vendors' own push services. A web
// push endpoint must be https and its host must be one of these (exact
// match or a subdomain), matching the old app's allowedPushEndpoint
// (reference/sion-rebuild-go notifications.go) -- otherwise this server
// could be used to relay arbitrary POST requests to any https host a
// caller names.
var allowedWebPushHosts = []string{
	"fcm.googleapis.com",
	"push.services.mozilla.com",
	"web.push.apple.com",
	"notify.windows.com",
	"wns.windows.com",
}

// ValidateWebPushEndpoint enforces https and the browser-vendor host
// allowlist on a web push subscription endpoint.
func ValidateWebPushEndpoint(endpoint string) error {
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme != "https" || parsed.User != nil || parsed.Hostname() == "" {
		return ErrInvalidPushEndpoint
	}
	host := strings.ToLower(parsed.Hostname())
	for _, suffix := range allowedWebPushHosts {
		if host == suffix || strings.HasSuffix(host, "."+suffix) {
			return nil
		}
	}
	return ErrInvalidPushEndpoint
}
