// Package repository implements notifications/service.Repository using
// sqlc's generated Queries.
package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

type Repository struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

var _ service.Repository = (*Repository)(nil)

func (r *Repository) queries(ctx context.Context) *db.Queries {
	if tx, ok := pdatabase.TxFromContext(ctx); ok {
		return db.New(tx)
	}
	return db.New(r.pool)
}

func (r *Repository) InsertNotification(ctx context.Context, tenantID, userID uuid.UUID, kind domain.Kind, title, body, href string, data map[string]any, announcementID uuid.NullUUID) (domain.Notification, error) {
	payload, err := marshalData(data)
	if err != nil {
		return domain.Notification{}, fmt.Errorf("marshal notification data: %w", err)
	}
	row, err := r.queries(ctx).InsertNotification(ctx, db.InsertNotificationParams{
		TenantID: tenantID, UserID: userID, Kind: string(kind), Title: title, Body: body,
		Href: pdatabase.Text(href), Data: payload, AnnouncementID: pdatabase.NullUUID(announcementID),
	})
	if err != nil {
		return domain.Notification{}, fmt.Errorf("insert notification: %w", err)
	}
	return toNotification(row)
}

func (r *Repository) ListNotifications(ctx context.Context, tenantID, userID uuid.UUID, unreadOnly bool, search, kind string, cursor service.Cursor, limit int) ([]domain.Notification, error) {
	rows, err := r.queries(ctx).ListNotificationsForUser(ctx, db.ListNotificationsForUserParams{
		TenantID: tenantID, UserID: userID, UnreadOnly: unreadOnly, Search: search, Kind: kind,
		HasCursor: cursor.Present, CursorCreatedAt: pdatabase.Timestamptz(cursor.CreatedAt), CursorID: cursor.ID,
		PageLimit: int32(limit), //nolint:gosec // limit is clamped to <=100 by the service before this call
	})
	if err != nil {
		return nil, fmt.Errorf("list notifications: %w", err)
	}
	return toNotifications(rows)
}

func (r *Repository) GetNotification(ctx context.Context, tenantID, id uuid.UUID) (domain.Notification, error) {
	row, err := r.queries(ctx).GetNotificationByID(ctx, db.GetNotificationByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.Notification{}, fmt.Errorf("get notification: %w", err)
	}
	return toNotification(row)
}

func (r *Repository) MarkRead(ctx context.Context, tenantID, userID, id uuid.UUID) error {
	return r.queries(ctx).MarkNotificationRead(ctx, db.MarkNotificationReadParams{TenantID: tenantID, UserID: userID, ID: id})
}

func (r *Repository) MarkAllRead(ctx context.Context, tenantID, userID uuid.UUID) error {
	return r.queries(ctx).MarkAllNotificationsRead(ctx, db.MarkAllNotificationsReadParams{TenantID: tenantID, UserID: userID})
}

func (r *Repository) CountUnread(ctx context.Context, tenantID, userID uuid.UUID) (int64, error) {
	return r.queries(ctx).CountUnreadNotifications(ctx, db.CountUnreadNotificationsParams{TenantID: tenantID, UserID: userID})
}

func (r *Repository) ListUnreadSince(ctx context.Context, tenantID, userID uuid.UUID, since time.Time) ([]domain.Notification, error) {
	rows, err := r.queries(ctx).ListUnreadNotificationsSince(ctx, db.ListUnreadNotificationsSinceParams{
		TenantID: tenantID, UserID: userID, CreatedAt: pdatabase.Timestamptz(since),
	})
	if err != nil {
		return nil, fmt.Errorf("list unread notifications since: %w", err)
	}
	return toNotifications(rows)
}

func (r *Repository) DeleteReadOlderThan(ctx context.Context, tenantID uuid.UUID, cutoff time.Time) (int64, error) {
	return r.queries(ctx).DeleteReadNotificationsOlderThan(ctx, db.DeleteReadNotificationsOlderThanParams{
		TenantID: tenantID, CreatedAt: pdatabase.Timestamptz(cutoff),
	})
}

func (r *Repository) EnsurePartition(ctx context.Context, month time.Time) error {
	return db.New(r.pool).EnsureNotificationsPartition(ctx, pdatabase.Date(month))
}

func marshalData(data map[string]any) ([]byte, error) {
	if data == nil {
		return []byte("{}"), nil
	}
	return json.Marshal(data)
}

func unmarshalData(raw []byte) map[string]any {
	if len(raw) == 0 {
		return nil
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil
	}
	return out
}

func toNotification(row db.Notification) (domain.Notification, error) {
	return domain.Notification{
		ID:             row.ID,
		TenantID:       row.TenantID,
		UserID:         row.UserID,
		Kind:           domain.Kind(row.Kind),
		Title:          row.Title,
		Body:           row.Body,
		Href:           pdatabase.TextOrEmpty(row.Href),
		Data:           unmarshalData(row.Data),
		AnnouncementID: pdatabase.UUIDOrNil(row.AnnouncementID),
		ReadAt:         pdatabase.TimePtr(row.ReadAt),
		CreatedAt:      pdatabase.TimeOrZero(row.CreatedAt),
	}, nil
}

func toNotifications(rows []db.Notification) ([]domain.Notification, error) {
	out := make([]domain.Notification, len(rows))
	for i, row := range rows {
		n, err := toNotification(row)
		if err != nil {
			return nil, err
		}
		out[i] = n
	}
	return out, nil
}
