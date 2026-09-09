package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) UpsertWhatsAppProviderConfig(ctx context.Context, cfg service.WhatsAppProviderConfigRow) error {
	return r.queries(ctx).UpsertWhatsAppProviderConfig(ctx, db.UpsertWhatsAppProviderConfigParams{
		TenantID: cfg.TenantID, Provider: string(cfg.Provider), PhoneNumberID: cfg.PhoneNumberID,
		AccessTokenEncrypted: cfg.AccessTokenEncrypted, AccessTokenKeyID: cfg.AccessTokenKeyID,
		GatewayUrl: cfg.GatewayURL, GatewayHeaderName: cfg.GatewayHeaderName,
		GatewayHeaderValueEncrypted: cfg.GatewayHeaderValueEncrypted, GatewayHeaderKeyID: cfg.GatewayHeaderKeyID,
		IsActive: cfg.IsActive,
	})
}

func (r *Repository) GetWhatsAppProviderConfig(ctx context.Context, tenantID uuid.UUID) (service.EncryptedWhatsAppProviderConfig, error) {
	row, err := r.queries(ctx).GetWhatsAppProviderConfig(ctx, tenantID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return service.EncryptedWhatsAppProviderConfig{}, domain.ErrWhatsAppProviderNotFound
		}
		return service.EncryptedWhatsAppProviderConfig{}, fmt.Errorf("get whatsapp provider config: %w", err)
	}
	return toEncryptedConfig(row), nil
}

func (r *Repository) GetWhatsAppProviderConfigByPhoneNumberID(ctx context.Context, phoneNumberID string) (service.EncryptedWhatsAppProviderConfig, error) {
	row, err := r.queries(ctx).GetWhatsAppProviderConfigByPhoneNumberID(ctx, phoneNumberID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return service.EncryptedWhatsAppProviderConfig{}, domain.ErrWhatsAppProviderNotFound
		}
		return service.EncryptedWhatsAppProviderConfig{}, fmt.Errorf("get whatsapp provider config by phone number id: %w", err)
	}
	return toEncryptedConfig(row), nil
}

func toEncryptedConfig(row db.WhatsappProviderConfig) service.EncryptedWhatsAppProviderConfig {
	return service.EncryptedWhatsAppProviderConfig{
		WhatsAppProviderConfigRow: service.WhatsAppProviderConfigRow{
			TenantID: row.TenantID, Provider: domain.WhatsAppProviderKind(row.Provider), PhoneNumberID: row.PhoneNumberID,
			AccessTokenEncrypted: row.AccessTokenEncrypted, AccessTokenKeyID: row.AccessTokenKeyID,
			GatewayURL: row.GatewayUrl, GatewayHeaderName: row.GatewayHeaderName,
			GatewayHeaderValueEncrypted: row.GatewayHeaderValueEncrypted, GatewayHeaderKeyID: row.GatewayHeaderKeyID,
			IsActive: row.IsActive,
		},
		UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func (r *Repository) CreateWhatsAppTemplate(ctx context.Context, tenantID uuid.UUID, tmpl domain.WhatsAppTemplate) (domain.WhatsAppTemplate, error) {
	placeholders, err := json.Marshal(tmpl.Placeholders)
	if err != nil {
		return domain.WhatsAppTemplate{}, fmt.Errorf("marshal placeholders: %w", err)
	}
	row, err := r.queries(ctx).InsertWhatsAppTemplate(ctx, db.InsertWhatsAppTemplateParams{
		TenantID: tenantID, Name: tmpl.Name, Locale: tmpl.Locale,
		MetaTemplateName: tmpl.MetaTemplateName, Body: tmpl.Body, Placeholders: placeholders,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return domain.WhatsAppTemplate{}, domain.ErrWhatsAppTemplateExists
		}
		return domain.WhatsAppTemplate{}, fmt.Errorf("insert whatsapp template: %w", err)
	}
	return toTemplate(row), nil
}

func (r *Repository) UpdateWhatsAppTemplate(ctx context.Context, tenantID, id uuid.UUID, tmpl domain.WhatsAppTemplate) (domain.WhatsAppTemplate, error) {
	placeholders, err := json.Marshal(tmpl.Placeholders)
	if err != nil {
		return domain.WhatsAppTemplate{}, fmt.Errorf("marshal placeholders: %w", err)
	}
	row, err := r.queries(ctx).UpdateWhatsAppTemplate(ctx, db.UpdateWhatsAppTemplateParams{
		TenantID: tenantID, ID: id, Locale: tmpl.Locale,
		MetaTemplateName: tmpl.MetaTemplateName, Body: tmpl.Body, Placeholders: placeholders,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.WhatsAppTemplate{}, domain.ErrWhatsAppTemplateNotFound
		}
		return domain.WhatsAppTemplate{}, fmt.Errorf("update whatsapp template: %w", err)
	}
	return toTemplate(row), nil
}

func (r *Repository) DeleteWhatsAppTemplate(ctx context.Context, tenantID, id uuid.UUID) error {
	n, err := r.queries(ctx).DeleteWhatsAppTemplate(ctx, db.DeleteWhatsAppTemplateParams{TenantID: tenantID, ID: id})
	if err != nil {
		return fmt.Errorf("delete whatsapp template: %w", err)
	}
	if n == 0 {
		return domain.ErrWhatsAppTemplateNotFound
	}
	return nil
}

func (r *Repository) GetWhatsAppTemplate(ctx context.Context, tenantID, id uuid.UUID) (domain.WhatsAppTemplate, error) {
	row, err := r.queries(ctx).GetWhatsAppTemplate(ctx, db.GetWhatsAppTemplateParams{TenantID: tenantID, ID: id})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.WhatsAppTemplate{}, domain.ErrWhatsAppTemplateNotFound
		}
		return domain.WhatsAppTemplate{}, fmt.Errorf("get whatsapp template: %w", err)
	}
	return toTemplate(row), nil
}

func (r *Repository) GetWhatsAppTemplateByName(ctx context.Context, tenantID uuid.UUID, name string) (domain.WhatsAppTemplate, error) {
	row, err := r.queries(ctx).GetWhatsAppTemplateByName(ctx, db.GetWhatsAppTemplateByNameParams{TenantID: tenantID, Name: name})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.WhatsAppTemplate{}, domain.ErrWhatsAppTemplateNotFound
		}
		return domain.WhatsAppTemplate{}, fmt.Errorf("get whatsapp template by name: %w", err)
	}
	return toTemplate(row), nil
}

func (r *Repository) ListWhatsAppTemplates(ctx context.Context, tenantID uuid.UUID) ([]domain.WhatsAppTemplate, error) {
	rows, err := r.queries(ctx).ListWhatsAppTemplates(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list whatsapp templates: %w", err)
	}
	out := make([]domain.WhatsAppTemplate, len(rows))
	for i, row := range rows {
		out[i] = toTemplate(row)
	}
	return out, nil
}

func toTemplate(row db.WhatsappTemplate) domain.WhatsAppTemplate {
	var placeholders []string
	_ = json.Unmarshal(row.Placeholders, &placeholders)
	return domain.WhatsAppTemplate{
		ID: row.ID, TenantID: row.TenantID, Name: row.Name, Locale: row.Locale,
		MetaTemplateName: row.MetaTemplateName, Body: row.Body, Placeholders: placeholders,
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func (r *Repository) SetDeliveryTemplateAndPayload(ctx context.Context, tenantID, deliveryID uuid.UUID, templateID uuid.NullUUID, payload string) error {
	err := r.queries(ctx).SetDeliveryTemplateAndPayload(ctx, db.SetDeliveryTemplateAndPayloadParams{
		TenantID: tenantID, ID: deliveryID, TemplateID: pdatabase.NullUUID(templateID), Payload: payload,
	})
	if err != nil {
		return fmt.Errorf("set delivery template and payload: %w", err)
	}
	return nil
}

func (r *Repository) GetWhatsAppDelivery(ctx context.Context, tenantID, id uuid.UUID) (service.WhatsAppDelivery, error) {
	row, err := r.queries(ctx).GetWhatsAppDelivery(ctx, db.GetWhatsAppDeliveryParams{TenantID: tenantID, ID: id})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return service.WhatsAppDelivery{}, domain.ErrWhatsAppDeliveryNotFound
		}
		return service.WhatsAppDelivery{}, fmt.Errorf("get whatsapp delivery: %w", err)
	}
	return toWhatsAppDelivery(row), nil
}

func (r *Repository) ListWhatsAppDeliveries(ctx context.Context, tenantID uuid.UUID, status string, cursor service.Cursor, limit int) ([]service.WhatsAppDelivery, error) {
	rows, err := r.queries(ctx).ListWhatsAppDeliveries(ctx, db.ListWhatsAppDeliveriesParams{
		TenantID: tenantID, Status: status,
		HasCursor: cursor.Present, CursorCreatedAt: pdatabase.Timestamptz(cursor.CreatedAt), CursorID: cursor.ID,
		PageLimit: int32(limit), //nolint:gosec // limit is clamped to <=100 by the service before this call
	})
	if err != nil {
		return nil, fmt.Errorf("list whatsapp deliveries: %w", err)
	}
	out := make([]service.WhatsAppDelivery, len(rows))
	for i, row := range rows {
		out[i] = toWhatsAppDelivery(row)
	}
	return out, nil
}

func (r *Repository) UpdateWhatsAppDeliveryReceipt(ctx context.Context, tenantID uuid.UUID, providerMessageID, status string, at time.Time) (bool, error) {
	n, err := r.queries(ctx).UpdateWhatsAppDeliveryReceipt(ctx, db.UpdateWhatsAppDeliveryReceiptParams{
		TenantID: tenantID, ProviderMessageID: pdatabase.Text(providerMessageID), Status: status, DeliveredAt: pdatabase.Timestamptz(at),
	})
	if err != nil {
		return false, fmt.Errorf("update whatsapp delivery receipt: %w", err)
	}
	return n > 0, nil
}

func toWhatsAppDelivery(row db.MessageDelivery) service.WhatsAppDelivery {
	return service.WhatsAppDelivery{
		ID: row.ID, TenantID: row.TenantID, NotificationID: row.NotificationID, Target: row.Target,
		Provider: row.Provider, Status: row.Status, ProviderMessageID: pdatabase.TextOrEmpty(row.ProviderMessageID),
		Error: pdatabase.TextOrEmpty(row.Error), Attempts: int(row.Attempts), TemplateID: pdatabase.UUIDOrNil(row.TemplateID),
		Payload: row.Payload, SentAt: pdatabase.TimePtr(row.SentAt), DeliveredAt: pdatabase.TimePtr(row.DeliveredAt),
		ReadAt: pdatabase.TimePtr(row.ReadAt), CreatedAt: pdatabase.TimeOrZero(row.CreatedAt),
	}
}

func isUniqueViolation(err error) bool {
	var pgErr interface{ SQLState() string }
	if errors.As(err, &pgErr) {
		return pgErr.SQLState() == "23505"
	}
	return false
}
