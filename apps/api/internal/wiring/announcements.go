package wiring

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	announcementsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/domain"
	notificationsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
	notificationsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
)

// AnnouncementNotifier fans a published announcement into the
// notifications inbox and onto the event bus (events.AnnouncementPublished,
// which the integrations module delivers to subscribed webhooks).
// Announcements never import notifications or the bus; this is the only
// bridge. Notifications does not subscribe to that event name, so the
// inbox entry is never written twice.
type AnnouncementNotifier struct {
	Svc *notificationsservice.Service
	Bus *events.Bus // nil: no webhook fan-out
}

func (n AnnouncementNotifier) AnnouncementPublished(ctx context.Context, tenantID uuid.UUID, recipientIDs []uuid.UUID, a announcementsdomain.Announcement) error {
	body := a.BodyText
	if runes := []rune(body); len(runes) > 160 {
		body = strings.TrimSpace(string(runes[:160])) + "..."
	}
	href := "/announcements/" + a.ID.String()
	if err := n.Svc.Notify(ctx, tenantID, notificationsservice.Notification{
		UserIDs: recipientIDs, Kind: notificationsdomain.KindAnnouncementPublished,
		Title: a.Title, Body: body, Href: href,
		Data:           map[string]any{"announcement_id": a.ID.String(), "is_pinned": a.IsPinned},
		AnnouncementID: uuid.NullUUID{UUID: a.ID, Valid: true},
	}); err != nil {
		return err
	}
	if n.Bus == nil {
		return nil
	}
	return n.Bus.Publish(ctx, announcementPublishedEnvelope(tenantID, a, href))
}

// announcementPublishedEnvelope is the announcement.published payload a
// webhook receiver gets: identifiers and counts, never the recipient list.
func announcementPublishedEnvelope(tenantID uuid.UUID, a announcementsdomain.Announcement, href string) events.Envelope {
	payload := map[string]any{
		"announcement_id": a.ID.String(),
		"title":           a.Title,
		"audience":        string(a.Audience.Type),
		"is_pinned":       a.IsPinned,
		"recipient_count": a.RecipientCount,
		"href":            href,
	}
	if a.PublishedAt != nil {
		payload["published_at"] = a.PublishedAt.UTC().Format(time.RFC3339)
	}
	return events.Envelope{Name: events.AnnouncementPublished, Tenant: tenantID, Actor: a.SenderUserID, Payload: payload}
}
