package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
)

// errSealerNotConfigured is returned when a WhatsApp provider write is
// attempted before wiring called SetWhatsAppSecrets -- a configuration
// mistake, not a tenant-facing condition, so it is not a domain error.
var errSealerNotConfigured = errors.New("whatsapp crypto sealer not configured")

// WhatsAppProviderConfigRow is the shape a provider config write and read
// travel through the Repository boundary in: ciphertext plus the key id
// it was sealed with, never the plaintext secret. The service is the only
// layer that holds the crypto.Sealer, so encryption and decryption happen
// here, not in the repository.
type WhatsAppProviderConfigRow struct {
	TenantID                    uuid.UUID
	Provider                    domain.WhatsAppProviderKind
	PhoneNumberID               string
	AccessTokenEncrypted        []byte
	AccessTokenKeyID            string
	GatewayURL                  string
	GatewayHeaderName           string
	GatewayHeaderValueEncrypted []byte
	GatewayHeaderKeyID          string
	IsActive                    bool
}

type EncryptedWhatsAppProviderConfig struct {
	WhatsAppProviderConfigRow
	UpdatedAt time.Time
}

// WhatsAppDelivery is one message_deliveries row for the whatsapp channel,
// as exposed to the HTTP layer for the delivery log.
type WhatsAppDelivery struct {
	ID                uuid.UUID
	TenantID          uuid.UUID
	NotificationID    uuid.UUID
	Target            string
	Provider          string
	Status            string
	ProviderMessageID string
	Error             string
	Attempts          int
	TemplateID        uuid.NullUUID
	Payload           string
	SentAt            *time.Time
	DeliveredAt       *time.Time
	ReadAt            *time.Time
	CreatedAt         time.Time
}

// SetWhatsAppSecrets wires the crypto.Sealer and Meta app-level secrets
// after construction, the same way school.Service.SetOnboardingDependencies
// breaks a wiring-time dependency cycle: these are only known once
// wiring.SendersFromConfig and crypto.NewSealer have both run.
func (s *Service) SetWhatsAppSecrets(sealer *crypto.Sealer, appSecret, webhookVerifyToken string) {
	s.waSealer = sealer
	s.waAppSecret = appSecret
	s.waVerifyToken = webhookVerifyToken
}

// WhatsAppProviderInput is what a tenant admin submits to configure or
// change their WhatsApp gateway. An empty AccessToken/GatewayHeaderValue
// on an update means "keep the existing secret" -- the web UI never
// re-displays a saved token, so it cannot resubmit it.
type WhatsAppProviderInput struct {
	Provider           domain.WhatsAppProviderKind
	PhoneNumberID      string
	AccessToken        string
	GatewayURL         string
	GatewayHeaderName  string
	GatewayHeaderValue string
	IsActive           bool
}

// WhatsAppProviderStatus is what the HTTP layer may return: whether a
// secret is set, never the secret itself.
type WhatsAppProviderStatus struct {
	Provider          domain.WhatsAppProviderKind
	PhoneNumberID     string
	HasAccessToken    bool
	GatewayURL        string
	GatewayHeaderName string
	HasGatewayHeader  bool
	IsActive          bool
	UpdatedAt         time.Time
}

func (s *Service) GetWhatsAppProviderStatus(ctx context.Context, tenantID uuid.UUID) (WhatsAppProviderStatus, error) {
	var out WhatsAppProviderStatus
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		cfg, err := s.repo.GetWhatsAppProviderConfig(ctx, tenantID)
		if err != nil {
			return err
		}
		out = WhatsAppProviderStatus{
			Provider: cfg.Provider, PhoneNumberID: cfg.PhoneNumberID,
			HasAccessToken: len(cfg.AccessTokenEncrypted) > 0,
			GatewayURL:     cfg.GatewayURL, GatewayHeaderName: cfg.GatewayHeaderName,
			HasGatewayHeader: len(cfg.GatewayHeaderValueEncrypted) > 0,
			IsActive:         cfg.IsActive, UpdatedAt: cfg.UpdatedAt,
		}
		return nil
	})
	return out, err
}

// SetWhatsAppProvider validates and encrypts the input, then upserts the
// tenant's provider config. It reads the existing row first so an empty
// secret field in the input keeps the previously stored ciphertext
// instead of wiping it.
func (s *Service) SetWhatsAppProvider(ctx context.Context, tenantID uuid.UUID, in WhatsAppProviderInput) error {
	if !in.Provider.Valid() {
		return domain.ErrInvalidWhatsAppProvider
	}
	if s.waSealer == nil {
		return fmt.Errorf("whatsapp: %w", errSealerNotConfigured)
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		existing, err := s.repo.GetWhatsAppProviderConfig(ctx, tenantID)
		if err != nil && !isNotFound(err) {
			return err
		}
		row := WhatsAppProviderConfigRow{
			TenantID: tenantID, Provider: in.Provider, PhoneNumberID: in.PhoneNumberID,
			GatewayURL: in.GatewayURL, GatewayHeaderName: in.GatewayHeaderName, IsActive: in.IsActive,
			AccessTokenEncrypted: existing.AccessTokenEncrypted, AccessTokenKeyID: existing.AccessTokenKeyID,
			GatewayHeaderValueEncrypted: existing.GatewayHeaderValueEncrypted, GatewayHeaderKeyID: existing.GatewayHeaderKeyID,
		}
		if in.AccessToken != "" {
			sealed, err := s.waSealer.Seal([]byte(in.AccessToken))
			if err != nil {
				return fmt.Errorf("seal whatsapp access token: %w", err)
			}
			row.AccessTokenEncrypted, row.AccessTokenKeyID = sealed, s.waSealer.KeyID
		}
		if in.GatewayHeaderValue != "" {
			sealed, err := s.waSealer.Seal([]byte(in.GatewayHeaderValue))
			if err != nil {
				return fmt.Errorf("seal whatsapp gateway header: %w", err)
			}
			row.GatewayHeaderValueEncrypted, row.GatewayHeaderKeyID = sealed, s.waSealer.KeyID
		}
		return s.repo.UpsertWhatsAppProviderConfig(ctx, row)
	})
}

// ResolveWhatsAppProvider returns the tenant's decrypted provider config
// for the delivery worker to build a notify.WhatsAppSender from. It
// returns domain.ErrWhatsAppProviderNotFound (or an inactive config) so
// the caller can fall back to the deployment-wide default sender.
func (s *Service) ResolveWhatsAppProvider(ctx context.Context, tenantID uuid.UUID) (domain.WhatsAppProviderConfig, error) {
	var out domain.WhatsAppProviderConfig
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		cfg, err := s.repo.GetWhatsAppProviderConfig(ctx, tenantID)
		if err != nil {
			return err
		}
		if !cfg.IsActive {
			return domain.ErrWhatsAppProviderNotFound
		}
		out, err = s.decryptProviderConfig(cfg)
		return err
	})
	return out, err
}

func (s *Service) decryptProviderConfig(cfg EncryptedWhatsAppProviderConfig) (domain.WhatsAppProviderConfig, error) {
	out := domain.WhatsAppProviderConfig{
		TenantID: cfg.TenantID, Provider: cfg.Provider, PhoneNumberID: cfg.PhoneNumberID,
		GatewayURL: cfg.GatewayURL, GatewayHeaderName: cfg.GatewayHeaderName, IsActive: cfg.IsActive, UpdatedAt: cfg.UpdatedAt,
	}
	if s.waSealer == nil {
		return out, nil
	}
	if len(cfg.AccessTokenEncrypted) > 0 {
		plain, err := s.waSealer.Open(cfg.AccessTokenEncrypted)
		if err != nil {
			return domain.WhatsAppProviderConfig{}, fmt.Errorf("decrypt whatsapp access token: %w", err)
		}
		out.AccessToken = string(plain)
	}
	if len(cfg.GatewayHeaderValueEncrypted) > 0 {
		plain, err := s.waSealer.Open(cfg.GatewayHeaderValueEncrypted)
		if err != nil {
			return domain.WhatsAppProviderConfig{}, fmt.Errorf("decrypt whatsapp gateway header: %w", err)
		}
		out.GatewayHeaderValue = string(plain)
	}
	return out, nil
}

func isNotFound(err error) bool {
	return errors.Is(err, domain.ErrWhatsAppProviderNotFound)
}
