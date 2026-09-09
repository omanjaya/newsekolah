package service

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
)

// WhatsAppTemplateInput is what a tenant admin submits to create or
// update a template. Placeholders are derived from Body, not accepted
// from the caller, so they can never drift from what the body actually
// references.
type WhatsAppTemplateInput struct {
	Name             string
	Locale           string
	MetaTemplateName string
	Body             string
}

func (in WhatsAppTemplateInput) toDomain() domain.WhatsAppTemplate {
	return domain.WhatsAppTemplate{
		Name: strings.TrimSpace(in.Name), Locale: strings.TrimSpace(in.Locale),
		MetaTemplateName: strings.TrimSpace(in.MetaTemplateName), Body: in.Body,
		Placeholders: domain.ExtractPlaceholders(in.Body),
	}
}

func (s *Service) CreateWhatsAppTemplate(ctx context.Context, tenantID uuid.UUID, in WhatsAppTemplateInput) (domain.WhatsAppTemplate, error) {
	var out domain.WhatsAppTemplate
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.CreateWhatsAppTemplate(ctx, tenantID, in.toDomain())
		return err
	})
	return out, err
}

func (s *Service) UpdateWhatsAppTemplate(ctx context.Context, tenantID, id uuid.UUID, in WhatsAppTemplateInput) (domain.WhatsAppTemplate, error) {
	var out domain.WhatsAppTemplate
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.UpdateWhatsAppTemplate(ctx, tenantID, id, in.toDomain())
		return err
	})
	return out, err
}

func (s *Service) DeleteWhatsAppTemplate(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.DeleteWhatsAppTemplate(ctx, tenantID, id)
	})
}

func (s *Service) GetWhatsAppTemplate(ctx context.Context, tenantID, id uuid.UUID) (domain.WhatsAppTemplate, error) {
	var out domain.WhatsAppTemplate
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.GetWhatsAppTemplate(ctx, tenantID, id)
		return err
	})
	return out, err
}

func (s *Service) ListWhatsAppTemplates(ctx context.Context, tenantID uuid.UUID) ([]domain.WhatsAppTemplate, error) {
	var out []domain.WhatsAppTemplate
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListWhatsAppTemplates(ctx, tenantID)
		return err
	})
	return out, err
}

// PreviewWhatsAppTemplate renders a template against sample variables
// without sending anything or touching the delivery log, for the web
// editor's live preview.
func (s *Service) PreviewWhatsAppTemplate(ctx context.Context, tenantID, id uuid.UUID, vars map[string]string) (string, error) {
	tmpl, err := s.GetWhatsAppTemplate(ctx, tenantID, id)
	if err != nil {
		return "", err
	}
	return domain.RenderTemplate(tmpl, vars)
}
