package wiring

import (
	"context"

	"github.com/google/uuid"

	platformservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/service"
)

// PlatformFlags adapts the platform console's feature flags to the
// FlagChecker interface mentoring and supervision each declare, so
// neither Fase 6 module imports the platform module directly.
type PlatformFlags struct{ Svc *platformservice.Service }

func (f PlatformFlags) IsModuleEnabled(ctx context.Context, tenantID uuid.UUID, module string) (bool, error) {
	return f.Svc.IsModuleEnabled(ctx, tenantID, module)
}
