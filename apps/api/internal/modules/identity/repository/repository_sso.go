package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
)

func (r *Repository) GetGoogleSSOConfig(ctx context.Context, tenantID uuid.UUID) (service.GoogleSSOConfig, []byte, error) {
	row, err := r.queries(ctx).GetGoogleSSOConfig(ctx, tenantID)
	if err != nil {
		return service.GoogleSSOConfig{}, nil, err // pgx.ErrNoRows surfaces to callers deciding whether it's "not configured"
	}
	return toGoogleSSOConfig(row), row.ClientSecretEncrypted, nil
}

func (r *Repository) UpsertGoogleSSOConfig(ctx context.Context, tenantID uuid.UUID, clientID string, clientSecretEncrypted []byte, hostedDomain string, enabled bool) (service.GoogleSSOConfig, error) {
	row, err := r.queries(ctx).UpsertGoogleSSOConfig(ctx, db.UpsertGoogleSSOConfigParams{
		TenantID: tenantID, ClientID: clientID, ClientSecretEncrypted: clientSecretEncrypted,
		HostedDomain: hostedDomain, Enabled: enabled,
	})
	if err != nil {
		return service.GoogleSSOConfig{}, fmt.Errorf("upsert google sso config: %w", err)
	}
	return toGoogleSSOConfig(row), nil
}

func (r *Repository) DeleteGoogleSSOConfig(ctx context.Context, tenantID uuid.UUID) error {
	return r.queries(ctx).DeleteGoogleSSOConfig(ctx, tenantID)
}

func toGoogleSSOConfig(row db.SsoGoogleConfig) service.GoogleSSOConfig {
	return service.GoogleSSOConfig{
		TenantID:     row.TenantID,
		ClientID:     row.ClientID,
		HostedDomain: row.HostedDomain,
		Enabled:      row.Enabled,
	}
}
