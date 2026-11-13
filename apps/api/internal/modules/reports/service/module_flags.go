package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
)

// ModuleKey is the reports module's own feature-flag name (the platform
// console's feature_flags.module value).
const ModuleKey = "reports"

// ErrSourceModuleDisabled is what a SourceModuleDisabledError matches with
// errors.Is: the report kind reads a module the tenant has turned off.
var ErrSourceModuleDisabled = errors.New("report source module disabled")

// SourceModuleDisabledError refuses a report kind whose source module is
// off, naming that module so the transport can report it the same way the
// central module gate does.
type SourceModuleDisabledError struct{ Module string }

func (e *SourceModuleDisabledError) Error() string {
	return "report source module " + e.Module + " is disabled"
}

func (e *SourceModuleDisabledError) Is(target error) bool { return target == ErrSourceModuleDisabled }

// FlagReader answers whether a feature module is turned on for a tenant,
// adapted in internal/wiring from the platform console so this module never
// imports the platform module. The reports module asks about two modules:
// reports itself (the scheduled-export job; HTTP operations are refused
// centrally), and the module that owns a report kind's data, for every
// place a kind is used.
type FlagReader interface {
	IsModuleEnabled(ctx context.Context, tenantID uuid.UUID, module string) (bool, error)
}

// SourceModule names the toggleable module whose data a report kind reads,
// or "" for a kind built only from always-on modules (attendance.daily).
// A kind whose source module is off is left out of the catalogue, refused
// when asked for directly, and skipped by the scheduled-export job.
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

// SetFlags attaches the feature-flag reader; nil (the default) leaves
// every source module on, matching feature_flags' opt-out rule.
func (s *Service) SetFlags(flags FlagReader) { s.flags = flags }

// moduleOn reports whether module is on for tenantID; a nil reader or an
// empty module name (an always-on source) counts as on.
func (s *Service) moduleOn(ctx context.Context, tenantID uuid.UUID, module string) (bool, error) {
	if s.flags == nil || module == "" {
		return true, nil
	}
	return s.flags.IsModuleEnabled(ctx, tenantID, module)
}

// RequireKindAvailable returns a *SourceModuleDisabledError when kind's
// source module is turned off for the tenant.
func (s *Service) RequireKindAvailable(ctx context.Context, tenantID uuid.UUID, kind Kind) error {
	module := SourceModule(kind)
	on, err := s.moduleOn(ctx, tenantID, module)
	if err != nil {
		return err
	}
	if !on {
		return &SourceModuleDisabledError{Module: module}
	}
	return nil
}

// AvailableCatalog is Catalog without the kinds whose source module is
// turned off for the tenant.
func (s *Service) AvailableCatalog(ctx context.Context, tenantID uuid.UUID) ([]Definition, error) {
	all := Catalog()
	out := make([]Definition, 0, len(all))
	for _, def := range all {
		err := s.RequireKindAvailable(ctx, tenantID, def.Kind)
		if errors.Is(err, ErrSourceModuleDisabled) {
			continue
		}
		if err != nil {
			return nil, err
		}
		out = append(out, def)
	}
	return out, nil
}

// moduleOn reports whether module is on for tenantID, through the same
// reader the catalogue uses.
func (s *ScheduleService) moduleOn(ctx context.Context, tenantID uuid.UUID, module string) (bool, error) {
	return s.reports.moduleOn(ctx, tenantID, module)
}
