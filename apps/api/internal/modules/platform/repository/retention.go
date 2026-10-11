package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// EnsureMonthlyPartition creates (or confirms) the monthly partition of
// table covering month. Schema-level DDL: it runs on the pool, never inside
// a tenant transaction.
func (r *Repository) EnsureMonthlyPartition(ctx context.Context, table string, month time.Time) error {
	_, err := r.queries(ctx).PlatformEnsureMonthlyPartition(ctx, db.PlatformEnsureMonthlyPartitionParams{
		ParentTable: table, TargetMonth: pdatabase.Date(month),
	})
	if err != nil {
		return fmt.Errorf("ensure %s partition for %s: %w", table, month.Format("2006-01"), err)
	}
	return nil
}

func (r *Repository) DropExpiredPartitions(ctx context.Context, table string, cutoff time.Time) ([]string, error) {
	names, err := r.queries(ctx).PlatformDropExpiredPartitions(ctx, db.PlatformDropExpiredPartitionsParams{
		ParentTable: table, Cutoff: pdatabase.Timestamptz(cutoff),
	})
	if err != nil {
		return nil, fmt.Errorf("drop expired %s partitions: %w", table, err)
	}
	return names, nil
}

func (r *Repository) ListRetentionTenantIDs(ctx context.Context) ([]uuid.UUID, error) {
	return r.queries(ctx).PlatformListRetentionTenantIDs(ctx)
}

func (r *Repository) DeleteLoginAttemptsBefore(ctx context.Context, tenantID uuid.UUID, cutoff time.Time, batchSize int) (int64, error) {
	return r.queries(ctx).PlatformDeleteLoginAttemptsBefore(ctx, db.PlatformDeleteLoginAttemptsBeforeParams{
		TenantID: tenantID, Cutoff: pdatabase.Timestamptz(cutoff), BatchSize: int32(batchSize), //nolint:gosec // batch size is a small package constant
	})
}

func (r *Repository) DeleteWebhookDeliveriesBefore(ctx context.Context, tenantID uuid.UUID, cutoff time.Time, batchSize int) (int64, error) {
	return r.queries(ctx).PlatformDeleteWebhookDeliveriesBefore(ctx, db.PlatformDeleteWebhookDeliveriesBeforeParams{
		TenantID: tenantID, Cutoff: pdatabase.Timestamptz(cutoff), BatchSize: int32(batchSize), //nolint:gosec // batch size is a small package constant
	})
}
