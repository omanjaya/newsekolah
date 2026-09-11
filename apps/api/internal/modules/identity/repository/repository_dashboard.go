package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// ActiveUsersByProfileKind returns, for every profile_kind with at least
// one active user, how many. Backs the admin dashboard.
func (r *Repository) ActiveUsersByProfileKind(ctx context.Context, tenantID uuid.UUID) (map[string]int, error) {
	rows, err := r.queries(ctx).CountActiveUsersByProfileKind(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("count active users by profile kind: %w", err)
	}
	out := make(map[string]int, len(rows))
	for _, row := range rows {
		out[row.Kind] = int(row.Total)
	}
	return out, nil
}

// LoginHistogramByHour returns, for every UTC hour (0-23) with at least
// one successful login since since, how many. Backs the admin dashboard.
func (r *Repository) LoginHistogramByHour(ctx context.Context, tenantID uuid.UUID, since time.Time) (map[int]int, error) {
	rows, err := r.queries(ctx).LoginHistogramByHour(ctx, db.LoginHistogramByHourParams{TenantID: tenantID, OccurredAt: pdatabase.Timestamptz(since)})
	if err != nil {
		return nil, fmt.Errorf("login histogram: %w", err)
	}
	out := make(map[int]int, len(rows))
	for _, row := range rows {
		out[int(row.Hour)] = int(row.Total)
	}
	return out, nil
}
