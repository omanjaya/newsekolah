package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
)

const (
	defaultInboxPageSize = 20
	maxInboxPageSize     = 100
)

// List returns one page of the caller's own inbox, newest first, optionally
// filtered to a text search (title/body, case-insensitive substring) and/or
// an exact notification kind. Notifications of a module the tenant switched
// off are left out (hiddenKinds), so a kind filter naming such a module
// returns an empty page.
func (s *Service) List(ctx context.Context, tenantID, userID uuid.UUID, unreadOnly bool, search, kind, cursorStr string, limit int) (domain.Page, error) {
	cursor, err := DecodeCursor(cursorStr)
	if err != nil {
		return domain.Page{}, err
	}
	if limit <= 0 {
		limit = defaultInboxPageSize
	}
	if limit > maxInboxPageSize {
		limit = maxInboxPageSize
	}
	hidden, err := s.hiddenKinds(ctx, tenantID)
	if err != nil {
		return domain.Page{}, err
	}

	var items []domain.Notification
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		items, err = s.repo.ListNotifications(ctx, tenantID, userID, hidden, unreadOnly, search, kind, cursor, limit)
		return err
	})
	if err != nil {
		return domain.Page{}, fmt.Errorf("list notifications: %w", err)
	}

	page := domain.Page{Items: items}
	if len(items) == limit {
		last := items[len(items)-1]
		page.NextCursor = EncodeCursor(last.CreatedAt, last.ID)
	}
	return page, nil
}

func (s *Service) MarkRead(ctx context.Context, tenantID, userID, notificationID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.MarkRead(ctx, tenantID, userID, notificationID)
	})
}

// MarkAllRead marks every notification the caller can see as read; those of
// a switched-off module stay unread and come back with the module.
func (s *Service) MarkAllRead(ctx context.Context, tenantID, userID uuid.UUID) error {
	hidden, err := s.hiddenKinds(ctx, tenantID)
	if err != nil {
		return err
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.MarkAllRead(ctx, tenantID, userID, hidden)
	})
}

// UnreadCount counts the caller's unread notifications, leaving out those of
// a switched-off module.
func (s *Service) UnreadCount(ctx context.Context, tenantID, userID uuid.UUID) (int64, error) {
	hidden, err := s.hiddenKinds(ctx, tenantID)
	if err != nil {
		return 0, err
	}
	var count int64
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		count, err = s.repo.CountUnread(ctx, tenantID, userID, hidden)
		return err
	})
	return count, err
}
