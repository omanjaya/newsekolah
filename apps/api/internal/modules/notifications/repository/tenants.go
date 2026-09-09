package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/service"
)

func (r *Repository) ListActiveTenants(ctx context.Context) ([]service.TenantRef, error) {
	rows, err := r.queries(ctx).ListActiveTenantsForMaintenance(ctx)
	if err != nil {
		return nil, fmt.Errorf("list active tenants: %w", err)
	}
	out := make([]service.TenantRef, len(rows))
	for i, row := range rows {
		out[i] = service.TenantRef{ID: row.ID, Timezone: row.Timezone}
	}
	return out, nil
}

func (r *Repository) TenantTimezone(ctx context.Context, tenantID uuid.UUID) (string, error) {
	tz, err := r.queries(ctx).GetTenantTimezone(ctx, tenantID)
	if err != nil {
		return "", fmt.Errorf("get tenant timezone: %w", err)
	}
	return tz, nil
}
