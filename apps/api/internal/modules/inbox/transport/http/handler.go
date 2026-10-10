// Package http adapts the generated strict-server interface to the inbox
// service: DTO mapping only, per docs/03-layered-architecture.md section 1.
package http

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/inbox/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

type InboxHandler struct{ service *service.Service }

func New(svc *service.Service) *InboxHandler { return &InboxHandler{service: svc} }

func tenantID(ctx context.Context) uuid.UUID { id, _ := httpx.TenantIDFromContext(ctx); return id }
func userID(ctx context.Context) uuid.UUID   { id, _ := httpx.UserIDFromContext(ctx); return id }

func (h *InboxHandler) GetInboxCounts(ctx context.Context, _ api.GetInboxCountsRequestObject) (api.GetInboxCountsResponseObject, error) {
	counts, err := h.service.Counts(ctx, service.Caller{
		TenantID: tenantID(ctx), UserID: userID(ctx), KeyPermissions: authz.IdentityFromContext(ctx).KeyPermissions,
	})
	if err != nil {
		return nil, httpx.Internal(err)
	}
	return api.GetInboxCounts200JSONResponse{
		Leave: counts.Leave, Exit: counts.Exit, Late: counts.Late, WarningLetters: counts.WarningLetters, Total: counts.Total(),
	}, nil
}
