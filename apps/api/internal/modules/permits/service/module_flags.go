package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

// moduleDiscipline is discipline's feature-flag name: a late arrival's
// reviewed violations are recorded there.
const moduleDiscipline = "discipline"

// ModuleFlags answers whether any feature module is turned on for a tenant
// (the platform console's flags, adapted in internal/wiring). permits
// consults it for the other modules it serves or feeds: discipline, for a
// late arrival's reviewed violations, and the owner module of each document
// template kind (document templates are shared infrastructure, not gated
// by permits' own flag).
type ModuleFlags interface {
	IsModuleEnabled(ctx context.Context, tenantID uuid.UUID, module string) (bool, error)
}

// SetModuleFlags attaches the any-module flag reader. Call it during
// wiring; nil (the default) leaves every module on.
func (s *Service) SetModuleFlags(flags ModuleFlags) {
	s.modules = flags
}

// moduleOn reports whether module is on for tenantID; a nil reader or an
// empty module name (an always-on owner) counts as on.
func (s *Service) moduleOn(ctx context.Context, tenantID uuid.UUID, module string) (bool, error) {
	if s.modules == nil || module == "" {
		return true, nil
	}
	return s.modules.IsModuleEnabled(ctx, tenantID, module)
}

// requireTemplateKind refuses a template kind whose owner module is
// switched off for the tenant.
func (s *Service) requireTemplateKind(ctx context.Context, tenantID uuid.UUID, kind domain.TemplateKind) error {
	module := kind.OwnerModule()
	on, err := s.moduleOn(ctx, tenantID, module)
	if err != nil {
		return err
	}
	if !on {
		return &domain.TemplateKindDisabledError{Module: module}
	}
	return nil
}

// availableTemplates drops the templates whose kind's owner module is
// switched off.
func (s *Service) availableTemplates(ctx context.Context, tenantID uuid.UUID, templates []domain.Template) ([]domain.Template, error) {
	out := make([]domain.Template, 0, len(templates))
	on := map[domain.TemplateKind]bool{}
	for _, t := range templates {
		available, seen := on[t.Kind]
		if !seen {
			var err error
			available, err = s.moduleOn(ctx, tenantID, t.Kind.OwnerModule())
			if err != nil {
				return nil, err
			}
			on[t.Kind] = available
		}
		if available {
			out = append(out, t)
		}
	}
	return out, nil
}

// reviewedViolations is the violation list a late-arrival review records:
// none while discipline is switched off, so nothing is written to
// discipline and nothing is kept on the flow's payload either.
func (s *Service) reviewedViolations(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) ([]uuid.UUID, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	on, err := s.moduleOn(ctx, tenantID, moduleDiscipline)
	if err != nil || !on {
		return nil, err
	}
	return ids, nil
}
