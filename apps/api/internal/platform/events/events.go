// Package events is an in-process publish/subscribe bus for domain events
// (docs/03-layered-architecture.md section 1: "modul permits membutuhkan
// wali kelas dari modul academic" is one axis of cross-module
// communication; domain events handled in-process, in the same
// transaction, are the other). No module publishes an event yet in this
// phase; identity and school communicate only through the narrow reader
// interfaces each declares (e.g. identity/service.AcademicYearReader).
package events

import (
	"context"
	"sync"
)

// Event is any domain event. Concrete event types live in their owning
// module (e.g. permits.LeaveRequestIssued), not here.
type Event interface {
	EventName() string
}

// Handler processes one event. It runs synchronously, in the caller's
// transaction when the caller is inside one -- a handler that needs to
// defer work (e.g. send a notification) should enqueue a River job instead
// of doing I/O directly.
type Handler func(ctx context.Context, evt Event) error

// Bus is a minimal in-process event bus: Subscribe at wiring time,
// Publish from a service after its own writes succeed.
type Bus struct {
	mu       sync.RWMutex
	handlers map[string][]Handler
}

func NewBus() *Bus {
	return &Bus{handlers: make(map[string][]Handler)}
}

func (b *Bus) Subscribe(eventName string, h Handler) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.handlers[eventName] = append(b.handlers[eventName], h)
}

// Publish calls every handler registered for evt.EventName(), in
// registration order, stopping at the first error.
func (b *Bus) Publish(ctx context.Context, evt Event) error {
	b.mu.RLock()
	handlers := append([]Handler(nil), b.handlers[evt.EventName()]...)
	b.mu.RUnlock()

	for _, h := range handlers {
		if err := h(ctx, evt); err != nil {
			return err
		}
	}
	return nil
}
