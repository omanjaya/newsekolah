// Package service holds the integrations module's use cases: issuing and
// revoking API keys with a bounded permission subset, registering webhook
// endpoints, and dispatching + retrying deliveries. Persistence goes
// through Repository (sqlc-backed in repository/); the River client goes
// through JobInserter, the same structural interface notifications uses.
package service

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// KeyRepository is the API key data boundary.
type KeyRepository interface {
	CreateKey(ctx context.Context, k domain.APIKey) (domain.APIKey, error)
	GetKey(ctx context.Context, tenantID, id uuid.UUID) (domain.APIKey, error)
	ListKeys(ctx context.Context, tenantID uuid.UUID) ([]domain.APIKey, error)
	RevokeKey(ctx context.Context, tenantID, id uuid.UUID, revokedAt time.Time) (domain.APIKey, error)
	TouchKeyLastUsed(ctx context.Context, tenantID, id uuid.UUID, at time.Time) error
}

// EndpointRow pairs the endpoint entity with its sealed signing secret: the
// repository never decrypts it (that is the service's call, made only when
// a delivery is about to be signed), so listing endpoints for display never
// touches the sealer at all.
type EndpointRow struct {
	Endpoint   domain.WebhookEndpoint
	Ciphertext []byte
}

// WebhookRepository is the webhook endpoint and delivery data boundary.
type WebhookRepository interface {
	CreateEndpoint(ctx context.Context, e domain.WebhookEndpoint, ciphertext []byte) (domain.WebhookEndpoint, error)
	GetEndpoint(ctx context.Context, tenantID, id uuid.UUID) (EndpointRow, error)
	ListEndpoints(ctx context.Context, tenantID uuid.UUID) ([]domain.WebhookEndpoint, error)
	ListActiveEndpointsForEvent(ctx context.Context, tenantID uuid.UUID, eventType string) ([]EndpointRow, error)
	UpdateEndpoint(ctx context.Context, tenantID, id uuid.UUID, url, description string, eventTypes []string) (domain.WebhookEndpoint, error)
	DeleteEndpoint(ctx context.Context, tenantID, id uuid.UUID) error
	DisableEndpoint(ctx context.Context, tenantID, id uuid.UUID, reason string) error
	IncrementEndpointFailure(ctx context.Context, tenantID, id uuid.UUID) (int, error)
	ResetEndpointFailure(ctx context.Context, tenantID, id uuid.UUID) error

	CreateDelivery(ctx context.Context, d domain.Delivery) (domain.Delivery, error)
	GetDelivery(ctx context.Context, tenantID, id uuid.UUID) (domain.Delivery, error)
	ListDeliveries(ctx context.Context, tenantID uuid.UUID, endpointID uuid.NullUUID, cursor Cursor, limit int) ([]domain.Delivery, error)
	UpdateDeliveryAttempt(ctx context.Context, tenantID, id uuid.UUID, status domain.DeliveryStatus, attemptCount int, statusCode *int, lastError string, deliveredAt, nextAttemptAt *time.Time) error
}

// PermissionsProvider resolves the effective permission set a user (the
// creator of an API key) holds, so a key's requested subset can be checked
// against it. Satisfied by identity's service, the same interface
// platform/authz.Authorize uses.
type PermissionsProvider = authz.PermissionsProvider

// JobInserter is the slice of *river.Client[pgx.Tx] a webhook dispatch
// needs: enqueue a delivery job in the same transaction as the delivery
// row it belongs to. Matched structurally so tests can supply a fake.
type JobInserter interface {
	InsertTx(ctx context.Context, tx pgx.Tx, args river.JobArgs, opts *river.InsertOpts) (*rivertype.JobInsertResult, error)
}

type Service struct {
	pool    *pgxpool.Pool
	keys    KeyRepository
	hooks   WebhookRepository
	perms   PermissionsProvider
	sealer  *crypto.Sealer
	jobs    JobInserter
	clock   clock.Clock
	resolve HostResolver
}

// HostResolver resolves a URL's host to the IP addresses a delivery would
// actually connect to. Matched structurally so tests can fake DNS instead
// of depending on a live resolver; production wiring passes net.DefaultResolver-backed
// LookupHost (see module.go).
type HostResolver interface {
	LookupIPs(ctx context.Context, host string) ([]string, error)
}

func New(pool *pgxpool.Pool, keys KeyRepository, hooks WebhookRepository, perms PermissionsProvider, sealer *crypto.Sealer, jobs JobInserter, clk clock.Clock, resolver HostResolver) *Service {
	if clk == nil {
		clk = clock.Real{}
	}
	return &Service{pool: pool, keys: keys, hooks: hooks, perms: perms, sealer: sealer, jobs: jobs, clock: clk, resolve: resolver}
}

func (s *Service) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
}

// Cursor is the keyset position for the delivery log (created_at desc, id desc).
type Cursor struct {
	Present   bool
	CreatedAt time.Time
	ID        uuid.UUID
}

const (
	defaultPageSize = 20
	maxPageSize     = 100
)

func clampLimit(limit int) int {
	if limit <= 0 {
		return defaultPageSize
	}
	if limit > maxPageSize {
		return maxPageSize
	}
	return limit
}
