// Package http adapts the generated strict-server interface to the
// announcements service: decode, call, encode, map errors. No rules here.
package http

import (
	"context"
	"errors"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

type AnnouncementsHandler struct {
	service *service.Service
}

func New(svc *service.Service) *AnnouncementsHandler {
	return &AnnouncementsHandler{service: svc}
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
	domain.ErrNotFound:           httpx.ErrAnnouncementNotFound,
	domain.ErrInvalidStatus:      httpx.ErrAnnouncementInvalidState,
	domain.ErrScheduleNeedsStart: httpx.ErrAnnouncementInvalidState,
	domain.ErrAudienceEmpty:      httpx.ErrAnnouncementAudienceEmpty,
	domain.ErrInvalidAudience:    httpx.ErrValidation,
	domain.ErrInvalidInput:       httpx.ErrValidation,
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

// Admin side.

func (h *AnnouncementsHandler) ListAnnouncements(ctx context.Context, request api.ListAnnouncementsRequestObject) (api.ListAnnouncementsResponseObject, error) {
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
	page, err := h.service.List(ctx, tenantID(ctx), status, cursor, limit)
	if err != nil {
		return nil, mapError(err)
	}
	out := api.ListAnnouncements200JSONResponse{Data: make([]api.Announcement, len(page.Items))}
	for i, a := range page.Items {
		out.Data[i] = toAPI(a, nil)
	}
	out.Page.NextCursor = page.NextCursor
	return out, nil
}

func (h *AnnouncementsHandler) CreateAnnouncement(ctx context.Context, request api.CreateAnnouncementRequestObject) (api.CreateAnnouncementResponseObject, error) {
	a, err := h.service.Create(ctx, tenantID(ctx), userID(ctx), toInput(*request.Body))
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateAnnouncement201JSONResponse(toAPI(a, nil)), nil
}

func (h *AnnouncementsHandler) GetAnnouncement(ctx context.Context, request api.GetAnnouncementRequestObject) (api.GetAnnouncementResponseObject, error) {
	detail, err := h.service.Get(ctx, tenantID(ctx), request.AnnouncementId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetAnnouncement200JSONResponse(toAPI(detail.Announcement, &detail.ReadCount)), nil
}

func (h *AnnouncementsHandler) UpdateAnnouncement(ctx context.Context, request api.UpdateAnnouncementRequestObject) (api.UpdateAnnouncementResponseObject, error) {
	a, err := h.service.Update(ctx, tenantID(ctx), request.AnnouncementId, toInput(*request.Body))
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateAnnouncement200JSONResponse(toAPI(a, nil)), nil
}

func (h *AnnouncementsHandler) DeleteAnnouncement(ctx context.Context, request api.DeleteAnnouncementRequestObject) (api.DeleteAnnouncementResponseObject, error) {
	if err := h.service.Delete(ctx, tenantID(ctx), request.AnnouncementId); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteAnnouncement204Response{}, nil
}

func (h *AnnouncementsHandler) PublishAnnouncement(ctx context.Context, request api.PublishAnnouncementRequestObject) (api.PublishAnnouncementResponseObject, error) {
	a, err := h.service.Publish(ctx, tenantID(ctx), request.AnnouncementId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.PublishAnnouncement200JSONResponse(toAPI(a, nil)), nil
}

func (h *AnnouncementsHandler) ScheduleAnnouncement(ctx context.Context, request api.ScheduleAnnouncementRequestObject) (api.ScheduleAnnouncementResponseObject, error) {
	a, err := h.service.Schedule(ctx, tenantID(ctx), request.AnnouncementId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ScheduleAnnouncement200JSONResponse(toAPI(a, nil)), nil
}

func (h *AnnouncementsHandler) ArchiveAnnouncement(ctx context.Context, request api.ArchiveAnnouncementRequestObject) (api.ArchiveAnnouncementResponseObject, error) {
	a, err := h.service.Archive(ctx, tenantID(ctx), request.AnnouncementId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ArchiveAnnouncement200JSONResponse(toAPI(a, nil)), nil
}

// Reader side.

func (h *AnnouncementsHandler) ListMyAnnouncements(ctx context.Context, _ api.ListMyAnnouncementsRequestObject) (api.ListMyAnnouncementsResponseObject, error) {
	items, err := h.service.ListForUser(ctx, tenantID(ctx), userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	out := api.ListMyAnnouncements200JSONResponse{Data: make([]api.MyAnnouncement, len(items))}
	for i, it := range items {
		a := it.Announcement
		item := api.MyAnnouncement{Id: a.ID, Title: a.Title, BodyHtml: a.BodyHTML, IsPinned: a.IsPinned, IsRead: it.IsRead}
		if a.PublishedAt != nil {
			item.PublishedAt = *a.PublishedAt
		}
		out.Data[i] = item
	}
	return out, nil
}

func (h *AnnouncementsHandler) MarkAnnouncementRead(ctx context.Context, request api.MarkAnnouncementReadRequestObject) (api.MarkAnnouncementReadResponseObject, error) {
	if err := h.service.MarkRead(ctx, tenantID(ctx), userID(ctx), request.AnnouncementId); err != nil {
		return nil, mapError(err)
	}
	return api.MarkAnnouncementRead204Response{}, nil
}

// Conversions.

func toInput(body api.AnnouncementCreate) service.Input {
	in := service.Input{Title: body.Title, BodyHTML: body.BodyHtml, StartsAt: body.StartsAt, EndsAt: body.EndsAt}
	if body.IsPinned != nil {
		in.IsPinned = *body.IsPinned
	}
	in.Audience = domain.Audience{Type: domain.AudienceType(body.Audience.Type)}
	if body.Audience.RoleSlugs != nil {
		in.Audience.RoleSlugs = *body.Audience.RoleSlugs
	}
	if body.Audience.ClassIds != nil {
		in.Audience.ClassIDs = uuidsFromAPI(*body.Audience.ClassIds)
	}
	if body.Audience.UserIds != nil {
		in.Audience.UserIDs = uuidsFromAPI(*body.Audience.UserIds)
	}
	return in
}

func toAPI(a domain.Announcement, readCount *int64) api.Announcement {
	out := api.Announcement{
		Id: a.ID, Title: a.Title, BodyHtml: a.BodyHTML, BodyText: a.BodyText,
		Audience: toAPIAudience(a.Audience),
		IsPinned: a.IsPinned, Status: api.AnnouncementStatus(a.Status),
		StartsAt: a.StartsAt, EndsAt: a.EndsAt, PublishedAt: a.PublishedAt,
		RecipientCount: a.RecipientCount, CreatedAt: a.CreatedAt,
	}
	if readCount != nil {
		n := int(*readCount)
		out.ReadCount = &n
	}
	return out
}

func toAPIAudience(a domain.Audience) api.Audience {
	out := api.Audience{Type: api.AudienceType(a.Type)}
	if len(a.RoleSlugs) > 0 {
		slugs := a.RoleSlugs
		out.RoleSlugs = &slugs
	}
	if len(a.ClassIDs) > 0 {
		ids := uuidsToAPI(a.ClassIDs)
		out.ClassIds = &ids
	}
	if len(a.UserIDs) > 0 {
		ids := uuidsToAPI(a.UserIDs)
		out.UserIds = &ids
	}
	return out
}

func uuidsFromAPI(in []openapi_types.UUID) []uuid.UUID {
	out := make([]uuid.UUID, len(in))
	copy(out, in)
	return out
}

func uuidsToAPI(in []uuid.UUID) []openapi_types.UUID {
	out := make([]openapi_types.UUID, len(in))
	copy(out, in)
	return out
}
