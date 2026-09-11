package http

import (
	"context"
	"crypto/subtle"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
)

func (h *AttendanceHandler) GetMonitorSnapshot(ctx context.Context, request api.GetMonitorSnapshotRequestObject) (api.GetMonitorSnapshotResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)

	configuredToken, configured, err := h.service.GetMonitorDisplayToken(ctx, tenantID)
	if err != nil {
		return nil, mapAttendanceError(err)
	}
	if !configured || subtle.ConstantTimeCompare([]byte(configuredToken), []byte(string(request.Params.XMonitorToken))) != 1 {
		return nil, errMonitorTokenInvalid
	}

	snapshot, err := h.service.GetMonitorSnapshot(ctx, tenantID)
	if err != nil {
		return nil, mapAttendanceError(err)
	}
	return api.GetMonitorSnapshot200JSONResponse(ToAPIMonitorSnapshot(snapshot)), nil
}

func (h *AttendanceHandler) GetMonitorPresence(ctx context.Context, _ api.GetMonitorPresenceRequestObject) (api.GetMonitorPresenceResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)

	count, keys := h.service.GetMonitorPresence(tenantID)
	if keys == nil {
		keys = []string{}
	}
	return api.GetMonitorPresence200JSONResponse{Count: count, Keys: keys}, nil
}
