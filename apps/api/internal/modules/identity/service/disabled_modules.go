package service

import (
	"context"

	"github.com/google/uuid"
)

// DisabledModulesReader lists the feature modules the vendor switched off
// for a tenant. The wiring layer satisfies it, so identity does not import
// the platform module. A nil reader means nothing is disabled.
type DisabledModulesReader interface {
	DisabledModules(ctx context.Context, tenantID uuid.UUID) ([]string, error)
}

// DisabledModules returns the tenant's disabled module names, never nil. A
// lookup failure degrades to "none disabled": the central module gate still
// refuses the operations, and failing sign-in over a menu hint would be worse.
func (s *Service) DisabledModules(ctx context.Context, tenantID uuid.UUID) []string {
	if s.extras.Modules == nil {
		return []string{}
	}
	modules, err := s.extras.Modules.DisabledModules(ctx, tenantID)
	if err != nil || modules == nil {
		return []string{}
	}
	return modules
}
