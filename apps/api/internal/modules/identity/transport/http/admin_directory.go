package http

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
)

const directoryPageSize = 100

// ListDirectoryUsers is the permission-light name lookup every signed-in
// user may call: schedule grids, substitute pickers and audience selectors
// need names for ids without exposing the admin user record. It pages
// through the admin listing internally so callers get one array.
func (h *Handler) ListDirectoryUsers(ctx context.Context, request api.ListDirectoryUsersRequestObject) (api.ListDirectoryUsersResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	p := request.Params

	limit := 200
	if p.Limit != nil {
		limit = *p.Limit
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
