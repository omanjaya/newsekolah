package service

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/domain"
)

// Detail is an announcement plus its live read count for the admin view.
type Detail struct {
	Announcement domain.Announcement
	ReadCount    int64
}

func (s *Service) Create(ctx context.Context, tenantID, senderUserID uuid.UUID, in Input) (domain.Announcement, error) {
	if err := in.validate(); err != nil {
		return domain.Announcement{}, err
	}
	cleanHTML, text := sanitize(in.BodyHTML)
	var out domain.Announcement
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.Create(ctx, domain.Announcement{
			TenantID: tenantID, SenderUserID: senderUserID, Title: strings.TrimSpace(in.Title),
			BodyHTML: cleanHTML, BodyText: text, Audience: in.Audience, IsPinned: in.IsPinned,
			Status: domain.StatusDraft, StartsAt: in.StartsAt, EndsAt: in.EndsAt,
		})
		return err
	})
	return out, err
}

func (s *Service) Update(ctx context.Context, tenantID, id uuid.UUID, in Input) (domain.Announcement, error) {
	if err := in.validate(); err != nil {
		return domain.Announcement{}, err
	}
	cleanHTML, text := sanitize(in.BodyHTML)
	var out domain.Announcement
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, err := s.repo.Get(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !current.Editable() {
			return domain.ErrInvalidStatus
		}
		current.Title = strings.TrimSpace(in.Title)
		current.BodyHTML, current.BodyText = cleanHTML, text
		current.Audience, current.IsPinned = in.Audience, in.IsPinned
		current.StartsAt, current.EndsAt = in.StartsAt, in.EndsAt
		out, err = s.repo.Update(ctx, current)
		return err
	})
	return out, err
}

func (s *Service) Get(ctx context.Context, tenantID, id uuid.UUID) (Detail, error) {
	var out Detail
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		a, err := s.repo.Get(ctx, tenantID, id)
		if err != nil {
			return err
		}
		reads, err := s.repo.CountReads(ctx, tenantID, id)
		if err != nil {
			return err
		}
		out = Detail{Announcement: a, ReadCount: reads}
		return nil
	})
	return out, err
}

// Page is one slice of the admin list; NextCursor is empty on the last page.
type Page struct {
	Items      []domain.Announcement
	NextCursor string
}

func (s *Service) List(ctx context.Context, tenantID uuid.UUID, status, cursorStr string, limit int) (Page, error) {
	cursor, err := DecodeCursor(cursorStr)
	if err != nil {
		return Page{}, err
	}
	limit = clampLimit(limit)
	var page Page
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		items, err := s.repo.ListForAdmin(ctx, tenantID, status, cursor, limit+1)
		if err != nil {
			return err
		}
		if len(items) > limit {
			last := items[limit-1]
			page.NextCursor = EncodeCursor(last.CreatedAt, last.ID)
			items = items[:limit]
		}
		page.Items = items
		return nil
	})
	return page, err
}

func (s *Service) Delete(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if _, err := s.repo.Get(ctx, tenantID, id); err != nil {
			return err
		}
		return s.repo.Delete(ctx, tenantID, id)
	})
}

// Publish moves a draft or scheduled announcement to published, fans a
// notification out to the resolved audience, and records how many people
// it reached.
func (s *Service) Publish(ctx context.Context, tenantID, id uuid.UUID) (domain.Announcement, error) {
	var out domain.Announcement
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.publishLocked(ctx, tenantID, id)
		return err
	})
	return out, err
}

func (s *Service) publishLocked(ctx context.Context, tenantID, id uuid.UUID) (domain.Announcement, error) {
	current, err := s.repo.Get(ctx, tenantID, id)
	if err != nil {
		return domain.Announcement{}, err
	}
	if !current.Editable() {
		return domain.Announcement{}, domain.ErrInvalidStatus
	}
	recipients, err := s.resolveAudience(ctx, tenantID, current.Audience)
	if err != nil {
		return domain.Announcement{}, err
	}
	if len(recipients) == 0 {
		return domain.Announcement{}, domain.ErrAudienceEmpty
	}
	published, err := s.repo.SetStatus(ctx, tenantID, id, domain.StatusPublished)
	if err != nil {
		return domain.Announcement{}, err
	}
	if err := s.repo.SetRecipientCount(ctx, tenantID, id, len(recipients)); err != nil {
		return domain.Announcement{}, err
	}
	published.RecipientCount = len(recipients)
	if err := s.notifier.AnnouncementPublished(ctx, tenantID, recipients, published); err != nil {
		return domain.Announcement{}, err
	}
	return published, nil
}

// Schedule parks a draft until its starts_at, when PublishDue picks it up.
func (s *Service) Schedule(ctx context.Context, tenantID, id uuid.UUID) (domain.Announcement, error) {
	var out domain.Announcement
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, err := s.repo.Get(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if current.Status != domain.StatusDraft {
			return domain.ErrInvalidStatus
		}
		if current.StartsAt == nil || !current.StartsAt.After(s.clock.Now()) {
			return domain.ErrScheduleNeedsStart
		}
		out, err = s.repo.SetStatus(ctx, tenantID, id, domain.StatusScheduled)
		return err
	})
	return out, err
}

func (s *Service) Archive(ctx context.Context, tenantID, id uuid.UUID) (domain.Announcement, error) {
	var out domain.Announcement
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, err := s.repo.Get(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if current.Status != domain.StatusPublished && current.Status != domain.StatusScheduled {
			return domain.ErrInvalidStatus
		}
		out, err = s.repo.SetStatus(ctx, tenantID, id, domain.StatusArchived)
		return err
	})
	return out, err
}

// PublishDue is the periodic job body: every scheduled announcement whose
// starts_at has passed is published in its own tenant transaction, so one
// tenant's empty audience never blocks another's. Tenants are visited one
// by one because the table is only readable inside a tenant transaction.
func (s *Service) PublishDue(ctx context.Context) (published int, errs []error) {
	tenantIDs, err := s.repo.ListActiveTenantIDs(ctx)
	if err != nil {
		return 0, []error{err}
	}
	for _, tenantID := range tenantIDs {
		var due []domain.Announcement
		if err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
			var err error
			due, err = s.repo.ListDueScheduled(ctx)
			return err
		}); err != nil {
			errs = append(errs, err)
			continue
		}
		for _, a := range due {
			err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
				_, err := s.publishLocked(ctx, tenantID, a.ID)
				return err
			})
			if err != nil {
				errs = append(errs, err)
				continue
			}
			published++
		}
	}
	return published, errs
}

// FeedItem is one row of a reader's announcement list.
type FeedItem struct {
	Announcement domain.Announcement
	IsRead       bool
}

// ListForUser returns the published, in-window announcements addressed to
// userID, pinned first.
func (s *Service) ListForUser(ctx context.Context, tenantID, userID uuid.UUID) ([]FeedItem, error) {
	var out []FeedItem
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		active, err := s.repo.ListActiveForTenant(ctx, tenantID)
		if err != nil {
			return err
		}
		visible, err := s.filterVisible(ctx, tenantID, userID, active)
		if err != nil {
			return err
		}
		ids := make([]uuid.UUID, len(visible))
		for i, a := range visible {
			ids[i] = a.ID
		}
		read := map[uuid.UUID]bool{}
		if len(ids) > 0 {
			readIDs, err := s.repo.ReadIDsForUser(ctx, tenantID, userID, ids)
			if err != nil {
				return err
			}
			for _, id := range readIDs {
				read[id] = true
			}
		}
		out = make([]FeedItem, len(visible))
		for i, a := range visible {
			out[i] = FeedItem{Announcement: a, IsRead: read[a.ID]}
		}
		return nil
	})
	return out, err
}

func (s *Service) MarkRead(ctx context.Context, tenantID, userID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		a, err := s.repo.Get(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if a.Status != domain.StatusPublished {
			return domain.ErrNotFound
		}
		return s.repo.MarkRead(ctx, tenantID, id, userID)
	})
}
