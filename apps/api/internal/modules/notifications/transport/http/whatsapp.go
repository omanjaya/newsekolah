package http

import (
	"context"
	"errors"
	"io"
	"strings"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

var whatsAppErrorMap = map[error]*httpx.Error{
	domain.ErrWhatsAppTemplateNotFound: httpx.ErrWhatsAppTemplateNotFound,
	domain.ErrWhatsAppTemplateExists:   httpx.ErrWhatsAppTemplateExists,
	domain.ErrWhatsAppProviderNotFound: httpx.ErrWhatsAppProviderNotFound,
	domain.ErrInvalidWhatsAppProvider:  httpx.ErrValidation,
	domain.ErrWhatsAppDeliveryNotFound: httpx.ErrWhatsAppDeliveryNotFound,
	domain.ErrMissingTemplateVariable:  httpx.ErrValidation,
}

func mapWhatsAppError(err error) error {
	for domainErr, httpErr := range whatsAppErrorMap {
		if errors.Is(err, domainErr) {
			return httpErr
		}
	}
	return mapError(err)
}

// Provider config.

func (h *NotificationsHandler) GetWhatsAppProviderConfig(ctx context.Context, _ api.GetWhatsAppProviderConfigRequestObject) (api.GetWhatsAppProviderConfigResponseObject, error) {
	status, err := h.service.GetWhatsAppProviderStatus(ctx, tenantID(ctx))
	if err != nil {
		if errors.Is(err, domain.ErrWhatsAppProviderNotFound) {
			return api.GetWhatsAppProviderConfig200JSONResponse(toAPIProviderStatus(service.WhatsAppProviderStatus{Provider: domain.WhatsAppProviderMeta})), nil
		}
		return nil, mapWhatsAppError(err)
	}
	return api.GetWhatsAppProviderConfig200JSONResponse(toAPIProviderStatus(status)), nil
}

func (h *NotificationsHandler) SetWhatsAppProviderConfig(ctx context.Context, request api.SetWhatsAppProviderConfigRequestObject) (api.SetWhatsAppProviderConfigResponseObject, error) {
	body := request.Body
	if body == nil {
		return nil, httpx.ErrValidation
	}
	in := service.WhatsAppProviderInput{Provider: domain.WhatsAppProviderKind(body.Provider)}
	if body.PhoneNumberId != nil {
		in.PhoneNumberID = strings.TrimSpace(*body.PhoneNumberId)
	}
	if body.AccessToken != nil {
		in.AccessToken = *body.AccessToken
	}
	if body.GatewayUrl != nil {
		in.GatewayURL = strings.TrimSpace(*body.GatewayUrl)
	}
	if body.GatewayHeaderName != nil {
		in.GatewayHeaderName = strings.TrimSpace(*body.GatewayHeaderName)
	}
	if body.GatewayHeaderValue != nil {
		in.GatewayHeaderValue = *body.GatewayHeaderValue
	}
	if body.IsActive != nil {
		in.IsActive = *body.IsActive
	}

	if err := h.service.SetWhatsAppProvider(ctx, tenantID(ctx), in); err != nil {
		return nil, mapWhatsAppError(err)
	}
	status, err := h.service.GetWhatsAppProviderStatus(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapWhatsAppError(err)
	}
	return api.SetWhatsAppProviderConfig200JSONResponse(toAPIProviderStatus(status)), nil
}

func toAPIProviderStatus(s service.WhatsAppProviderStatus) api.WhatsAppProviderStatus {
	out := api.WhatsAppProviderStatus{
		Provider: api.WhatsAppProviderKind(s.Provider), HasAccessToken: s.HasAccessToken,
		HasGatewayHeader: s.HasGatewayHeader, IsActive: s.IsActive,
	}
	if s.PhoneNumberID != "" {
		out.PhoneNumberId = &s.PhoneNumberID
	}
	if s.GatewayURL != "" {
		out.GatewayUrl = &s.GatewayURL
	}
	if s.GatewayHeaderName != "" {
		out.GatewayHeaderName = &s.GatewayHeaderName
	}
	if !s.UpdatedAt.IsZero() {
		out.UpdatedAt = &s.UpdatedAt
	}
	return out
}

// Templates.

func (h *NotificationsHandler) ListWhatsAppTemplates(ctx context.Context, _ api.ListWhatsAppTemplatesRequestObject) (api.ListWhatsAppTemplatesResponseObject, error) {
	templates, err := h.service.ListWhatsAppTemplates(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapWhatsAppError(err)
	}
	out := api.ListWhatsAppTemplates200JSONResponse{Data: make([]api.WhatsAppTemplate, len(templates))}
	for i, t := range templates {
		out.Data[i] = toAPITemplate(t)
	}
	return out, nil
}

func (h *NotificationsHandler) CreateWhatsAppTemplate(ctx context.Context, request api.CreateWhatsAppTemplateRequestObject) (api.CreateWhatsAppTemplateResponseObject, error) {
	in, err := toTemplateInput(request.Body)
	if err != nil {
		return nil, err
	}
	tmpl, err := h.service.CreateWhatsAppTemplate(ctx, tenantID(ctx), in)
	if err != nil {
		return nil, mapWhatsAppError(err)
	}
	return api.CreateWhatsAppTemplate201JSONResponse(toAPITemplate(tmpl)), nil
}

func (h *NotificationsHandler) UpdateWhatsAppTemplate(ctx context.Context, request api.UpdateWhatsAppTemplateRequestObject) (api.UpdateWhatsAppTemplateResponseObject, error) {
	in, err := toTemplateInput(request.Body)
	if err != nil {
		return nil, err
	}
	tmpl, err := h.service.UpdateWhatsAppTemplate(ctx, tenantID(ctx), request.TemplateId, in)
	if err != nil {
		return nil, mapWhatsAppError(err)
	}
	return api.UpdateWhatsAppTemplate200JSONResponse(toAPITemplate(tmpl)), nil
}

func (h *NotificationsHandler) DeleteWhatsAppTemplate(ctx context.Context, request api.DeleteWhatsAppTemplateRequestObject) (api.DeleteWhatsAppTemplateResponseObject, error) {
	if err := h.service.DeleteWhatsAppTemplate(ctx, tenantID(ctx), request.TemplateId); err != nil {
		return nil, mapWhatsAppError(err)
	}
	return api.DeleteWhatsAppTemplate204Response{}, nil
}

func (h *NotificationsHandler) PreviewWhatsAppTemplate(ctx context.Context, request api.PreviewWhatsAppTemplateRequestObject) (api.PreviewWhatsAppTemplateResponseObject, error) {
	vars := map[string]string{}
	if request.Body != nil && request.Body.Variables != nil {
		vars = *request.Body.Variables
	}
	rendered, err := h.service.PreviewWhatsAppTemplate(ctx, tenantID(ctx), request.TemplateId, vars)
	if err != nil {
		if errors.Is(err, domain.ErrMissingTemplateVariable) {
			return api.PreviewWhatsAppTemplate200JSONResponse{Rendered: "", MissingVariables: missingVariables(err)}, nil
		}
		return nil, mapWhatsAppError(err)
	}
	return api.PreviewWhatsAppTemplate200JSONResponse{Rendered: rendered}, nil
}

func missingVariables(err error) *[]string {
	msg := err.Error()
	idx := strings.Index(msg, ": ")
	if idx < 0 {
		return nil
	}
	parts := strings.Split(msg[idx+2:], ", ")
	return &parts
}

func toTemplateInput(body *api.WhatsAppTemplateInput) (service.WhatsAppTemplateInput, error) {
	if body == nil || strings.TrimSpace(body.Name) == "" || strings.TrimSpace(body.MetaTemplateName) == "" || strings.TrimSpace(body.Body) == "" {
		return service.WhatsAppTemplateInput{}, httpx.ErrValidation
	}
	return service.WhatsAppTemplateInput{
		Name: body.Name, Locale: body.Locale, MetaTemplateName: body.MetaTemplateName, Body: body.Body,
	}, nil
}

func toAPITemplate(t domain.WhatsAppTemplate) api.WhatsAppTemplate {
	return api.WhatsAppTemplate{
		Id: t.ID, Name: t.Name, Locale: t.Locale, MetaTemplateName: t.MetaTemplateName, Body: t.Body,
		Placeholders: t.Placeholders, CreatedAt: t.CreatedAt, UpdatedAt: t.UpdatedAt,
	}
}

// Delivery log.

func (h *NotificationsHandler) ListWhatsAppDeliveries(ctx context.Context, request api.ListWhatsAppDeliveriesRequestObject) (api.ListWhatsAppDeliveriesResponseObject, error) {
	status, cursor, limit := "", "", 0
	if request.Params.Status != nil {
		status = string(*request.Params.Status)
	}
	if request.Params.Cursor != nil {
		cursor = *request.Params.Cursor
	}
	if request.Params.Limit != nil {
		limit = *request.Params.Limit
	}
	deliveries, next, err := h.service.ListWhatsAppDeliveries(ctx, tenantID(ctx), status, cursor, limit)
	if err != nil {
		return nil, mapWhatsAppError(err)
	}
	out := api.ListWhatsAppDeliveries200JSONResponse{Data: make([]api.WhatsAppDelivery, len(deliveries))}
	for i, d := range deliveries {
		out.Data[i] = toAPIDelivery(d)
	}
	out.Page.NextCursor = next
	return out, nil
}

func (h *NotificationsHandler) ResendWhatsAppDelivery(ctx context.Context, request api.ResendWhatsAppDeliveryRequestObject) (api.ResendWhatsAppDeliveryResponseObject, error) {
	newID, err := h.service.ResendWhatsAppDelivery(ctx, tenantID(ctx), request.DeliveryId)
	if err != nil {
		return nil, mapWhatsAppError(err)
	}
	delivery, err := h.service.GetWhatsAppDeliveryForAPI(ctx, tenantID(ctx), newID)
	if err != nil {
		return nil, mapWhatsAppError(err)
	}
	return api.ResendWhatsAppDelivery200JSONResponse(toAPIDelivery(delivery)), nil
}

func toAPIDelivery(d service.WhatsAppDelivery) api.WhatsAppDelivery {
	out := api.WhatsAppDelivery{
		Id: d.ID, Target: d.Target, Provider: d.Provider, Status: api.WhatsAppDeliveryStatus(d.Status),
		Attempts: d.Attempts, CreatedAt: d.CreatedAt,
	}
	if d.ProviderMessageID != "" {
		out.ProviderMessageId = &d.ProviderMessageID
	}
	if d.Error != "" {
		out.Error = &d.Error
	}
	if d.TemplateID.Valid {
		id := d.TemplateID.UUID
		out.TemplateId = &id
	}
	out.SentAt, out.DeliveredAt, out.ReadAt = d.SentAt, d.DeliveredAt, d.ReadAt
	return out
}

// Webhook (public).

func (h *NotificationsHandler) VerifyWhatsAppWebhook(_ context.Context, request api.VerifyWhatsAppWebhookRequestObject) (api.VerifyWhatsAppWebhookResponseObject, error) {
	challenge, ok := h.service.VerifyWebhookChallenge(request.Params.HubMode, request.Params.HubVerifyToken, request.Params.HubChallenge)
	if !ok {
		return api.VerifyWhatsAppWebhook403JSONResponse{}, nil
	}
	return api.VerifyWhatsAppWebhook200TextResponse(challenge), nil
}

func (h *NotificationsHandler) ReceiveWhatsAppWebhook(ctx context.Context, request api.ReceiveWhatsAppWebhookRequestObject) (api.ReceiveWhatsAppWebhookResponseObject, error) {
	body, err := io.ReadAll(request.Body)
	if err != nil {
		return nil, httpx.ErrValidation
	}
	if err := h.service.HandleWhatsAppStatusWebhook(ctx, body, request.Params.XHubSignature256); err != nil {
		if errors.Is(err, domain.ErrInvalidWebhookSignature) {
			return api.ReceiveWhatsAppWebhook401Response{}, nil
		}
		return nil, httpx.Internal(err)
	}
	return api.ReceiveWhatsAppWebhook200Response{}, nil
}
