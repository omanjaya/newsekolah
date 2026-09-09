package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
)

func (r *Repository) GetUserByUsernameOrEmail(ctx context.Context, tenantID uuid.UUID, identifier string) (domain.User, bool, error) {
	row, err := r.queries(ctx).GetUserByUsernameOrEmail(ctx, db.GetUserByUsernameOrEmailParams{TenantID: tenantID, Username: identifier})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, false, nil
		}
		return domain.User{}, false, fmt.Errorf("get user by username or email: %w", err)
	}
	return toDomainUser(row), true, nil
}

func (r *Repository) GetValidPasswordReset(ctx context.Context, tenantID uuid.UUID, tokenHash []byte) (service.PasswordResetRecord, error) {
	row, err := r.queries(ctx).GetValidPasswordResetByHash(ctx, db.GetValidPasswordResetByHashParams{TenantID: tenantID, TokenHash: tokenHash})
	if err != nil {
		return service.PasswordResetRecord{}, fmt.Errorf("get valid password reset: %w", err)
	}
	return service.PasswordResetRecord{ID: row.ID, UserID: row.UserID}, nil
}

func (r *Repository) MarkPasswordResetUsed(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := r.queries(ctx).MarkPasswordResetUsed(ctx, db.MarkPasswordResetUsedParams{TenantID: tenantID, ID: id}); err != nil {
		return fmt.Errorf("mark password reset used: %w", err)
	}
	return nil
}
