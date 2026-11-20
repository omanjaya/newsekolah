package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
)

// auditAnnouncement is what an audit entry keeps of an announcement: what
// a reviewer needs to tell versions apart, never the full body.
type auditAnnouncement struct {
	Title          string     `json:"title"`
	Status         string     `json:"status"`
	Audience       string     `json:"audience"`
	IsPinned       bool       `json:"is_pinned"`
	StartsAt       *time.Time `json:"starts_at,omitempty"`
	EndsAt         *time.Time `json:"ends_at,omitempty"`
	RecipientCount int        `json:"recipient_count,omitempty"`
}

func toAuditAnnouncement(a domain.Announcement) *auditAnnouncement {
	return &auditAnnouncement{
		Title: a.Title, Status: string(a.Status), Audience: string(a.Audience.Type), IsPinned: a.IsPinned,
		StartsAt: a.StartsAt, EndsAt: a.EndsAt, RecipientCount: a.RecipientCount,
	}
}

// recordAnnouncementAudit writes one announcement.<verb> entry inside the
// caller's tenant transaction; a nil before or after is a create or delete.
func recordAnnouncementAudit(ctx context.Context, tenantID, id uuid.UUID, verb string, before, after *domain.Announcement) error {
	var b, a *auditAnnouncement
	if before != nil {
		b = toAuditAnnouncement(*before)
	}
	if after != nil {
		a = toAuditAnnouncement(*after)
	}
	return audit.Record(ctx, tenantID, "announcement."+verb, "announcement", id, b, a)
}
