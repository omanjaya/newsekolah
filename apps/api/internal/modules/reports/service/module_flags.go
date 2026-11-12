package service

import (
	"context"

	"github.com/google/uuid"
)

// ModuleKey is the reports module's own feature-flag name (the platform
// console's feature_flags.module value).
const ModuleKey = "reports"

// FlagReader answers whether a feature module is turned on for a tenant,
// adapted in internal/wiring from the platform console so this module never
// imports the platform module. The scheduled-export job asks about two
// modules: reports itself, and the module that owns a report kind's data.
// HTTP operations are refused centrally and do not consult it.
type FlagReader interface {
	IsModuleEnabled(ctx context.Context, tenantID uuid.UUID, module string) (bool, error)
}

// SourceModule names the toggleable module whose data a report kind reads,
// or "" for a kind built only from always-on modules (attendance.daily).
// A scheduled export of a kind whose source module is off is skipped.
func SourceModule(kind Kind) string {
	switch kind {
	case KindDisciplinePoints, KindWarningLetters:
		return "discipline"
	case KindGradingReport:
		return "grading"
	case KindLeaveRequests, KindExitPermitsYearly:
		return "permits"
	default:
		return ""
	}
}

// moduleOn reports whether module is on for tenantID; a nil reader or an
// empty module name (an always-on source) counts as on.
func (s *ScheduleService) moduleOn(ctx context.Context, tenantID uuid.UUID, module string) (bool, error) {
	if s.flags == nil || module == "" {
		return true, nil
	}
	return s.flags.IsModuleEnabled(ctx, tenantID, module)
}
