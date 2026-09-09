// Package repository is the sqlc-backed implementation of the announcements
// service's data boundary. It only maps rows to domain values; every rule
// lives in service/.
package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

type Repository struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

var _ service.Repository = (*Repository)(nil)

// queries binds to the tenant transaction opened by the service; outside a
// transaction (the cross-tenant scheduled-publish scan) it uses the pool.
func (r *Repository) queries(ctx context.Context) *db.Queries {
	if tx, ok := database.TxFromContext(ctx); ok {
		return db.New(tx)
	}
	return db.New(r.pool)
}

func (r *Repository) Create(ctx context.Context, a domain.Announcement) (domain.Announcement, error) {
	audience, err := json.Marshal(a.Audience)
	if err != nil {
		return domain.Announcement{}, fmt.Errorf("encode audience: %w", err)
	}
	row, err := r.queries(ctx).CreateAnnouncement(ctx, db.CreateAnnouncementParams{
		TenantID: a.TenantID, SenderUserID: a.SenderUserID, Title: a.Title, BodyHtml: a.BodyHTML, BodyText: a.BodyText,
		Audience: audience, IsPinned: a.IsPinned, Status: string(a.Status),
		StartsAt: timestampPtr(a.StartsAt), EndsAt: timestampPtr(a.EndsAt),
	})
	if err != nil {
		return domain.Announcement{}, fmt.Errorf("create announcement: %w", err)
	}
	return toDomain(row)
}

func (r *Repository) Get(ctx context.Context, tenantID, id uuid.UUID) (domain.Announcement, error) {
	row, err := r.queries(ctx).GetAnnouncementByID(ctx, db.GetAnnouncementByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Announcement{}, domain.ErrNotFound
		}
		return domain.Announcement{}, fmt.Errorf("get announcement: %w", err)
	}
	return toDomain(row)
}

func (r *Repository) Update(ctx context.Context, a domain.Announcement) (domain.Announcement, error) {
	audience, err := json.Marshal(a.Audience)
	if err != nil {
		return domain.Announcement{}, fmt.Errorf("encode audience: %w", err)
	}
	row, err := r.queries(ctx).UpdateAnnouncement(ctx, db.UpdateAnnouncementParams{
		TenantID: a.TenantID, ID: a.ID, Title: a.Title, BodyHtml: a.BodyHTML, BodyText: a.BodyText,
		Audience: audience, IsPinned: a.IsPinned, StartsAt: timestampPtr(a.StartsAt), EndsAt: timestampPtr(a.EndsAt),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Announcement{}, domain.ErrInvalidStatus
		}
		return domain.Announcement{}, fmt.Errorf("update announcement: %w", err)
	}
	return toDomain(row)
}

func (r *Repository) SetStatus(ctx context.Context, tenantID, id uuid.UUID, status domain.Status) (domain.Announcement, error) {
	row, err := r.queries(ctx).UpdateAnnouncementStatus(ctx, db.UpdateAnnouncementStatusParams{TenantID: tenantID, ID: id, Status: string(status)})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Announcement{}, domain.ErrNotFound
		}
		return domain.Announcement{}, fmt.Errorf("set announcement status: %w", err)
	}
	return toDomain(row)
}

func (r *Repository) SetRecipientCount(ctx context.Context, tenantID, id uuid.UUID, count int) error {
	if err := r.queries(ctx).SetAnnouncementRecipientCount(ctx, db.SetAnnouncementRecipientCountParams{
		TenantID: tenantID, ID: id, RecipientCount: int32(count), //nolint:gosec // recipient counts are bounded by the tenant's user count
	}); err != nil {
		return fmt.Errorf("set recipient count: %w", err)
	}
	return nil
}

func (r *Repository) Delete(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := r.queries(ctx).DeleteAnnouncement(ctx, db.DeleteAnnouncementParams{TenantID: tenantID, ID: id}); err != nil {
		return fmt.Errorf("delete announcement: %w", err)
	}
	return nil
}

func (r *Repository) ListForAdmin(ctx context.Context, tenantID uuid.UUID, status string, cursor service.Cursor, limit int) ([]domain.Announcement, error) {
	rows, err := r.queries(ctx).ListAnnouncementsForAdmin(ctx, db.ListAnnouncementsForAdminParams{
		TenantID: tenantID, StatusFilter: status, HasCursor: cursor.Present,
		CursorCreatedAt: database.Timestamptz(cursor.CreatedAt), CursorID: cursor.ID,
		PageLimit: int32(limit), //nolint:gosec // limit is clamped to 1..100 by the service
	})
	if err != nil {
		return nil, fmt.Errorf("list announcements: %w", err)
	}
	return toDomains(rows)
}

func (r *Repository) ListDueScheduled(ctx context.Context) ([]domain.Announcement, error) {
	rows, err := r.queries(ctx).ListDueScheduledAnnouncements(ctx)
	if err != nil {
		return nil, fmt.Errorf("list due announcements: %w", err)
	}
	return toDomains(rows)
}

func (r *Repository) ListActiveTenantIDs(ctx context.Context) ([]uuid.UUID, error) {
	ids, err := r.queries(ctx).ListActiveTenantIDsForAnnouncements(ctx)
	if err != nil {
		return nil, fmt.Errorf("list tenants: %w", err)
	}
	return ids, nil
}

func (r *Repository) ListActiveForTenant(ctx context.Context, tenantID uuid.UUID) ([]domain.Announcement, error) {
	rows, err := r.queries(ctx).ListActiveAnnouncementsForUser(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list active announcements: %w", err)
	}
	return toDomains(rows)
}

func (r *Repository) MarkRead(ctx context.Context, tenantID, announcementID, userID uuid.UUID) error {
	if err := r.queries(ctx).MarkAnnouncementRead(ctx, db.MarkAnnouncementReadParams{AnnouncementID: announcementID, UserID: userID, TenantID: tenantID}); err != nil {
		return fmt.Errorf("mark announcement read: %w", err)
	}
	return nil
}

func (r *Repository) CountReads(ctx context.Context, tenantID, announcementID uuid.UUID) (int64, error) {
	n, err := r.queries(ctx).CountAnnouncementReads(ctx, db.CountAnnouncementReadsParams{TenantID: tenantID, AnnouncementID: announcementID})
	if err != nil {
		return 0, fmt.Errorf("count announcement reads: %w", err)
	}
	return n, nil
}

func (r *Repository) ReadIDsForUser(ctx context.Context, tenantID, userID uuid.UUID, ids []uuid.UUID) ([]uuid.UUID, error) {
	out, err := r.queries(ctx).ListReadAnnouncementIDsForUser(ctx, db.ListReadAnnouncementIDsForUserParams{TenantID: tenantID, UserID: userID, AnnouncementIds: ids})
	if err != nil {
		return nil, fmt.Errorf("list read announcements: %w", err)
	}
	return out, nil
}

// Audience resolution: cross-module reads declared in queries/audience.sql.

func (r *Repository) ActiveUserIDs(ctx context.Context, tenantID uuid.UUID) ([]uuid.UUID, error) {
	return r.queries(ctx).ListActiveUserIDsForTenant(ctx, tenantID)
}

func (r *Repository) UserIDsByRoleSlugs(ctx context.Context, tenantID uuid.UUID, slugs []string) ([]uuid.UUID, error) {
	return r.queries(ctx).ListUserIDsByRoleSlugs(ctx, db.ListUserIDsByRoleSlugsParams{TenantID: tenantID, RoleSlugs: slugs})
}

func (r *Repository) StudentIDsByClasses(ctx context.Context, tenantID uuid.UUID, classIDs []uuid.UUID) ([]uuid.UUID, error) {
	return r.queries(ctx).ListActiveStudentUserIDsByClasses(ctx, db.ListActiveStudentUserIDsByClassesParams{TenantID: tenantID, ClassIds: classIDs})
}

func (r *Repository) ExistingUserIDs(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) ([]uuid.UUID, error) {
	return r.queries(ctx).ValidateUserIDsBelongToTenant(ctx, db.ValidateUserIDsBelongToTenantParams{TenantID: tenantID, UserIds: ids})
}

func (r *Repository) RoleSlugsForUser(ctx context.Context, tenantID, userID uuid.UUID) ([]string, error) {
	return r.queries(ctx).ListRoleSlugsForUser(ctx, db.ListRoleSlugsForUserParams{TenantID: tenantID, UserID: userID})
}

func (r *Repository) ActiveClassIDsForStudent(ctx context.Context, tenantID, userID uuid.UUID) ([]uuid.UUID, error) {
	return r.queries(ctx).ListActiveClassIDsForStudent(ctx, db.ListActiveClassIDsForStudentParams{TenantID: tenantID, StudentUserID: userID})
}

func toDomains(rows []db.Announcement) ([]domain.Announcement, error) {
	out := make([]domain.Announcement, 0, len(rows))
	for _, row := range rows {
		a, err := toDomain(row)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, nil
}

func toDomain(row db.Announcement) (domain.Announcement, error) {
	var audience domain.Audience
	if len(row.Audience) > 0 {
		if err := json.Unmarshal(row.Audience, &audience); err != nil {
			return domain.Announcement{}, fmt.Errorf("decode audience: %w", err)
		}
	}
	return domain.Announcement{
		ID: row.ID, TenantID: row.TenantID, SenderUserID: row.SenderUserID,
		Title: row.Title, BodyHTML: row.BodyHtml, BodyText: row.BodyText, Audience: audience,
		IsPinned: row.IsPinned, Status: domain.Status(row.Status),
		StartsAt: database.TimePtr(row.StartsAt), EndsAt: database.TimePtr(row.EndsAt), PublishedAt: database.TimePtr(row.PublishedAt),
		RecipientCount: int(row.RecipientCount), CreatedAt: database.TimeOrZero(row.CreatedAt),
	}, nil
}

func timestampPtr(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return database.Timestamptz(*t)
}
