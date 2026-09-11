package repository

import (
	"context"
	"crypto/sha256"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// endpointHash is the unique key push_devices dedupes on: a web push
// subscription re-registering the same endpoint (browser re-subscribing
// after a token refresh) updates the existing row instead of creating a
// duplicate device that would receive every notification twice.
func endpointHash(tokenOrEndpoint string) []byte {
	sum := sha256.Sum256([]byte(tokenOrEndpoint))
	return sum[:]
}

func (r *Repository) UpsertPushDevice(ctx context.Context, tenantID, userID uuid.UUID, reg service.PushDeviceRegistration, expiresAt time.Time) (domain.PushDevice, error) {
	row, err := r.queries(ctx).UpsertPushDevice(ctx, db.UpsertPushDeviceParams{
		TenantID: tenantID, UserID: userID, Platform: string(reg.Platform),
		TokenOrEndpoint: reg.TokenOrEndpoint, EndpointHash: endpointHash(reg.TokenOrEndpoint),
		P256dh: pdatabase.Text(reg.P256dh), AuthKey: pdatabase.Text(reg.AuthKey), DeviceName: pdatabase.Text(reg.DeviceName),
		ExpiresAt: pdatabase.Timestamptz(expiresAt),
	})
	if err != nil {
		return domain.PushDevice{}, fmt.Errorf("upsert push device: %w", err)
	}
	return toPushDevice(row), nil
}

func (r *Repository) DeletePushDeviceByEndpoint(ctx context.Context, tenantID, userID uuid.UUID, tokenOrEndpoint string) error {
	return r.queries(ctx).DeletePushDeviceByEndpointHash(ctx, db.DeletePushDeviceByEndpointHashParams{
		TenantID: tenantID, UserID: userID, EndpointHash: endpointHash(tokenOrEndpoint),
	})
}

func (r *Repository) DeletePushDeviceByID(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).DeletePushDeviceByID(ctx, db.DeletePushDeviceByIDParams{TenantID: tenantID, ID: id})
}

func (r *Repository) DeleteAllPushDevicesForUser(ctx context.Context, tenantID, userID uuid.UUID) error {
	return r.queries(ctx).DeleteAllPushDevicesForUser(ctx, db.DeleteAllPushDevicesForUserParams{TenantID: tenantID, UserID: userID})
}

func (r *Repository) GetPushDeviceByID(ctx context.Context, tenantID, id uuid.UUID) (domain.PushDevice, error) {
	row, err := r.queries(ctx).GetPushDeviceByID(ctx, db.GetPushDeviceByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.PushDevice{}, fmt.Errorf("get push device: %w", err)
	}
	return toPushDevice(row), nil
}

func (r *Repository) ListPushDevicesForUser(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.PushDevice, error) {
	rows, err := r.queries(ctx).ListPushDevicesForUser(ctx, db.ListPushDevicesForUserParams{TenantID: tenantID, UserID: userID})
	if err != nil {
		return nil, fmt.Errorf("list push devices: %w", err)
	}
	return toPushDevices(rows), nil
}

func (r *Repository) ListPushDevicesForUsers(ctx context.Context, tenantID uuid.UUID, userIDs []uuid.UUID) ([]domain.PushDevice, error) {
	rows, err := r.queries(ctx).ListPushDevicesForUsers(ctx, db.ListPushDevicesForUsersParams{TenantID: tenantID, UserIds: userIDs})
	if err != nil {
		return nil, fmt.Errorf("list push devices for users: %w", err)
	}
	return toPushDevices(rows), nil
}

func (r *Repository) TouchPushDeviceUsed(ctx context.Context, tenantID, id uuid.UUID, at time.Time) error {
	return r.queries(ctx).TouchPushDeviceUsed(ctx, db.TouchPushDeviceUsedParams{
		TenantID: tenantID, ID: id, LastUsedAt: pdatabase.Timestamptz(at),
	})
}

func (r *Repository) IncrementPushDeviceFailure(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).IncrementPushDeviceFailure(ctx, db.IncrementPushDeviceFailureParams{TenantID: tenantID, ID: id})
}

func (r *Repository) DeleteExpiredOrFailedPushDevices(ctx context.Context, tenantID uuid.UUID, maxFailures int) (int64, error) {
	return r.queries(ctx).DeleteExpiredOrFailedPushDevices(ctx, db.DeleteExpiredOrFailedPushDevicesParams{
		TenantID: tenantID, MaxFailures: int32(maxFailures), //nolint:gosec // maxFailures is a small compile-time constant
	})
}

func toPushDevice(row db.PushDevice) domain.PushDevice {
	return domain.PushDevice{
		ID: row.ID, UserID: row.UserID, Platform: domain.Platform(row.Platform),
		TokenOrEndpoint: row.TokenOrEndpoint, P256dh: pdatabase.TextOrEmpty(row.P256dh), AuthKey: pdatabase.TextOrEmpty(row.AuthKey),
		DeviceName: pdatabase.TextOrEmpty(row.DeviceName), FailureCount: int(row.FailureCount), ExpiresAt: pdatabase.TimeOrZero(row.ExpiresAt),
	}
}

func toPushDevices(rows []db.PushDevice) []domain.PushDevice {
	out := make([]domain.PushDevice, len(rows))
	for i, row := range rows {
		out[i] = toPushDevice(row)
	}
	return out
}
