package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) CreateImpersonationSessionRecord(ctx context.Context, in service.NewImpersonationSession) (domain.Session, error) {
	row, err := r.queries(ctx).CreateImpersonationSession(ctx, db.CreateImpersonationSessionParams{
		TenantID: in.TenantID, UserID: in.UserID,
		ActorUserID:      pdatabase.NullUUID(uuid.NullUUID{UUID: in.ActorUserID, Valid: true}),
		RefreshTokenHash: in.RefreshTokenHash, FamilyID: in.FamilyID, Client: string(in.Client),
		Ip: pdatabase.Inet(in.IP), UserAgent: nullableText(in.UserAgent), ExpiresAt: pdatabase.Timestamptz(in.ExpiresAt),
	})
	if err != nil {
		return domain.Session{}, fmt.Errorf("create impersonation session: %w", err)
	}
	return toDomainSession(row), nil
}

func (r *Repository) GetSessionByID(ctx context.Context, tenantID, sessionID uuid.UUID) (domain.Session, error) {
	row, err := r.queries(ctx).GetSessionByID(ctx, db.GetSessionByIDParams{TenantID: tenantID, ID: sessionID})
	if err != nil {
		return domain.Session{}, fmt.Errorf("get session by id: %w", err)
	}
	return toDomainSession(row), nil
}

func (r *Repository) InsertImpersonationActionRecord(ctx context.Context, tenantID, sessionID uuid.UUID, method, path string) error {
	err := r.queries(ctx).InsertImpersonationAction(ctx, db.InsertImpersonationActionParams{
		TenantID: tenantID, SessionID: sessionID, Method: method, Path: path,
	})
	if err != nil {
		return fmt.Errorf("insert impersonation action: %w", err)
	}
	return nil
}
