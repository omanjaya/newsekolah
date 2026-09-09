package http

import (
	"context"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
)

func (h *Handler) ListMyChildren(ctx context.Context, _ api.ListMyChildrenRequestObject) (api.ListMyChildrenResponseObject, error) {
	children, err := h.service.MyChildren(ctx, tenantIDFromContext(ctx), userIDFromContext(ctx))
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.ListMyChildren200JSONResponse{Data: toAPIChildren(children)}, nil
}

func (h *Handler) ListUserChildren(ctx context.Context, request api.ListUserChildrenRequestObject) (api.ListUserChildrenResponseObject, error) {
	children, err := h.service.MyChildren(ctx, tenantIDFromContext(ctx), request.UserId)
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.ListUserChildren200JSONResponse{Data: toAPIChildren(children)}, nil
}

func (h *Handler) LinkChild(ctx context.Context, request api.LinkChildRequestObject) (api.LinkChildResponseObject, error) {
	body := request.Body
	canApprove := body.CanApproveLeave != nil && *body.CanApproveLeave
	if err := h.service.LinkChild(ctx, tenantIDFromContext(ctx), request.UserId, body.StudentUserId, string(body.Relation), canApprove); err != nil {
		return nil, mapAdminError(err)
	}
	return api.LinkChild204Response{}, nil
}

func (h *Handler) UnlinkChild(ctx context.Context, request api.UnlinkChildRequestObject) (api.UnlinkChildResponseObject, error) {
	if err := h.service.UnlinkChild(ctx, tenantIDFromContext(ctx), request.UserId, request.StudentId); err != nil {
		return nil, mapAdminError(err)
	}
	return api.UnlinkChild204Response{}, nil
}

func (h *Handler) ListStudentGuardians(ctx context.Context, request api.ListStudentGuardiansRequestObject) (api.ListStudentGuardiansResponseObject, error) {
	guardians, err := h.service.GuardiansOf(ctx, tenantIDFromContext(ctx), request.StudentId)
	if err != nil {
		return nil, mapAdminError(err)
	}
	data := make([]api.Guardian, len(guardians))
	for i, g := range guardians {
		item := api.Guardian{ParentUserId: g.ParentUserID, ParentName: g.ParentName, Relation: api.ParentRelation(g.Relation), CanApproveLeave: g.CanApproveLeave}
		if g.Phone != "" {
			phone := g.Phone
			item.Phone = &phone
		}
		data[i] = item
	}
	return api.ListStudentGuardians200JSONResponse{Data: data}, nil
}

func toAPIChildren(children []service.Child) []api.LinkedChild {
	out := make([]api.LinkedChild, len(children))
	for i, c := range children {
		item := api.LinkedChild{
			StudentUserId: c.StudentUserID, StudentName: c.StudentName,
			Relation: api.ParentRelation(c.Relation), CanApproveLeave: c.CanApproveLeave,
		}
		if c.ClassID.Valid {
			id := openapi_types.UUID(c.ClassID.UUID)
			item.ClassId = &id
		}
		if c.ClassName != "" {
			name := c.ClassName
			item.ClassName = &name
		}
		out[i] = item
	}
	return out
}
