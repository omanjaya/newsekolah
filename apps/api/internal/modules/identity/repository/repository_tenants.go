package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
)

// ListActiveTenants returns every non-deleted tenant, for the
// session-pruning periodic job. Reuses school's ListTenantIDs query (see
// platform/migrator for the same pattern): tenants is the platform-wide
// registry, not RLS-scoped, so this reads straight off the pool with no
// tenant transaction.
func (r *Repository) ListActiveTenants(ctx context.Context) ([]uuid.UUID, error) {
	ids, err := db.New(r.pool).ListTenantIDs(ctx)
	if err != nil {
		return nil, fmt.Errorf("list active tenants: %w", err)
	}
	return ids, nil
}
