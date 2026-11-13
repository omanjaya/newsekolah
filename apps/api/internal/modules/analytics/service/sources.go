package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/domain"
)

// The feature-flag names of the two toggleable modules the early-warning
// signals come from (attendance is always on).
const (
	moduleDiscipline = "discipline"
	moduleGrading    = "grading"
)

// FlagReader answers whether a feature module is turned on for a tenant,
// adapted in internal/wiring from the platform console. The recompute's
// own reads are already gated by the wiring adapters (a switched-off
// module reports no signal); this reader covers results stored before the
// module was switched off, which are read back without that module's
// signals until the next recompute replaces them.
type FlagReader interface {
	IsModuleEnabled(ctx context.Context, tenantID uuid.UUID, module string) (bool, error)
}

// SetFlags attaches the flag reader; nil (the default) leaves both signal
// sources on.
func (s *Service) SetFlags(flags FlagReader) { s.flags = flags }

// signalSources reports which toggleable signal sources are off.
func (s *Service) signalSources(ctx context.Context, tenantID uuid.UUID) (disciplineOff, gradingOff bool, err error) {
	if s.flags == nil {
		return false, false, nil
	}
	discipline, err := s.flags.IsModuleEnabled(ctx, tenantID, moduleDiscipline)
	if err != nil {
		return false, false, err
	}
	grading, err := s.flags.IsModuleEnabled(ctx, tenantID, moduleGrading)
	if err != nil {
		return false, false, err
	}
	return !discipline, !grading, nil
}

// withoutDisabledSources rescores stored results as if a switched-off
// module had reported nothing, so a student is never shown at risk, or
// with a reason, because of a module the school no longer has. The stored
// rows are left untouched (the next recompute rewrites them anyway); the
// tenant's current policy decides the level, as it would on that recompute.
// Must run inside the caller's tenant transaction (it may load the policy).
func (s *Service) withoutDisabledSources(ctx context.Context, tenantID uuid.UUID, results []StoredResult) ([]StoredResult, error) {
	disciplineOff, gradingOff, err := s.signalSources(ctx, tenantID)
	if err != nil || (!disciplineOff && !gradingOff) || len(results) == 0 {
		return results, err
	}
	policy, err := s.loadPolicy(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	out := make([]StoredResult, len(results))
	for i, result := range results {
		signals := result.Signals
		if disciplineOff {
			signals.ActiveViolationCount, signals.DisciplinePoints, signals.WarningLetterCount = 0, 0, 0
		}
		if gradingOff {
			signals.HasGradeTrend, signals.PreviousAverage, signals.CurrentAverage = false, 0, 0
		}
		scored := domain.Score(signals, policy)
		result.Signals, result.Level, result.Score, result.Reasons = signals, scored.Level, scored.Score, scored.Reasons
		out[i] = result
	}
	return out, nil
}
