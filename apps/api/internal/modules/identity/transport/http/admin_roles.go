package http

import (
	"context"
	"sort"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
)

type permissionGroup = struct {
	Name        string `json:"name"`
	Permissions []struct {
		Code        string `json:"code"`
		Description string `json:"description"`
	} `json:"permissions"`
}

func (h *Handler) ListPermissions(ctx context.Context, _ api.ListPermissionsRequestObject) (api.ListPermissionsResponseObject, error) {
	catalog, err := h.service.PermissionCatalog(ctx)
	if err != nil {
		return nil, mapAdminError(err)
	}
	names := make([]string, 0, len(catalog))
	for name := range catalog {
		names = append(names, name)
	}
	sort.Strings(names)

	groups := make([]permissionGroup, 0, len(names))
	for _, name := range names {
		g := permissionGroup{Name: name}
		for _, p := range catalog[name] {
			g.Permissions = append(g.Permissions, struct {
				Code        string `json:"code"`
				Description string `json:"description"`
			}{Code: p.Code, Description: p.Description})
		}
		groups = append(groups, g)
	}
	return api.ListPermissions200JSONResponse{Groups: groups}, nil
}

func (h *Handler) ListRoles(ctx context.Context, _ api.ListRolesRequestObject) (api.ListRolesResponseObject, error) {
	roles, err := h.service.ListRoles(ctx, tenantIDFromContext(ctx))
	if err != nil {
		return nil, mapAdminError(err)
	}
	data := make([]api.AdminRole, len(roles))
	for i, r := range roles {
		data[i] = toAPIAdminRole(r)
	}
	return api.ListRoles200JSONResponse{Data: data}, nil
}

func (h *Handler) CreateRole(ctx context.Context, request api.CreateRoleRequestObject) (api.CreateRoleResponseObject, error) {
	b := request.Body
	role, err := h.service.CreateRole(ctx, tenantIDFromContext(ctx), b.Slug, b.Name, strOf(b.Description))
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.CreateRole201JSONResponse(toAPIAdminRole(role)), nil
}

func (h *Handler) UpdateRole(ctx context.Context, request api.UpdateRoleRequestObject) (api.UpdateRoleResponseObject, error) {
	b := request.Body
	role, err := h.service.UpdateRole(ctx, tenantIDFromContext(ctx), request.RoleId, b.Slug, b.Name, strOf(b.Description))
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.UpdateRole200JSONResponse(toAPIAdminRole(role)), nil
}

func (h *Handler) DeleteRole(ctx context.Context, request api.DeleteRoleRequestObject) (api.DeleteRoleResponseObject, error) {
	if err := h.service.DeleteRole(ctx, tenantIDFromContext(ctx), request.RoleId); err != nil {
		return nil, mapAdminError(err)
	}
	return api.DeleteRole204Response{}, nil
}

func (h *Handler) ReplaceRolePermissions(ctx context.Context, request api.ReplaceRolePermissionsRequestObject) (api.ReplaceRolePermissionsResponseObject, error) {
	role, err := h.service.ReplaceRolePermissions(ctx, tenantIDFromContext(ctx), request.RoleId, request.Body.Permissions)
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.ReplaceRolePermissions200JSONResponse(toAPIAdminRole(role)), nil
}

func (h *Handler) ListDutyTypes(ctx context.Context, request api.ListDutyTypesRequestObject) (api.ListDutyTypesResponseObject, error) {
	includeInactive := request.Params.IncludeInactive != nil && *request.Params.IncludeInactive
	duties, err := h.service.ListDutyTypes(ctx, tenantIDFromContext(ctx), includeInactive)
	if err != nil {
		return nil, mapAdminError(err)
	}
	data := make([]api.DutyType, len(duties))
	for i, d := range duties {
		data[i] = toAPIDutyType(d)
	}
	return api.ListDutyTypes200JSONResponse{Data: data}, nil
}

func (h *Handler) CreateDutyType(ctx context.Context, request api.CreateDutyTypeRequestObject) (api.CreateDutyTypeResponseObject, error) {
	b := request.Body
	duty, err := h.service.CreateDutyType(ctx, tenantIDFromContext(ctx), b.Slug, b.Name, domain.DutyScopeKind(b.ScopeKind))
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.CreateDutyType201JSONResponse(toAPIDutyType(duty)), nil
}

func (h *Handler) UpdateDutyType(ctx context.Context, request api.UpdateDutyTypeRequestObject) (api.UpdateDutyTypeResponseObject, error) {
	b := request.Body
	duty, err := h.service.UpdateDutyType(ctx, tenantIDFromContext(ctx), request.DutyId, b.Name, domain.DutyScopeKind(b.ScopeKind), b.IsActive)
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.UpdateDutyType200JSONResponse(toAPIDutyType(duty)), nil
}

func (h *Handler) DeleteDutyType(ctx context.Context, request api.DeleteDutyTypeRequestObject) (api.DeleteDutyTypeResponseObject, error) {
	if err := h.service.DeleteDutyType(ctx, tenantIDFromContext(ctx), request.DutyId); err != nil {
		return nil, mapAdminError(err)
	}
	return api.DeleteDutyType204Response{}, nil
}

func (h *Handler) ReplaceDutyPermissions(ctx context.Context, request api.ReplaceDutyPermissionsRequestObject) (api.ReplaceDutyPermissionsResponseObject, error) {
	duty, err := h.service.ReplaceDutyPermissions(ctx, tenantIDFromContext(ctx), request.DutyId, request.Body.Permissions)
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.ReplaceDutyPermissions200JSONResponse(toAPIDutyType(duty)), nil
}

func (h *Handler) ListDutyAssignments(ctx context.Context, request api.ListDutyAssignmentsRequestObject) (api.ListDutyAssignmentsResponseObject, error) {
	p := request.Params
	items, err := h.service.ListDutyAssignments(ctx, tenantIDFromContext(ctx), p.AcademicYearId, nullUUID(p.DutyTypeId), nullUUID(p.UserId))
	if err != nil {
		return nil, mapAdminError(err)
	}
	data := make([]api.DutyAssignment, len(items))
	for i, a := range items {
		data[i] = toAPIDutyAssignment(a)
	}
	return api.ListDutyAssignments200JSONResponse{Data: data}, nil
}

func (h *Handler) ListStaffOptions(ctx context.Context, request api.ListStaffOptionsRequestObject) (api.ListStaffOptionsResponseObject, error) {
	limit := int32(20)
	if request.Params.Limit != nil {
		limit = int32(*request.Params.Limit) //nolint:gosec // bounded by the OpenAPI schema's minimum/maximum
	}
	search := ""
	if request.Params.Search != nil {
		search = *request.Params.Search
	}
	options, err := h.service.ListStaffOptions(ctx, tenantIDFromContext(ctx), search, limit)
	if err != nil {
		return nil, mapAdminError(err)
	}
	data := make([]api.UserOption, len(options))
	for i, o := range options {
		data[i] = api.UserOption{Id: o.ID, Name: o.Name}
	}
	return api.ListStaffOptions200JSONResponse{Data: data}, nil
}

func (h *Handler) CreateDutyAssignment(ctx context.Context, request api.CreateDutyAssignmentRequestObject) (api.CreateDutyAssignmentResponseObject, error) {
	b := request.Body
	created, err := h.service.CreateDutyAssignment(ctx, tenantIDFromContext(ctx), service.DutyAssignmentRecord{
		AcademicYearID: b.AcademicYearId, DutyTypeID: b.DutyTypeId, UserID: b.UserId,
		ScopeClassID: nullUUID(b.ScopeClassId), ScopeStudentID: nullUUID(b.ScopeStudentId),
		StartsOn: timeOfDate(b.StartsOn), EndsOn: timePtrOfDate(b.EndsOn), IsActive: true,
	})
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.CreateDutyAssignment201JSONResponse(toAPIDutyAssignment(created)), nil
}

func (h *Handler) UpdateDutyAssignment(ctx context.Context, request api.UpdateDutyAssignmentRequestObject) (api.UpdateDutyAssignmentResponseObject, error) {
	b := request.Body
	updated, err := h.service.UpdateDutyAssignment(ctx, tenantIDFromContext(ctx), request.AssignmentId, b.IsActive, timePtrOfDate(b.EndsOn))
	if err != nil {
		return nil, mapAdminError(err)
	}
	return api.UpdateDutyAssignment200JSONResponse(toAPIDutyAssignment(updated)), nil
}

func (h *Handler) DeleteDutyAssignment(ctx context.Context, request api.DeleteDutyAssignmentRequestObject) (api.DeleteDutyAssignmentResponseObject, error) {
	if err := h.service.DeleteDutyAssignment(ctx, tenantIDFromContext(ctx), request.AssignmentId); err != nil {
		return nil, mapAdminError(err)
	}
	return api.DeleteDutyAssignment204Response{}, nil
}
