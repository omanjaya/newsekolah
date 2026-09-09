package domain

import (
	"time"

	"github.com/google/uuid"
)

type WebhookStatus string

const (
	WebhookActive   WebhookStatus = "active"
	WebhookDisabled WebhookStatus = "disabled"
)

// DisableAfterConsecutiveFailures is how many deliveries in a row must
// exhaust their retries before an endpoint is disabled automatically
// (docs/14-public-api.md): a handful of endpoints failing occasionally
// (a receiver's brief outage) should not disable it, but one that never
// recovers should stop being tried on every event forever.
const DisableAfterConsecutiveFailures = 5

type WebhookEndpoint struct {
	ID                  uuid.UUID
	TenantID            uuid.UUID
	URL                 string
	Description         string
	EventTypes          []string
	SigningSecret       []byte // plaintext, decrypted by the repository; never logged
	Status              WebhookStatus
	DisabledReason      string
	ConsecutiveFailures int
	CreatedBy           uuid.UUID
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

// Subscribes reports whether the endpoint should receive eventType.
func (e WebhookEndpoint) Subscribes(eventType string) bool {
	for _, t := range e.EventTypes {
		if t == eventType {
			return true
		}
	}
	return false
}

func (e WebhookEndpoint) Enabled() bool { return e.Status == WebhookActive }

// ShouldDisable reports whether consecutiveFailures (as it stands after the
// delivery that just exhausted its retries) has crossed the threshold.
func ShouldDisable(consecutiveFailures int) bool {
	return consecutiveFailures >= DisableAfterConsecutiveFailures
}

type DeliveryStatus string

const (
	// DeliveryPending covers both "not attempted yet" and "an attempt
	// failed but a retry is still scheduled" -- next_attempt_at is what
	// tells the two apart, so the log shows "retrying" rather than a
	// misleading "failed" for something the worker will try again.
	DeliveryPending DeliveryStatus = "pending"
	DeliverySuccess DeliveryStatus = "success"
	// DeliveryFailed is terminal: automatic retries are exhausted (or a
	// manual retry attempt failed again). Only this status can be retried
	// manually.
	DeliveryFailed DeliveryStatus = "failed"
)

// MaxDeliveryAttempts is how many times one delivery is retried before it
// is marked exhausted and counted against its endpoint's consecutive
// failure streak.
const MaxDeliveryAttempts = 8

type Delivery struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	EndpointID     uuid.UUID
	EventType      string
	EventID        uuid.UUID
	Payload        []byte
	Status         DeliveryStatus
	AttemptCount   int
	LastStatusCode *int
	LastError      string
	DeliveredAt    *time.Time
	NextAttemptAt  *time.Time
	CreatedAt      time.Time
}

// Retryable reports whether a manual retry action may act on this
// delivery: only a delivery that has stopped trying on its own.
func (d Delivery) Retryable() bool {
	return d.Status == DeliveryFailed
}
