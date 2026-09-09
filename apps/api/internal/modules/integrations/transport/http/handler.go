// Package http adapts the generated strict-server interface to the
// integrations service: decode, call, encode, map errors. No rules here.
package http

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

type IntegrationsHandler struct {
	service *service.Service
}

func New(svc *service.Service) *IntegrationsHandler {
	return &IntegrationsHandler{service: svc}
}

func tenantID(ctx context.Context) uuid.UUID {
	id, _ := httpx.TenantIDFromContext(ctx)
	return id
}

func userID(ctx context.Context) uuid.UUID {
	id, _ := httpx.UserIDFromContext(ctx)
	return id
}

var errorMap = map[error]*httpx.Error{
	domain.ErrKeyNotFound:          httpx.ErrAPIKeyNotFound,
	domain.ErrKeyAlreadyRevoked:    httpx.ErrAPIKeyRevoked,
	domain.ErrKeyPermissionExceeds: httpx.ErrAPIKeyPermissionExceeds,
	domain.ErrEndpointNotFound:     httpx.ErrWebhookEndpointNotFound,
	domain.ErrEndpointDisabled:     httpx.ErrWebhookEndpointDisabled,
	domain.ErrURLNotAllowed:        httpx.ErrWebhookURLNotAllowed,
	domain.ErrEventTypeUnknown:     httpx.ErrWebhookEventTypeUnknown,
	domain.ErrDeliveryNotFound:     httpx.ErrWebhookDeliveryNotFound,
	domain.ErrDeliveryNotRetryable: httpx.ErrWebhookDeliveryNotFailed,
	domain.ErrInvalidInput:         httpx.ErrValidation,
}

func mapError(err error) error {
	for domainErr, httpErr := range errorMap {
		if errors.Is(err, domainErr) {
			return httpErr
		}
	}
	var appErr *httpx.Error
	if errors.As(err, &appErr) {
		return appErr
	}
	return httpx.Internal(err)
}

// API keys.

func (h *IntegrationsHandler) ListAPIKeys(ctx context.Context, _ api.ListAPIKeysRequestObject) (api.ListAPIKeysResponseObject, error) {
	keys, err := h.service.ListKeys(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]api.APIKey, len(keys))
	for i, k := range keys {
		out[i] = toAPIKey(k)
	}
	return api.ListAPIKeys200JSONResponse{Data: out}, nil
}

func (h *IntegrationsHandler) CreateAPIKey(ctx context.Context, request api.CreateAPIKeyRequestObject) (api.CreateAPIKeyResponseObject, error) {
	body := request.Body
	input := service.CreateKeyInput{Name: body.Name, Permissions: body.Permissions, ExpiresAt: body.ExpiresAt}
	if body.IpAllowlist != nil {
		input.IPAllowlist = *body.IpAllowlist
	}
	if body.RateLimitPerMinute != nil {
		input.RateLimitPerMinute = *body.RateLimitPerMinute
	}

	created, err := h.service.CreateKey(ctx, tenantID(ctx), userID(ctx), input)
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateAPIKey201JSONResponse{ApiKey: toAPIKey(created.Key), Token: created.Token}, nil
}

func (h *IntegrationsHandler) RevokeAPIKey(ctx context.Context, request api.RevokeAPIKeyRequestObject) (api.RevokeAPIKeyResponseObject, error) {
	revoked, err := h.service.RevokeKey(ctx, tenantID(ctx), request.ApiKeyId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.RevokeAPIKey200JSONResponse(toAPIKey(revoked)), nil
}

func toAPIKey(k domain.APIKey) api.APIKey {
	return api.APIKey{
		Id: k.ID, Name: k.Name, Permissions: k.Permissions, IpAllowlist: k.IPAllowlist,
		RateLimitPerMinute: k.RateLimitPerMinute, ExpiresAt: k.ExpiresAt, RevokedAt: k.RevokedAt,
		LastUsedAt: k.LastUsedAt, CreatedAt: k.CreatedAt,
	}
}

// Webhook endpoints.

func (h *IntegrationsHandler) ListWebhookEndpoints(ctx context.Context, _ api.ListWebhookEndpointsRequestObject) (api.ListWebhookEndpointsResponseObject, error) {
	endpoints, err := h.service.ListEndpoints(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]api.WebhookEndpoint, len(endpoints))
	for i, e := range endpoints {
		out[i] = toWebhookEndpoint(e)
	}
	return api.ListWebhookEndpoints200JSONResponse{Data: out}, nil
}

func (h *IntegrationsHandler) CreateWebhookEndpoint(ctx context.Context, request api.CreateWebhookEndpointRequestObject) (api.CreateWebhookEndpointResponseObject, error) {
	body := request.Body
	input := service.RegisterEndpointInput{URL: body.Url, EventTypes: body.EventTypes}
	if body.Description != nil {
		input.Description = *body.Description
	}
	created, err := h.service.RegisterEndpoint(ctx, tenantID(ctx), userID(ctx), input)
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateWebhookEndpoint201JSONResponse(toWebhookEndpoint(created)), nil
}

func (h *IntegrationsHandler) UpdateWebhookEndpoint(ctx context.Context, request api.UpdateWebhookEndpointRequestObject) (api.UpdateWebhookEndpointResponseObject, error) {
	body := request.Body
	input := service.UpdateEndpointInput{URL: body.Url, EventTypes: body.EventTypes}
	if body.Description != nil {
		input.Description = *body.Description
	}
	updated, err := h.service.UpdateEndpoint(ctx, tenantID(ctx), request.WebhookEndpointId, input)
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateWebhookEndpoint200JSONResponse(toWebhookEndpoint(updated)), nil
}

func (h *IntegrationsHandler) DeleteWebhookEndpoint(ctx context.Context, request api.DeleteWebhookEndpointRequestObject) (api.DeleteWebhookEndpointResponseObject, error) {
	if err := h.service.DeleteEndpoint(ctx, tenantID(ctx), request.WebhookEndpointId); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteWebhookEndpoint204Response{}, nil
}

func toWebhookEndpoint(e domain.WebhookEndpoint) api.WebhookEndpoint {
	return api.WebhookEndpoint{
		Id: e.ID, Url: e.URL, Description: e.Description, EventTypes: e.EventTypes,
		Status: api.WebhookEndpointStatus(e.Status), DisabledReason: e.DisabledReason,
		ConsecutiveFailures: e.ConsecutiveFailures, CreatedAt: e.CreatedAt, UpdatedAt: e.UpdatedAt,
	}
}

// Deliveries and the event catalogue.

func (h *IntegrationsHandler) ListWebhookDeliveries(ctx context.Context, request api.ListWebhookDeliveriesRequestObject) (api.ListWebhookDeliveriesResponseObject, error) {
	var endpointID uuid.NullUUID
	if request.Params.EndpointId != nil {
		endpointID = uuid.NullUUID{UUID: *request.Params.EndpointId, Valid: true}
	}
	cursor, limit := "", 0
	if request.Params.Cursor != nil {
		cursor = *request.Params.Cursor
	}
	if request.Params.Limit != nil {
		limit = *request.Params.Limit
	}

	items, nextCursor, err := h.service.ListDeliveries(ctx, tenantID(ctx), endpointID, cursor, limit)
	if err != nil {
		return nil, mapError(err)
	}
	out := api.WebhookDeliveryPage{Data: make([]api.WebhookDelivery, len(items))}
	for i, d := range items {
		out.Data[i] = toWebhookDelivery(d)
	}
	out.Page.NextCursor = nextCursor
	return api.ListWebhookDeliveries200JSONResponse(out), nil
}

func (h *IntegrationsHandler) RetryWebhookDelivery(ctx context.Context, request api.RetryWebhookDeliveryRequestObject) (api.RetryWebhookDeliveryResponseObject, error) {
	if err := h.service.RetryDelivery(ctx, tenantID(ctx), request.WebhookDeliveryId); err != nil {
		return nil, mapError(err)
	}
	return api.RetryWebhookDelivery204Response{}, nil
}

func (h *IntegrationsHandler) ListIntegrationEventTypes(_ context.Context, _ api.ListIntegrationEventTypesRequestObject) (api.ListIntegrationEventTypesResponseObject, error) {
	return api.ListIntegrationEventTypes200JSONResponse{Data: service.EventCatalog}, nil
}

func toWebhookDelivery(d domain.Delivery) api.WebhookDelivery {
	return api.WebhookDelivery{
		Id: d.ID, EndpointId: d.EndpointID, EventType: d.EventType, Status: api.WebhookDeliveryStatus(d.Status),
		AttemptCount: d.AttemptCount, LastStatusCode: d.LastStatusCode, LastError: d.LastError,
		DeliveredAt: d.DeliveredAt, NextAttemptAt: d.NextAttemptAt, CreatedAt: d.CreatedAt,
	}
}
