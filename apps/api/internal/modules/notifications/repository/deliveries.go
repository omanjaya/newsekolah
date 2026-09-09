package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) InsertDelivery(ctx context.Context, tenantID, notificationID uuid.UUID, notificationCreatedAt time.Time, channel domain.Channel, provider, target string) (uuid.UUID, error) {
	row, err := r.queries(ctx).InsertMessageDelivery(ctx, db.InsertMessageDeliveryParams{
		TenantID: tenantID, NotificationID: notificationID, NotificationCreatedAt: pdatabase.Timestamptz(notificationCreatedAt),
		Channel: string(channel), Provider: provider, Target: target,
	})
	if err != nil {
		return uuid.Nil, fmt.Errorf("insert message delivery: %w", err)
	}
	return row.ID, nil
}

func (r *Repository) RecordDeliveryAttempt(ctx context.Context, tenantID, deliveryID uuid.UUID, status, providerMessageID, errMsg string) error {
	return r.queries(ctx).RecordDeliveryAttempt(ctx, db.RecordDeliveryAttemptParams{
		TenantID: tenantID, ID: deliveryID, Status: status,
		ProviderMessageID: pdatabase.Text(providerMessageID), Error: pdatabase.Text(errMsg),
	})
}

func (r *Repository) DeleteDeliveriesOlderThan(ctx context.Context, tenantID uuid.UUID, cutoff time.Time) (int64, error) {
	return r.queries(ctx).DeleteDeliveriesOlderThan(ctx, db.DeleteDeliveriesOlderThanParams{
		TenantID: tenantID, CreatedAt: pdatabase.Timestamptz(cutoff),
	})
}
