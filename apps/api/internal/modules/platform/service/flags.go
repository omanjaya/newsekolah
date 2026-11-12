package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
)

// ListFlags reports which modules are on for a tenant, filling in every
// unlisted module as enabled: feature_flags is opt-out (a tenant with no
// row for a module still runs it), so the console must show that default
// explicitly rather than a silent gap.
func (s *Service) ListFlags(ctx context.Context, tenantID uuid.UUID) ([]domain.ModuleFlag, error) {
	if err := s.guard(); err != nil {
		return nil, err
	}
	if _, ok, err := s.repo.GetTenant(ctx, tenantID); err != nil {
		return nil, err
	} else if !ok {
		return nil, domain.ErrTenantNotFound
	}

	var stored []domain.ModuleFlag
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		stored, err = s.repo.ListFeatureFlags(ctx, tenantID)
		return err
	})
	if err != nil {
		return nil, err
	}

	byModule := make(map[string]bool, len(stored))
	for _, f := range stored {
		byModule[f.Module] = f.Enabled
	}
	out := make([]domain.ModuleFlag, len(domain.AllModules))
	for i, m := range domain.AllModules {
		enabled, ok := byModule[string(m)]
		if !ok {
			enabled = true
		}
		out[i] = domain.ModuleFlag{Module: string(m), Enabled: enabled}
	}
	return out, nil
}

// IsModuleEnabled is the enforcement point other modules call, through a
// wiring adapter, before running an operation gated by a feature flag
// (docs/12-roadmap.md Fase 6: "setiap modul masuk sebagai feature flag").
// Unlike ListFlags/SetFlag it is not guarded to multi-tenant mode: a
// single-tenant deployment still has one tenant row and its flags still
// apply, so a Fase 6 module stays toggleable even before Fase 3 ships.
func (s *Service) IsModuleEnabled(ctx context.Context, tenantID uuid.UUID, module string) (bool, error) {
	m := domain.Module(module)
	if !m.Valid() {
		return false, domain.ErrUnknownModule
	}
	var enabled bool
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		flags, err := s.repo.ListFeatureFlags(ctx, tenantID)
		if err != nil {
			return err
		}
		enabled = effectiveEnabled(flags, m)
		return nil
	})
	return enabled, err
}

// effectiveEnabled is a module's on/off state given a tenant's stored
// feature_flags rows: the row's value when there is one, otherwise on,
// because feature_flags is opt-out.
func effectiveEnabled(stored []domain.ModuleFlag, module domain.Module) bool {
	for _, f := range stored {
		if f.Module == string(module) {
			return f.Enabled
		}
	}
	return true
}

// StoredFlags returns the explicit feature_flags rows of a tenant as
// module -> enabled. A module absent from the map has no row and therefore
// runs (opt-out). It lets a caller cache a tenant's whole flag set with one
// read instead of one transaction per IsModuleEnabled call.
func (s *Service) StoredFlags(ctx context.Context, tenantID uuid.UUID) (map[string]bool, error) {
	var stored []domain.ModuleFlag
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		stored, err = s.repo.ListFeatureFlags(ctx, tenantID)
		return err
	})
	if err != nil {
		return nil, err
	}
	flags := make(map[string]bool, len(stored))
	for _, f := range stored {
		flags[f.Module] = f.Enabled
	}
	return flags, nil
}

// OnFlagChanged registers a callback run after SetFlag commits, so an
// in-process flag cache can drop the tenant's entry at once. Call it during
// wiring, before the service handles requests.
func (s *Service) OnFlagChanged(fn func(tenantID uuid.UUID)) {
	s.onFlagChanged = fn
}

// Audit vocabulary of a module flag change, shared by the platform console
// (SetFlag) and the operator CLI (SetFlagsForOperator) so every flag change
// reads the same in audit_logs: a tenant-scoped row, entity_id the tenant,
// before/after {module, enabled}.
const (
	flagAuditAction = "feature_flag.update"
	flagAuditEntity = "feature_flag"
)

// flagAuditSnapshot is the audit_logs before/after payload of one flag
// change: the module and its effective state (a module without a stored
// row is recorded as enabled, which is how it behaved).
type flagAuditSnapshot struct {
	Module  string `json:"module"`
	Enabled bool   `json:"enabled"`
}

// recordFlagChange writes the audit row of one module flag change inside
// the tenant transaction that made the change. The actor comes from ctx,
// read by platform/audit like every other entry: the console caller for
// SetFlag, nobody (actor_user_id NULL) for the operator CLI.
func recordFlagChange(ctx context.Context, tenantID uuid.UUID, m domain.Module, before, after bool) error {
	return audit.Record(ctx, tenantID, flagAuditAction, flagAuditEntity, tenantID,
		flagAuditSnapshot{Module: string(m), Enabled: before},
		flagAuditSnapshot{Module: string(m), Enabled: after})
}

// SetFlag enables or disables one module for a tenant. A call that changes
// the module's effective state writes one audit_logs row in the same
// transaction (see recordFlagChange); one that sets the state the module
// already had writes none, the same rule as the operator CLI. The flag-change
// observer is told either way, as before.
func (s *Service) SetFlag(ctx context.Context, tenantID uuid.UUID, module string, enabled bool) (domain.ModuleFlag, error) {
	if err := s.guard(); err != nil {
		return domain.ModuleFlag{}, err
	}
	m := domain.Module(module)
	if !m.Valid() {
		return domain.ModuleFlag{}, domain.ErrUnknownModule
	}
	if _, ok, err := s.repo.GetTenant(ctx, tenantID); err != nil {
		return domain.ModuleFlag{}, err
	} else if !ok {
		return domain.ModuleFlag{}, domain.ErrTenantNotFound
	}

	var flag domain.ModuleFlag
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		stored, err := s.repo.ListFeatureFlags(ctx, tenantID)
		if err != nil {
			return err
		}
		before := effectiveEnabled(stored, m)
		flag, err = s.repo.SetFeatureFlag(ctx, tenantID, m, enabled)
		if err != nil || before == flag.Enabled {
			return err
		}
		return recordFlagChange(ctx, tenantID, m, before, flag.Enabled)
	})
	if err == nil && s.onFlagChanged != nil {
		s.onFlagChanged(tenantID)
	}
	return flag, err
}
