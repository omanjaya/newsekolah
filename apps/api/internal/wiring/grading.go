package wiring

import (
	"context"

	"github.com/google/uuid"

	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	platformservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/service"
)

// GradingFlags reads the grading module's on/off state from the platform
// console's existing feature-flag storage, the same pattern billing and
// visitors already use.
type GradingFlags struct{ Platform *platformservice.Service }

func (f GradingFlags) IsModuleEnabled(ctx context.Context, tenantID uuid.UUID) (bool, error) {
	return f.Platform.IsModuleEnabled(ctx, tenantID, string(platformdomain.ModuleGrading))
}
