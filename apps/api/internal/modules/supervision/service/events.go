package service

import (
	"context"

	"github.com/google/uuid"
)

// Event names supervision publishes; they match platform/events' constants
// (the notifications module subscribes to those), kept as plain strings
// here so the service never imports the bus.
const (
	EventObservationScheduled = "supervision.observation_scheduled"
	EventObservationCompleted = "supervision.observation_completed"
	EventResponseRecorded     = "supervision.response_recorded"
)

// Event is one supervision step someone else needs to hear about: the
// observed teacher when a visit is planned or its result is in, the
// observer when the teacher responds.
type Event struct {
	Name          string
	TenantID      uuid.UUID
	ActorUserID   uuid.UUID
	SubjectUserID uuid.UUID
	Payload       map[string]any
}

// EventPublisher hands an Event to the platform event bus; the module
// wiring adapts it (module.go's busPublisher).
type EventPublisher interface {
	Publish(ctx context.Context, evt Event) error
}

// WithEvents sets the publisher; without one nothing is announced.
func (s *Service) WithEvents(p EventPublisher) *Service {
	s.events = p
	return s
}

// publish announces an event after its transaction committed. A failed
// notification never undoes the supervision record it reports on, so the
// error is dropped, as scheduling's substitution events do.
func (s *Service) publish(ctx context.Context, evt Event) {
	if s.events == nil || evt.SubjectUserID == uuid.Nil || evt.SubjectUserID == evt.ActorUserID {
		return
	}
	_ = s.events.Publish(ctx, evt)
}
