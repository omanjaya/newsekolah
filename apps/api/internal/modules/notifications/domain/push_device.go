package domain

import (
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
