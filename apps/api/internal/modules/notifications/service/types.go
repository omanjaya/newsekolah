// Package service implements the notifications module's use cases: Notify
// (insert inbox rows and enqueue delivery jobs atomically), the inbox
// (list/read), preferences (per user, with tenant defaults, quiet hours,
// digest), push device registration, and event-to-notification mapping.
// Orchestrates the Repository and JobInserter but holds no SQL and no HTTP
// concerns, per docs/03-layered-architecture.md section 1.
package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
)

// Notification is what a caller (another module's service, or this
// module's own event handlers) asks Notify to send. UserIDs are the
// resolved recipients -- Notify never looks up "who should get this",
// that is the caller's job (e.g. announcements resolves its audience
// before calling this).
type Notification struct {
	UserIDs        []uuid.UUID
	Kind           domain.Kind
	Title          string
	Body           string
	Href           string
	Data           map[string]any
	AnnouncementID uuid.NullUUID
}

// RealtimeEvent is one push to a connected client over the websocket hub
// the scheduling module builds (see RealtimePublisher).
type RealtimeEvent struct {
	Type    string // e.g. "notification_created"
	Payload map[string]any
}

// RealtimePublisher pushes a realtime event to one user's connected
// clients. The scheduling module owns the actual WebSocket hub; until that
// is wired in after merge, NoopRealtimePublisher is used so Notify's
// behavior does not depend on realtime delivery ever succeeding.
//
// Publish takes tenantID explicitly rather than expecting an implementation
// to pull it from ctx: Notify's caller may be an HTTP request (whose ctx
// an adapter could otherwise read a resolved tenant from) or a background
// job -- a scheduled reminder, a river.Worker's Work(ctx, job) -- whose ctx
// never carries one. notifyOne already has tenantID in scope from Notify's
// own parameter, so passing it here costs nothing and keeps every
// implementation correct regardless of which kind of caller triggered it.
type RealtimePublisher interface {
	Publish(ctx context.Context, tenantID, userID uuid.UUID, event RealtimeEvent) error
}

type NoopRealtimePublisher struct{}

func (NoopRealtimePublisher) Publish(context.Context, uuid.UUID, uuid.UUID, RealtimeEvent) error {
	return nil
}

// PreferenceUpdate is one (kind, channel) -> enabled row a user is setting.
type PreferenceUpdate struct {
	Kind    domain.Kind
	Channel domain.Channel
	Enabled bool
}

// SettingsUpdate is a user's quiet-hours/digest configuration.
type SettingsUpdate struct {
	QuietHoursStart *int
	QuietHoursEnd   *int
	DigestEnabled   bool
	DigestHour      int
}

// PushDeviceRegistration is what a client submits to register for push.
type PushDeviceRegistration struct {
	Platform        domain.Platform
	TokenOrEndpoint string
	P256dh          string
	AuthKey         string
	DeviceName      string
}
