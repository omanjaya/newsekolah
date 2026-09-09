// Package repository is the sqlc-backed implementation of the integrations
// service's data boundary. It only maps rows to domain values and never
// makes an authorization or business decision; every rule lives in
// service/.
package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

type Repository struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

var (
	_ service.KeyRepository     = (*Repository)(nil)
	_ service.WebhookRepository = (*Repository)(nil)
)

func (r *Repository) queries(ctx context.Context) *db.Queries {
	if tx, ok := database.TxFromContext(ctx); ok {
		return db.New(tx)
	}
	return db.New(r.pool)
}

// API keys.

func (r *Repository) CreateKey(ctx context.Context, k domain.APIKey) (domain.APIKey, error) {
	row, err := r.queries(ctx).CreateAPIKey(ctx, db.CreateAPIKeyParams{
		ID: k.ID, TenantID: k.TenantID, Name: k.Name, SecretHash: k.SecretHash,
		Permissions: k.Permissions, CreatedBy: k.CreatedBy, IpAllowlist: k.IPAllowlist,
		RateLimitPerMinute: int32(k.RateLimitPerMinute), //nolint:gosec // clamped to 1..6000 by domain.ClampRateLimit
		ExpiresAt:          timestamptzPtr(k.ExpiresAt),
	})
	if err != nil {
		return domain.APIKey{}, fmt.Errorf("create api key: %w", err)
	}
	return toAPIKey(row), nil
}

func (r *Repository) GetKey(ctx context.Context, tenantID, id uuid.UUID) (domain.APIKey, error) {
	row, err := r.queries(ctx).GetAPIKeyByID(ctx, db.GetAPIKeyByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.APIKey{}, domain.ErrKeyNotFound
		}
		return domain.APIKey{}, fmt.Errorf("get api key: %w", err)
	}
	return toAPIKey(row), nil
}

func (r *Repository) ListKeys(ctx context.Context, tenantID uuid.UUID) ([]domain.APIKey, error) {
	rows, err := r.queries(ctx).ListAPIKeys(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list api keys: %w", err)
	}
	out := make([]domain.APIKey, len(rows))
	for i, row := range rows {
		out[i] = toAPIKey(row)
	}
	return out, nil
}

func (r *Repository) RevokeKey(ctx context.Context, tenantID, id uuid.UUID, revokedAt time.Time) (domain.APIKey, error) {
	row, err := r.queries(ctx).RevokeAPIKey(ctx, db.RevokeAPIKeyParams{TenantID: tenantID, ID: id, RevokedAt: database.Timestamptz(revokedAt)})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.APIKey{}, domain.ErrKeyNotFound
		}
		return domain.APIKey{}, fmt.Errorf("revoke api key: %w", err)
	}
	return toAPIKey(row), nil
}

func (r *Repository) TouchKeyLastUsed(ctx context.Context, tenantID, id uuid.UUID, at time.Time) error {
	if err := r.queries(ctx).TouchAPIKeyLastUsed(ctx, db.TouchAPIKeyLastUsedParams{TenantID: tenantID, ID: id, LastUsedAt: database.Timestamptz(at)}); err != nil {
		return fmt.Errorf("touch api key last used: %w", err)
	}
	return nil
}

func toAPIKey(row db.IntegrationApiKey) domain.APIKey {
	return domain.APIKey{
		ID: row.ID, TenantID: row.TenantID, Name: row.Name, SecretHash: row.SecretHash,
		Permissions: row.Permissions, CreatedBy: row.CreatedBy, IPAllowlist: row.IpAllowlist,
		RateLimitPerMinute: int(row.RateLimitPerMinute),
		ExpiresAt:          database.TimePtr(row.ExpiresAt), RevokedAt: database.TimePtr(row.RevokedAt),
		LastUsedAt: database.TimePtr(row.LastUsedAt), CreatedAt: database.TimeOrZero(row.CreatedAt),
	}
}

// Webhook endpoints.

func (r *Repository) CreateEndpoint(ctx context.Context, e domain.WebhookEndpoint, ciphertext []byte) (domain.WebhookEndpoint, error) {
	row, err := r.queries(ctx).CreateWebhookEndpoint(ctx, db.CreateWebhookEndpointParams{
		ID: e.ID, TenantID: e.TenantID, Url: e.URL, Description: e.Description,
		EventTypes: e.EventTypes, SigningSecretCiphertext: ciphertext, CreatedBy: e.CreatedBy,
	})
	if err != nil {
		return domain.WebhookEndpoint{}, fmt.Errorf("create webhook endpoint: %w", err)
	}
	return toEndpoint(row), nil
}

func (r *Repository) GetEndpoint(ctx context.Context, tenantID, id uuid.UUID) (service.EndpointRow, error) {
	row, err := r.queries(ctx).GetWebhookEndpointByID(ctx, db.GetWebhookEndpointByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return service.EndpointRow{}, domain.ErrEndpointNotFound
		}
		return service.EndpointRow{}, fmt.Errorf("get webhook endpoint: %w", err)
	}
	return service.EndpointRow{Endpoint: toEndpoint(row), Ciphertext: row.SigningSecretCiphertext}, nil
}

func (r *Repository) ListEndpoints(ctx context.Context, tenantID uuid.UUID) ([]domain.WebhookEndpoint, error) {
	rows, err := r.queries(ctx).ListWebhookEndpoints(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list webhook endpoints: %w", err)
	}
	out := make([]domain.WebhookEndpoint, len(rows))
	for i, row := range rows {
		out[i] = toEndpoint(row)
	}
	return out, nil
}

func (r *Repository) ListActiveEndpointsForEvent(ctx context.Context, tenantID uuid.UUID, eventType string) ([]service.EndpointRow, error) {
	rows, err := r.queries(ctx).ListActiveWebhookEndpointsForEvent(ctx, db.ListActiveWebhookEndpointsForEventParams{TenantID: tenantID, EventType: eventType})
	if err != nil {
		return nil, fmt.Errorf("list active webhook endpoints: %w", err)
	}
	out := make([]service.EndpointRow, len(rows))
	for i, row := range rows {
		out[i] = service.EndpointRow{Endpoint: toEndpoint(row), Ciphertext: row.SigningSecretCiphertext}
	}
	return out, nil
}

func (r *Repository) UpdateEndpoint(ctx context.Context, tenantID, id uuid.UUID, url, description string, eventTypes []string) (domain.WebhookEndpoint, error) {
	row, err := r.queries(ctx).UpdateWebhookEndpoint(ctx, db.UpdateWebhookEndpointParams{
		TenantID: tenantID, ID: id, Url: url, Description: description, EventTypes: eventTypes,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.WebhookEndpoint{}, domain.ErrEndpointNotFound
		}
		return domain.WebhookEndpoint{}, fmt.Errorf("update webhook endpoint: %w", err)
	}
	return toEndpoint(row), nil
}

func (r *Repository) DeleteEndpoint(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := r.queries(ctx).DeleteWebhookEndpoint(ctx, db.DeleteWebhookEndpointParams{TenantID: tenantID, ID: id}); err != nil {
		return fmt.Errorf("delete webhook endpoint: %w", err)
	}
	return nil
}

func (r *Repository) DisableEndpoint(ctx context.Context, tenantID, id uuid.UUID, reason string) error {
	if err := r.queries(ctx).DisableWebhookEndpoint(ctx, db.DisableWebhookEndpointParams{TenantID: tenantID, ID: id, DisabledReason: reason}); err != nil {
		return fmt.Errorf("disable webhook endpoint: %w", err)
	}
	return nil
}

func (r *Repository) IncrementEndpointFailure(ctx context.Context, tenantID, id uuid.UUID) (int, error) {
	count, err := r.queries(ctx).IncrementWebhookEndpointFailure(ctx, db.IncrementWebhookEndpointFailureParams{TenantID: tenantID, ID: id})
	if err != nil {
		return 0, fmt.Errorf("increment webhook endpoint failure: %w", err)
	}
	return int(count), nil
}

func (r *Repository) ResetEndpointFailure(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := r.queries(ctx).ResetWebhookEndpointFailure(ctx, db.ResetWebhookEndpointFailureParams{TenantID: tenantID, ID: id}); err != nil {
		return fmt.Errorf("reset webhook endpoint failure: %w", err)
	}
	return nil
}

func toEndpoint(row db.IntegrationWebhookEndpoint) domain.WebhookEndpoint {
	return domain.WebhookEndpoint{
		ID: row.ID, TenantID: row.TenantID, URL: row.Url, Description: row.Description,
		EventTypes: row.EventTypes, Status: domain.WebhookStatus(row.Status), DisabledReason: row.DisabledReason,
		ConsecutiveFailures: int(row.ConsecutiveFailures), CreatedBy: row.CreatedBy,
		CreatedAt: database.TimeOrZero(row.CreatedAt), UpdatedAt: database.TimeOrZero(row.UpdatedAt),
	}
}

// Deliveries.

func (r *Repository) CreateDelivery(ctx context.Context, d domain.Delivery) (domain.Delivery, error) {
	row, err := r.queries(ctx).CreateWebhookDelivery(ctx, db.CreateWebhookDeliveryParams{
		ID: d.ID, TenantID: d.TenantID, EndpointID: d.EndpointID, EventType: d.EventType,
		EventID: d.EventID, Payload: d.Payload, Status: string(d.Status), NextAttemptAt: timestamptzPtr(d.NextAttemptAt),
	})
	if err != nil {
		return domain.Delivery{}, fmt.Errorf("create webhook delivery: %w", err)
	}
	return toDelivery(row), nil
}

func (r *Repository) GetDelivery(ctx context.Context, tenantID, id uuid.UUID) (domain.Delivery, error) {
	row, err := r.queries(ctx).GetWebhookDeliveryByID(ctx, db.GetWebhookDeliveryByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Delivery{}, domain.ErrDeliveryNotFound
		}
		return domain.Delivery{}, fmt.Errorf("get webhook delivery: %w", err)
	}
	return toDelivery(row), nil
}

func (r *Repository) ListDeliveries(ctx context.Context, tenantID uuid.UUID, endpointID uuid.NullUUID, cursor service.Cursor, limit int) ([]domain.Delivery, error) {
	rows, err := r.queries(ctx).ListWebhookDeliveries(ctx, db.ListWebhookDeliveriesParams{
		TenantID: tenantID, EndpointID: database.NullUUID(endpointID), HasCursor: cursor.Present,
		CursorCreatedAt: database.Timestamptz(cursor.CreatedAt), CursorID: cursor.ID,
		PageLimit: int32(limit), //nolint:gosec // limit is clamped to 1..100 by the service
	})
	if err != nil {
		return nil, fmt.Errorf("list webhook deliveries: %w", err)
	}
	out := make([]domain.Delivery, len(rows))
	for i, row := range rows {
		out[i] = toDelivery(row)
	}
	return out, nil
}

func (r *Repository) UpdateDeliveryAttempt(ctx context.Context, tenantID, id uuid.UUID, status domain.DeliveryStatus, attemptCount int, statusCode *int, lastError string, deliveredAt, nextAttemptAt *time.Time) error {
	if err := r.queries(ctx).UpdateWebhookDeliveryAttempt(ctx, db.UpdateWebhookDeliveryAttemptParams{
		TenantID: tenantID, ID: id, Status: string(status),
		AttemptCount:   int32(attemptCount), //nolint:gosec // bounded by domain.MaxDeliveryAttempts
		LastStatusCode: int4Ptr(statusCode), LastError: lastError,
		DeliveredAt: timestamptzPtr(deliveredAt), NextAttemptAt: timestamptzPtr(nextAttemptAt),
	}); err != nil {
		return fmt.Errorf("update webhook delivery attempt: %w", err)
	}
	return nil
}

func toDelivery(row db.IntegrationWebhookDelivery) domain.Delivery {
	var statusCode *int
	if row.LastStatusCode.Valid {
		v := int(row.LastStatusCode.Int32)
		statusCode = &v
	}
	return domain.Delivery{
		ID: row.ID, TenantID: row.TenantID, EndpointID: row.EndpointID, EventType: row.EventType,
		EventID: row.EventID, Payload: row.Payload, Status: domain.DeliveryStatus(row.Status),
		AttemptCount: int(row.AttemptCount), LastStatusCode: statusCode, LastError: row.LastError,
		DeliveredAt: database.TimePtr(row.DeliveredAt), NextAttemptAt: database.TimePtr(row.NextAttemptAt),
		CreatedAt: database.TimeOrZero(row.CreatedAt),
	}
}

func timestamptzPtr(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return database.Timestamptz(*t)
}

func int4Ptr(v *int) pgtype.Int4 {
	if v == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: int32(*v), Valid: true} //nolint:gosec // HTTP status codes fit int32
}
