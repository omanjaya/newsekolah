// Package http adapts the generated strict-server interface to the
// notifications service: inbox, preferences, quiet hours and digest
// settings, push device registration, and tenant channel defaults.
package http

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

type NotificationsHandler struct {
	service *service.Service
}

func New(svc *service.Service) *NotificationsHandler {
	return &NotificationsHandler{service: svc}
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
	domain.ErrNotificationNotFound: httpx.ErrNotificationNotFound,
	domain.ErrPushDeviceNotFound:   httpx.ErrPushDeviceNotFound,
	domain.ErrInvalidChannel:       httpx.ErrValidation,
	domain.ErrInvalidPlatform:      httpx.ErrValidation,
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

// Inbox.

func (h *NotificationsHandler) ListNotifications(ctx context.Context, request api.ListNotificationsRequestObject) (api.ListNotificationsResponseObject, error) {
	unreadOnly, cursor, limit := false, "", 0
	if request.Params.UnreadOnly != nil {
		unreadOnly = *request.Params.UnreadOnly
	}
	if request.Params.Cursor != nil {
		cursor = *request.Params.Cursor
	}
	if request.Params.Limit != nil {
		limit = *request.Params.Limit
	}
	page, err := h.service.List(ctx, tenantID(ctx), userID(ctx), unreadOnly, cursor, limit)
	if err != nil {
		return nil, mapError(err)
	}
	out := api.ListNotifications200JSONResponse{Data: make([]api.Notification, len(page.Items))}
	for i, n := range page.Items {
		out.Data[i] = toAPINotification(n)
	}
	out.Page.NextCursor = page.NextCursor
	return out, nil
}

func (h *NotificationsHandler) GetUnreadNotificationCount(ctx context.Context, _ api.GetUnreadNotificationCountRequestObject) (api.GetUnreadNotificationCountResponseObject, error) {
	n, err := h.service.UnreadCount(ctx, tenantID(ctx), userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetUnreadNotificationCount200JSONResponse{Count: int(n)}, nil
}

func (h *NotificationsHandler) MarkAllNotificationsRead(ctx context.Context, _ api.MarkAllNotificationsReadRequestObject) (api.MarkAllNotificationsReadResponseObject, error) {
	if err := h.service.MarkAllRead(ctx, tenantID(ctx), userID(ctx)); err != nil {
		return nil, mapError(err)
	}
	return api.MarkAllNotificationsRead204Response{}, nil
}

func (h *NotificationsHandler) MarkNotificationRead(ctx context.Context, request api.MarkNotificationReadRequestObject) (api.MarkNotificationReadResponseObject, error) {
	if err := h.service.MarkRead(ctx, tenantID(ctx), userID(ctx), request.NotificationId); err != nil {
		return nil, mapError(err)
	}
	return api.MarkNotificationRead204Response{}, nil
}

// Preferences and settings.

func (h *NotificationsHandler) ListNotificationPreferences(ctx context.Context, request api.ListNotificationPreferencesRequestObject) (api.ListNotificationPreferencesResponseObject, error) {
	kinds := parseKinds(request.Params.Kinds)
	if len(kinds) == 0 {
		return nil, httpx.ErrValidation
	}
	prefs, err := h.service.PreferencesForKinds(ctx, tenantID(ctx), userID(ctx), kinds)
	if err != nil {
		return nil, mapError(err)
	}
	out := api.ListNotificationPreferences200JSONResponse{}
	for kind, channels := range prefs {
		out[string(kind)] = toChannelMap(channels)
	}
	return out, nil
}

func (h *NotificationsHandler) SetNotificationPreference(ctx context.Context, request api.SetNotificationPreferenceRequestObject) (api.SetNotificationPreferenceResponseObject, error) {
	body := request.Body
	if strings.TrimSpace(body.Kind) == "" {
		return nil, httpx.ErrValidation
	}
	if err := h.service.SetPreference(ctx, tenantID(ctx), userID(ctx), domain.Kind(body.Kind), domain.Channel(body.Channel), body.Enabled); err != nil {
		return nil, mapError(err)
	}
	return api.SetNotificationPreference204Response{}, nil
}

func (h *NotificationsHandler) GetNotificationSettings(ctx context.Context, _ api.GetNotificationSettingsRequestObject) (api.GetNotificationSettingsResponseObject, error) {
	settings, err := h.service.GetSettings(ctx, tenantID(ctx), userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetNotificationSettings200JSONResponse(toAPISettings(settings)), nil
}

func (h *NotificationsHandler) UpdateNotificationSettings(ctx context.Context, request api.UpdateNotificationSettingsRequestObject) (api.UpdateNotificationSettingsResponseObject, error) {
	body := request.Body
	if !validHour(body.DigestHour) || !validHourPtr(body.QuietHoursStart) || !validHourPtr(body.QuietHoursEnd) {
		return nil, httpx.ErrValidation
	}
	if (body.QuietHoursStart == nil) != (body.QuietHoursEnd == nil) {
		return nil, httpx.ErrValidation
	}
	settings, err := h.service.UpdateSettings(ctx, tenantID(ctx), userID(ctx), service.SettingsUpdate{
		QuietHoursStart: body.QuietHoursStart, QuietHoursEnd: body.QuietHoursEnd,
		DigestEnabled: body.DigestEnabled, DigestHour: body.DigestHour,
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateNotificationSettings200JSONResponse(toAPISettings(settings)), nil
}

// Push devices.

func (h *NotificationsHandler) ListPushDevices(ctx context.Context, _ api.ListPushDevicesRequestObject) (api.ListPushDevicesResponseObject, error) {
	devices, err := h.service.ListPushDevices(ctx, tenantID(ctx), userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	out := api.ListPushDevices200JSONResponse{Data: make([]api.PushDevice, len(devices))}
	for i, d := range devices {
		out.Data[i] = toAPIDevice(d)
	}
	return out, nil
}

func (h *NotificationsHandler) RegisterPushDevice(ctx context.Context, request api.RegisterPushDeviceRequestObject) (api.RegisterPushDeviceResponseObject, error) {
	body := request.Body
	reg := service.PushDeviceRegistration{Platform: domain.Platform(body.Platform), TokenOrEndpoint: strings.TrimSpace(body.TokenOrEndpoint)}
	if reg.TokenOrEndpoint == "" {
		return nil, httpx.ErrValidation
	}
	if body.P256dh != nil {
		reg.P256dh = *body.P256dh
	}
	if body.AuthKey != nil {
		reg.AuthKey = *body.AuthKey
	}
	if body.DeviceName != nil {
		reg.DeviceName = *body.DeviceName
	}
	if reg.Platform == domain.PlatformWeb && (reg.P256dh == "" || reg.AuthKey == "") {
		return nil, httpx.ErrValidation
	}
	device, err := h.service.RegisterPushDevice(ctx, tenantID(ctx), userID(ctx), reg)
	if err != nil {
		return nil, mapError(err)
	}
	return api.RegisterPushDevice200JSONResponse(toAPIDevice(device)), nil
}

func (h *NotificationsHandler) UnregisterPushDevice(ctx context.Context, request api.UnregisterPushDeviceRequestObject) (api.UnregisterPushDeviceResponseObject, error) {
	if err := h.service.UnregisterPushDevice(ctx, tenantID(ctx), userID(ctx), request.Params.TokenOrEndpoint); err != nil {
		return nil, mapError(err)
	}
	return api.UnregisterPushDevice204Response{}, nil
}

// Tenant defaults.

func (h *NotificationsHandler) GetTenantNotificationDefaults(ctx context.Context, request api.GetTenantNotificationDefaultsRequestObject) (api.GetTenantNotificationDefaultsResponseObject, error) {
	kind := strings.TrimSpace(request.Params.Kind)
	if kind == "" {
		return nil, httpx.ErrValidation
	}
	channels, err := h.service.TenantChannelDefaults(ctx, tenantID(ctx), domain.Kind(kind))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetTenantNotificationDefaults200JSONResponse(toChannelMap(channels)), nil
}

func (h *NotificationsHandler) SetTenantNotificationDefault(ctx context.Context, request api.SetTenantNotificationDefaultRequestObject) (api.SetTenantNotificationDefaultResponseObject, error) {
	body := request.Body
	if strings.TrimSpace(body.Kind) == "" {
		return nil, httpx.ErrValidation
	}
	if err := h.service.SetTenantChannelDefault(ctx, tenantID(ctx), userID(ctx), domain.Kind(body.Kind), domain.Channel(body.Channel), body.Enabled); err != nil {
		return nil, mapError(err)
	}
	return api.SetTenantNotificationDefault204Response{}, nil
}

// Conversions.

func toAPINotification(n domain.Notification) api.Notification {
	out := api.Notification{Id: n.ID, Kind: string(n.Kind), Title: n.Title, Body: n.Body, ReadAt: n.ReadAt, CreatedAt: n.CreatedAt}
	if n.Href != "" {
		href := n.Href
		out.Href = &href
	}
	if len(n.Data) > 0 {
		data := n.Data
		out.Data = &data
	}
	return out
}

func toAPISettings(s service.Settings) api.NotificationSettings {
	return api.NotificationSettings{
		QuietHoursStart: s.QuietHoursStart, QuietHoursEnd: s.QuietHoursEnd,
		DigestEnabled: s.DigestEnabled, DigestHour: s.DigestHour,
	}
}

func toAPIDevice(d domain.PushDevice) api.PushDevice {
	return api.PushDevice{Id: d.ID, Platform: api.PushPlatform(d.Platform), DeviceName: d.DeviceName}
}

func toChannelMap(channels map[domain.Channel]bool) api.NotificationChannelMap {
	out := api.NotificationChannelMap{}
	for _, ch := range domain.AllChannels {
		enabled, ok := channels[ch]
		if !ok {
			enabled = domain.DefaultChannelEnabled(ch)
		}
		out[string(ch)] = enabled
	}
	return out
}

func parseKinds(raw string) []domain.Kind {
	parts := strings.Split(raw, ",")
	out := make([]domain.Kind, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, domain.Kind(p))
		}
	}
	return out
}

func validHour(h int) bool { return h >= 0 && h <= 23 }

func validHourPtr(h *int) bool { return h == nil || validHour(*h) }
