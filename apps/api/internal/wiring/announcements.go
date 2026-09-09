package wiring

import (
	"context"
	"strings"

	"github.com/google/uuid"

	announcementsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/domain"
	notificationsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
	notificationsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/service"
)

// AnnouncementNotifier fans a published announcement into the
// notifications inbox. Announcements never import notifications; this is
// the only bridge.
type AnnouncementNotifier struct{ Svc *notificationsservice.Service }

func (n AnnouncementNotifier) AnnouncementPublished(ctx context.Context, tenantID uuid.UUID, recipientIDs []uuid.UUID, a announcementsdomain.Announcement) error {
	body := a.BodyText
	if runes := []rune(body); len(runes) > 160 {
		body = strings.TrimSpace(string(runes[:160])) + "..."
	}
	return n.Svc.Notify(ctx, tenantID, notificationsservice.Notification{
		UserIDs: recipientIDs, Kind: notificationsdomain.KindAnnouncementPublished,
		Title: a.Title, Body: body, Href: "/announcements/" + a.ID.String(),
		Data:           map[string]any{"announcement_id": a.ID.String(), "is_pinned": a.IsPinned},
		AnnouncementID: uuid.NullUUID{UUID: a.ID, Valid: true},
	})
}
