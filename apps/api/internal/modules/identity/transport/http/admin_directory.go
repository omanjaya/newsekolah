package http

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
)

const directoryPageSize = 100

// maxDirectoryLimit mirrors the OpenAPI schema's maximum for the directory
// listing, enforced here too so a non-enforcing request validator cannot
// turn one request into an unbounded paging loop.
const maxDirectoryLimit = 5000

// ListDirectoryUsers is the permission-light name lookup every signed-in
// user may call: schedule grids, substitute pickers and audience selectors
// need names for ids without exposing the admin user record. It pages
// through the admin listing internally so callers get one array.
func (h *Handler) ListDirectoryUsers(ctx context.Context, request api.ListDirectoryUsersRequestObject) (api.ListDirectoryUsersResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	p := request.Params

	if p.Ids != nil {
		return h.lookupDirectoryByIDs(ctx, tenantID, *p.Ids)
	}

	limit := 200
	if p.Limit != nil {
		limit = min(max(*p.Limit, 1), maxDirectoryLimit)
	}
	filter := service.ListUsersFilter{Search: strOf(p.Q), Status: "active", Limit: directoryPageSize}
	if p.ProfileKind != nil {
		filter.ProfileKind = string(*p.ProfileKind)
	}

	data := make([]api.DirectoryUser, 0, limit)
	for len(data) < limit {
		result, err := h.service.ListUsers(ctx, tenantID, filter)
		if err != nil {
			return nil, mapAdminError(err)
		}
		for _, u := range result.Items {
			if len(data) == limit {
				break
			}
			entry := api.DirectoryUser{Id: u.ID, Name: u.Name, Username: u.Username}
			if u.ProfileKind != "" {
				kind := api.ProfileKind(u.ProfileKind)
				entry.ProfileKind = &kind
			}
			data = append(data, entry)
		}
		if result.NextCursor == uuid.Nil {
			break
		}
		filter.Cursor = result.NextCursor
	}
	return api.ListDirectoryUsers200JSONResponse{Data: data}, nil
}

// lookupDirectoryByIDs answers the id-to-name form of the directory listing:
// exactly the requested people of this school, in one indexed query.
// Every signed-in user may call it, students included, so the student
// number (personal data under UU PDP) is only returned to readers who may
// already see user records; for everyone else it fails closed.
func (h *Handler) lookupDirectoryByIDs(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) (api.ListDirectoryUsersResponseObject, error) {
	entries, err := h.service.LookupDirectory(ctx, tenantID, ids)
	if err != nil {
		return nil, mapAdminError(err)
	}
	perms, permErr := h.service.EffectivePermissions(ctx, tenantID, userIDFromContext(ctx))
	showNIS := permErr == nil && perms.Has(authz.PermViewUsers)
	data := make([]api.DirectoryUser, 0, len(entries))
	for _, e := range entries {
		entry := api.DirectoryUser{Id: e.ID, Name: e.Name, Username: e.Username}
		if e.ProfileKind != "" {
			kind := api.ProfileKind(e.ProfileKind)
			entry.ProfileKind = &kind
		}
		if showNIS {
			entry.Nis = strPtr(e.NIS)
		}
		data = append(data, entry)
	}
	return api.ListDirectoryUsers200JSONResponse{Data: data}, nil
}
