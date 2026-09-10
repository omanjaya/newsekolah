package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
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
		enabled = true // feature_flags is opt-out: an unlisted module runs
		for _, f := range flags {
			if f.Module == module {
				enabled = f.Enabled
				break
			}
		}
		return nil
	})
	return enabled, err
}

// SetFlag enables or disables one module for a tenant.
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
		var err error
		flag, err = s.repo.SetFeatureFlag(ctx, tenantID, m, enabled)
		return err
	})
	return flag, err
}
