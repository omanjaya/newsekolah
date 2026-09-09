// Package service holds the announcements use cases: authoring, the
// draft/scheduled/published/archived lifecycle, audience resolution, and the
// per-reader feed. Delivery of the "new announcement" notification is
// delegated to a Notifier so this module never imports notifications.
package service

import (
	"context"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// Repository is the data boundary; repository/ implements it with sqlc.
type Repository interface {
	Create(ctx context.Context, a domain.Announcement) (domain.Announcement, error)
	Get(ctx context.Context, tenantID, id uuid.UUID) (domain.Announcement, error)
	Update(ctx context.Context, a domain.Announcement) (domain.Announcement, error)
	SetStatus(ctx context.Context, tenantID, id uuid.UUID, status domain.Status) (domain.Announcement, error)
	SetRecipientCount(ctx context.Context, tenantID, id uuid.UUID, count int) error
	Delete(ctx context.Context, tenantID, id uuid.UUID) error
	ListForAdmin(ctx context.Context, tenantID uuid.UUID, status string, cursor Cursor, limit int) ([]domain.Announcement, error)
	ListDueScheduled(ctx context.Context) ([]domain.Announcement, error)
	ListActiveTenantIDs(ctx context.Context) ([]uuid.UUID, error)
	ListActiveForTenant(ctx context.Context, tenantID uuid.UUID) ([]domain.Announcement, error)

	MarkRead(ctx context.Context, tenantID, announcementID, userID uuid.UUID) error
	CountReads(ctx context.Context, tenantID, announcementID uuid.UUID) (int64, error)
	ReadIDsForUser(ctx context.Context, tenantID, userID uuid.UUID, ids []uuid.UUID) ([]uuid.UUID, error)

	ActiveUserIDs(ctx context.Context, tenantID uuid.UUID) ([]uuid.UUID, error)
	UserIDsByRoleSlugs(ctx context.Context, tenantID uuid.UUID, slugs []string) ([]uuid.UUID, error)
	StudentIDsByClasses(ctx context.Context, tenantID uuid.UUID, classIDs []uuid.UUID) ([]uuid.UUID, error)
	ExistingUserIDs(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) ([]uuid.UUID, error)
	RoleSlugsForUser(ctx context.Context, tenantID, userID uuid.UUID) ([]string, error)
	ActiveClassIDsForStudent(ctx context.Context, tenantID, userID uuid.UUID) ([]uuid.UUID, error)
}

// Notifier is how a published announcement reaches recipients' inboxes.
// The call happens inside the publish transaction so the inbox rows and
// the status change commit together.
type Notifier interface {
	AnnouncementPublished(ctx context.Context, tenantID uuid.UUID, recipientIDs []uuid.UUID, a domain.Announcement) error
}

// NoopNotifier is used when the notifications module is not wired (tests,
// the migrate/seed commands).
type NoopNotifier struct{}

func (NoopNotifier) AnnouncementPublished(context.Context, uuid.UUID, []uuid.UUID, domain.Announcement) error {
	return nil
}

type Service struct {
	pool     *pgxpool.Pool
	repo     Repository
	notifier Notifier
	clock    clock.Clock
}

func New(pool *pgxpool.Pool, repo Repository, notifier Notifier, clk clock.Clock) *Service {
	if notifier == nil {
		notifier = NoopNotifier{}
	}
	if clk == nil {
		clk = clock.Real{}
	}
	return &Service{pool: pool, repo: repo, notifier: notifier, clock: clk}
}

func (s *Service) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
}

// Cursor is the keyset position for the admin list (created_at desc, id desc).
type Cursor struct {
	Present   bool
	CreatedAt time.Time
	ID        uuid.UUID
}

func EncodeCursor(createdAt time.Time, id uuid.UUID) string {
	raw := fmt.Sprintf("%d:%s", createdAt.UnixNano(), id.String())
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func DecodeCursor(s string) (Cursor, error) {
	if s == "" {
		return Cursor{}, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return Cursor{}, fmt.Errorf("%w: cursor", domain.ErrInvalidInput)
	}
	parts := strings.SplitN(string(raw), ":", 2)
	if len(parts) != 2 {
		return Cursor{}, fmt.Errorf("%w: cursor", domain.ErrInvalidInput)
	}
	nanos, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return Cursor{}, fmt.Errorf("%w: cursor", domain.ErrInvalidInput)
	}
	id, err := uuid.Parse(parts[1])
	if err != nil {
		return Cursor{}, fmt.Errorf("%w: cursor", domain.ErrInvalidInput)
	}
	return Cursor{Present: true, CreatedAt: time.Unix(0, nanos).UTC(), ID: id}, nil
}

const (
	defaultPageSize = 20
	maxPageSize     = 100
)

func clampLimit(limit int) int {
	if limit <= 0 {
		return defaultPageSize
	}
	if limit > maxPageSize {
		return maxPageSize
	}
	return limit
}
