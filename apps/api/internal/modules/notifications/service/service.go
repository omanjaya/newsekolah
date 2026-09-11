package service

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// Repository is the notifications module's data-access boundary. The
// concrete implementation lives in repository/ and is backed by sqlc.
type Repository interface {
	InsertNotification(ctx context.Context, tenantID, userID uuid.UUID, kind domain.Kind, title, body, href string, data map[string]any, announcementID uuid.NullUUID) (domain.Notification, error)
	ListNotifications(ctx context.Context, tenantID, userID uuid.UUID, unreadOnly bool, cursor Cursor, limit int) ([]domain.Notification, error)
	GetNotification(ctx context.Context, tenantID, id uuid.UUID) (domain.Notification, error)
	MarkRead(ctx context.Context, tenantID, userID, id uuid.UUID) error
	MarkAllRead(ctx context.Context, tenantID, userID uuid.UUID) error
	CountUnread(ctx context.Context, tenantID, userID uuid.UUID) (int64, error)
	ListUnreadSince(ctx context.Context, tenantID, userID uuid.UUID, since time.Time) ([]domain.Notification, error)
	DeleteReadOlderThan(ctx context.Context, tenantID uuid.UUID, cutoff time.Time) (int64, error)
	EnsurePartition(ctx context.Context, month time.Time) error

	UpsertPreference(ctx context.Context, tenantID, userID uuid.UUID, kind domain.Kind, channel domain.Channel, enabled bool) error
	ListPreferencesForKind(ctx context.Context, tenantID, userID uuid.UUID, kind domain.Kind) (map[domain.Channel]bool, error)
	GetTenantChannelDefaults(ctx context.Context, tenantID uuid.UUID, kind domain.Kind) (map[domain.Channel]bool, error)
	SetTenantChannelDefault(ctx context.Context, tenantID, actorUserID uuid.UUID, kind domain.Kind, channel domain.Channel, enabled bool) error

	GetSettings(ctx context.Context, tenantID, userID uuid.UUID) (Settings, bool, error)
	UpsertSettings(ctx context.Context, tenantID, userID uuid.UUID, in SettingsUpdate) (Settings, error)
	ListUsersDueForDigest(ctx context.Context, tenantID uuid.UUID, tenantLocalHour int) ([]Settings, error)
	MarkDigestSent(ctx context.Context, tenantID, userID uuid.UUID, at time.Time) error

	UpsertPushDevice(ctx context.Context, tenantID, userID uuid.UUID, reg PushDeviceRegistration, expiresAt time.Time) (domain.PushDevice, error)
	DeletePushDeviceByEndpoint(ctx context.Context, tenantID, userID uuid.UUID, tokenOrEndpoint string) error
	DeletePushDeviceByID(ctx context.Context, tenantID, id uuid.UUID) error
	DeleteAllPushDevicesForUser(ctx context.Context, tenantID, userID uuid.UUID) error
	GetPushDeviceByID(ctx context.Context, tenantID, id uuid.UUID) (domain.PushDevice, error)
	ListPushDevicesForUser(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.PushDevice, error)
	ListPushDevicesForUsers(ctx context.Context, tenantID uuid.UUID, userIDs []uuid.UUID) ([]domain.PushDevice, error)
	TouchPushDeviceUsed(ctx context.Context, tenantID, id uuid.UUID, at time.Time) error
	IncrementPushDeviceFailure(ctx context.Context, tenantID, id uuid.UUID) error
	DeleteExpiredOrFailedPushDevices(ctx context.Context, tenantID uuid.UUID, maxFailures int) (int64, error)

	InsertDelivery(ctx context.Context, tenantID, notificationID uuid.UUID, notificationCreatedAt time.Time, channel domain.Channel, provider, target string) (uuid.UUID, error)
	RecordDeliveryAttempt(ctx context.Context, tenantID, deliveryID uuid.UUID, status, providerMessageID, errMsg string) error
	DeleteDeliveriesOlderThan(ctx context.Context, tenantID uuid.UUID, cutoff time.Time) (int64, error)

	ListActiveTenants(ctx context.Context) ([]TenantRef, error)
	TenantTimezone(ctx context.Context, tenantID uuid.UUID) (string, error)

	WhatsAppRepository
}

// WhatsAppRepository is the WhatsApp provider/template/delivery-log slice
// of Repository, named separately so service/whatsapp.go can document it
// next to the use cases that call it.
type WhatsAppRepository interface {
	UpsertWhatsAppProviderConfig(ctx context.Context, cfg WhatsAppProviderConfigRow) error
	GetWhatsAppProviderConfig(ctx context.Context, tenantID uuid.UUID) (EncryptedWhatsAppProviderConfig, error)
	GetWhatsAppProviderConfigByPhoneNumberID(ctx context.Context, phoneNumberID string) (EncryptedWhatsAppProviderConfig, error)

	CreateWhatsAppTemplate(ctx context.Context, tenantID uuid.UUID, tmpl domain.WhatsAppTemplate) (domain.WhatsAppTemplate, error)
	UpdateWhatsAppTemplate(ctx context.Context, tenantID, id uuid.UUID, tmpl domain.WhatsAppTemplate) (domain.WhatsAppTemplate, error)
	DeleteWhatsAppTemplate(ctx context.Context, tenantID, id uuid.UUID) error
	GetWhatsAppTemplate(ctx context.Context, tenantID, id uuid.UUID) (domain.WhatsAppTemplate, error)
	GetWhatsAppTemplateByName(ctx context.Context, tenantID uuid.UUID, name string) (domain.WhatsAppTemplate, error)
	ListWhatsAppTemplates(ctx context.Context, tenantID uuid.UUID) ([]domain.WhatsAppTemplate, error)

	SetDeliveryTemplateAndPayload(ctx context.Context, tenantID, deliveryID uuid.UUID, templateID uuid.NullUUID, payload string) error
	GetWhatsAppDelivery(ctx context.Context, tenantID, id uuid.UUID) (WhatsAppDelivery, error)
	ListWhatsAppDeliveries(ctx context.Context, tenantID uuid.UUID, status string, cursor Cursor, limit int) ([]WhatsAppDelivery, error)
	UpdateWhatsAppDeliveryReceipt(ctx context.Context, tenantID uuid.UUID, providerMessageID, status string, at time.Time) (bool, error)
}

// TenantRef is the minimal tenant identity the digest/retention jobs need.
type TenantRef struct {
	ID       uuid.UUID
	Timezone string
}

// Settings is one user's quiet-hours/digest configuration.
type Settings struct {
	UserID          uuid.UUID
	TenantID        uuid.UUID
	QuietHoursStart *int
	QuietHoursEnd   *int
	DigestEnabled   bool
	DigestHour      int
	LastDigestAt    *time.Time
}

// JobInserter is the slice of *river.Client[pgx.Tx] Notify needs: enqueue a
// delivery job in the same transaction as the inbox row it belongs to.
// Matched structurally so tests can supply a fake without a real database.
type JobInserter interface {
	InsertTx(ctx context.Context, tx pgx.Tx, args river.JobArgs, opts *river.InsertOpts) (*rivertype.JobInsertResult, error)
}

type Service struct {
	pool     *pgxpool.Pool
	repo     Repository
	jobs     JobInserter
	realtime RealtimePublisher
	clock    clock.Clock
	contacts ContactReader

	// WhatsApp secrets, set by SetWhatsAppSecrets after construction (see
	// that method's comment for why).
	waSealer      *crypto.Sealer
	waAppSecret   string
	waVerifyToken string

	// apnsConfigured gates iOS device registration: 503 rather than a
	// silently unusable row when the server has no APNs credentials
	// (reference/sion-rebuild-go apns.go's apnsEnabled check).
	apnsConfigured bool
}

// SetAPNsConfigured records whether this server has APNs credentials, for
// RegisterPushDevice's iOS check. Set once at wiring time (module.go),
// alongside SetWhatsAppSecrets.
func (s *Service) SetAPNsConfigured(configured bool) {
	s.apnsConfigured = configured
}

func New(pool *pgxpool.Pool, repo Repository, jobs JobInserter, realtime RealtimePublisher, clk clock.Clock, contacts ContactReader) *Service {
	if realtime == nil {
		realtime = NoopRealtimePublisher{}
	}
	if contacts == nil {
		contacts = NoopContactReader{}
	}
	return &Service{pool: pool, repo: repo, jobs: jobs, realtime: realtime, clock: clk, contacts: contacts}
}

// withTx opens the tenant-scoped transaction for one use case, per
// docs/03-layered-architecture.md section 2.
func (s *Service) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
}

// txFromContext is what job handlers and the maintenance jobs use to get
// the *pgx.Tx opened by withTx, for calling JobInserter.InsertTx.
func txFromContext(ctx context.Context) (pgx.Tx, bool) {
	return database.TxFromContext(ctx)
}
